import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanyModel, JobSourceModel } from '../src/cli-models.js';
import { mongoSeedStore } from '../src/mongo-seed-store.js';
import { validateDataset } from '../src/seed.js';

test('shared Mongo store reports insert/update outcomes and preserves sync metadata through narrow upserts', async (t) => {
  const calls: unknown[][] = [];
  t.mock.method(CompanyModel, 'updateOne', async (...args: unknown[]) => { calls.push(args); return { upsertedCount: calls.length === 1 ? 1 : 0 }; });
  t.mock.method(JobSourceModel, 'updateOne', async (...args: unknown[]) => { calls.push(args); return {}; });
  const record = validateDataset([{ name: 'Synthetic fixture', website: 'https://fixture.test', sources: [{ provider: 'greenhouse', boardToken: 'synthetic-fixture' }] }])[0]!;
  assert.deepEqual(await mongoSeedStore.upsertCompany(record), { inserted: true });
  assert.deepEqual(await mongoSeedStore.upsertCompany(record), { inserted: false });
  await mongoSeedStore.upsertSource(record.domain, record.sources[0]!);
  assert.deepEqual(calls[2], [
    { provider: 'greenhouse', boardToken: 'synthetic-fixture', companyDomain: 'fixture.test' },
    { $set: { url: 'https://boards.greenhouse.io/synthetic-fixture' } },
    { upsert: true, runValidators: true },
  ]);
});
