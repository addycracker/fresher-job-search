import { CompanyModel as Company, JobSourceModel as JobSource } from './cli-models.js';
import { sourceUrl, type SeedStore } from './seed.js';

export const mongoSeedStore: SeedStore = {
  async sourceOwner(source) {
    const existing = await JobSource.findOne(source).lean();
    return existing?.companyDomain ?? null;
  },
  async upsertCompany({ domain, name, website }) {
    const result = await Company.updateOne({ domain }, { $set: { name, website } }, { upsert: true, runValidators: true });
    return { inserted: result.upsertedCount > 0 };
  },
  async upsertSource(companyDomain, source) {
    // Include ownership in the filter: a concurrent ownership conflict fails
    // against the unique index instead of silently moving another company's board.
    await JobSource.updateOne({ ...source, companyDomain }, {
      $set: { url: sourceUrl(source) },
    }, { upsert: true, runValidators: true });
  },
};
