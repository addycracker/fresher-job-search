import assert from 'node:assert/strict';
import test from 'node:test';
import { JobModel, IngestionLeaseModel } from '../apps/job-ingestion/src/models.js';
import { JobSourceModel } from '../src/cli-models.js';
import { createIngestionStore } from '../apps/job-ingestion/src/store.js';
import type { IngestionSource, NormalizedJob } from '../apps/job-ingestion/src/types.js';

const source: IngestionSource = { id: '000000000000000000000001', companyDomain: 'fixture.test', provider: 'greenhouse', boardToken: 'synthetic-fixture' };
const job: NormalizedJob = { externalId: 'synthetic-job', title: 'Synthetic job', url: 'https://jobs.fixture.test/job', applyUrl: 'https://jobs.fixture.test/apply', location: '', employmentType: '', descriptionText: '', descriptionHtml: '', publishedAt: null };

test('Mongo jobs use a stable unique index and a Mongoose reference to JobSource', () => {
  assert.ok(JobModel.schema.indexes().some(([fields, options]) => fields.provider === 1 && fields.boardToken === 1 && fields.externalId === 1 && options.unique));
  assert.equal(JobModel.schema.path('source').options.ref, 'JobSource');
});

test('bulk upserts retain immutable first-seen values and use acknowledged write counts', async (t) => {
  const calls: unknown[][] = [];
  t.mock.method(JobModel, 'bulkWrite', async (...args: unknown[]) => { calls.push(args); return { upsertedCount: 1, modifiedCount: 0 }; });
  const at = new Date('2026-01-01');
  const result = await createIngestionStore(10).saveJobs(source, [job], at);
  assert.deepEqual(result, { inserted: 1, updated: 0 });
  const writes = calls[0]?.[0] as { updateOne: { filter: unknown; update: { $set: Record<string, unknown>; $max: unknown; $setOnInsert: Record<string, unknown> }; upsert: boolean } }[];
  assert.deepEqual(writes[0]?.updateOne.filter, { provider: 'greenhouse', boardToken: 'synthetic-fixture', externalId: 'synthetic-job' });
  assert.equal(writes[0]?.updateOne.update.$setOnInsert.firstSeenAt, at);
  assert.ok(!('firstSeenAt' in writes[0]!.updateOne.update.$set));
  assert.deepEqual(writes[0]?.updateOne.update.$max, { lastSeenAt: at });
});

test('failed synchronization does not overwrite lastSyncedAt or syncCursor', async (t) => {
  const calls: unknown[][] = [];
  t.mock.method(JobSourceModel, 'updateOne', async (...args: unknown[]) => { calls.push(args); return {}; });
  await createIngestionStore(10).fail(source);
  assert.deepEqual(calls[0]?.[1], { $set: { syncStatus: 'failed' } });
});

test('an existing active lease skips the source; release is scoped to the current owner', async (t) => {
  t.mock.method(IngestionLeaseModel, 'findOneAndUpdate', async () => { throw { code: 11000 }; });
  let filter: unknown;
  t.mock.method(IngestionLeaseModel, 'deleteOne', async (value: unknown) => { filter = value; return {}; });
  const store = createIngestionStore(10);
  assert.equal(await store.acquire(source, 'worker-one'), false);
  await store.release(source, 'worker-one');
  assert.deepEqual(filter, { source: source.id, owner: 'worker-one' });
});
