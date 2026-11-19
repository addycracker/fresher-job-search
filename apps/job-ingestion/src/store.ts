import { CompanyModel, JobSourceModel } from '../../../src/cli-models.js';
import { Types } from 'mongoose';
import { companySchema } from '../../../src/seed.js';
import { JobModel, IngestionLeaseModel } from './models.js';
import { ingestionDefaults } from './config.js';
import { IngestionError } from './providers.js';
import type { IngestionStore } from './types.js';

export function createIngestionStore(maxSources: number): IngestionStore {
  return {
    async listSources() {
      const sources = await JobSourceModel.find().sort({ _id: 1 }).limit(maxSources).lean();
      return sources.map((source) => {
        const identity = companySchema.shape.sources.element.parse({ provider: source.provider, boardToken: source.boardToken });
        return { ...identity, id: source._id.toString(), companyDomain: source.companyDomain };
      });
    },
    async companyExists(domain) { return Boolean(await CompanyModel.exists({ domain })); },
    async acquire(source, owner) {
      const now = new Date();
      try {
        await IngestionLeaseModel.findOneAndUpdate({
          source: source.id, $or: [{ expiresAt: { $lte: now } }, { owner }],
        }, { $set: { owner, expiresAt: new Date(now.getTime() + ingestionDefaults.leaseMs) } }, { upsert: true });
        return true;
      } catch (error) {
        if (error !== null && typeof error === 'object' && 'code' in error && error.code === 11000) return false;
        throw error;
      }
    },
    async renew(source, owner) {
      const now = new Date();
      const result = await IngestionLeaseModel.updateOne({ source: source.id, owner, expiresAt: { $gt: now } }, {
        $set: { expiresAt: new Date(now.getTime() + ingestionDefaults.leaseMs) },
      });
      if (!result.matchedCount) throw new IngestionError('source_lease_lost');
    },
    async saveJobs(source, jobs, seenAt) {
      if (!jobs.length) return { inserted: 0, updated: 0 };
      const result = await JobModel.bulkWrite(jobs.map(({ externalId, ...fields }) => ({ updateOne: {
        filter: { provider: source.provider, boardToken: source.boardToken, externalId },
        update: {
          $set: fields,
          $max: { lastSeenAt: seenAt },
          $setOnInsert: { source: new Types.ObjectId(source.id), companyDomain: source.companyDomain, firstSeenAt: seenAt },
        },
        upsert: true,
      } })), { ordered: false });
      return { inserted: result.upsertedCount, updated: result.modifiedCount };
    },
    async progress(source, cursor) {
      await JobSourceModel.updateOne({ _id: source.id, companyDomain: source.companyDomain }, { $set: { syncStatus: 'running', syncCursor: cursor } });
    },
    async complete(source, at) {
      await JobSourceModel.updateOne({ _id: source.id, companyDomain: source.companyDomain }, {
        $set: { syncStatus: 'succeeded', lastSyncedAt: at }, $unset: { syncCursor: 1 },
      });
    },
    async fail(source) {
      await JobSourceModel.updateOne({ _id: source.id, companyDomain: source.companyDomain }, { $set: { syncStatus: 'failed' } });
    },
    async release(source, owner) { await IngestionLeaseModel.deleteOne({ source: source.id, owner }); },
  };
}
