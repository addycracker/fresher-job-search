import assert from 'node:assert/strict';
import test from 'node:test';
import { runIngestion } from '../apps/job-ingestion/src/worker.js';
import type { IngestionDependencies, IngestionSource, NormalizedJob } from '../apps/job-ingestion/src/types.js';

const source: IngestionSource = { id: '000000000000000000000001', companyDomain: 'fixture.test', provider: 'greenhouse', boardToken: 'synthetic-fixture' };
const job: NormalizedJob = { externalId: 'synthetic-job', title: 'Synthetic job', url: 'https://jobs.fixture.test/job', applyUrl: 'https://jobs.fixture.test/job/apply', location: '', employmentType: '', descriptionText: '', descriptionHtml: '', publishedAt: null };

function fixture(sources = [source]) {
  const saved = new Map<string, NormalizedJob>();
  const calls: string[] = [];
  const deps: IngestionDependencies = {
    async *pages() { yield { jobs: [job, job], cursor: '1' }; },
    log() {},
    store: {
      async listSources() { return sources; },
      async companyExists() { return true; },
      async acquire() { calls.push('acquire'); return true; },
      async renew() { calls.push('renew'); },
      async saveJobs(current, jobs) {
        let inserted = 0;
        for (const record of jobs) {
          const key = `${current.provider}:${current.boardToken}:${record.externalId}`;
          if (!saved.has(key)) inserted++;
          saved.set(key, record);
        }
        calls.push('save');
        return { inserted, updated: jobs.length - inserted };
      },
      async progress() { calls.push('progress'); },
      async complete() { calls.push('complete'); },
      async fail() { calls.push('fail'); },
      async release() { calls.push('release'); },
    },
  };
  return { deps, calls, saved };
}
const run = (deps: IngestionDependencies, dryRun = false) => runIngestion({ dryRun, signal: new AbortController().signal }, deps);

test('worker persists unique provider job identities, reruns update existing rows and release leases', async () => {
  const f = fixture();
  const first = await run(f.deps);
  assert.equal(first.jobsInserted, 1);
  assert.equal(first.duplicatesSkipped, 1);
  assert.equal(first.sourcesCompleted, 1);
  const second = await run(f.deps);
  assert.equal(second.jobsUpdated, 1);
  assert.equal(f.saved.size, 1);
  assert.equal(f.calls.at(-1), 'release');
});

test('dry-run reads sources and fetches jobs without modifying jobs, leases or synchronization state', async () => {
  const f = fixture();
  const result = await run(f.deps, true);
  assert.equal(result.jobsPlanned, 1);
  assert.equal(result.jobsInserted, 0);
  assert.equal(f.saved.size, 0);
  assert.deepEqual(f.calls, []);
});

test('a source failure preserves prior work, never marks success, and does not stop the next source', async () => {
  const f = fixture([source, { ...source, id: '000000000000000000000002', boardToken: 'synthetic-second' }]);
  f.deps.pages = async function* (current) {
    if (current.id === source.id) {
      yield { jobs: [job], cursor: '1' };
      throw new Error('mock later page failure');
    }
    yield { jobs: [job], cursor: '1' };
  };
  const result = await run(f.deps);
  assert.equal(result.status, 'partial');
  assert.equal(result.sourcesFailed, 1);
  assert.equal(result.sourcesCompleted, 1);
  assert.equal(f.saved.size, 2);
  assert.equal(f.calls.filter((call) => call === 'complete').length, 1);
  assert.equal(f.calls.filter((call) => call === 'release').length, 2);
});

test('locked and orphan sources cannot produce writes', async () => {
  const locked = fixture();
  locked.deps.store.acquire = async () => false;
  assert.equal((await run(locked.deps)).sourcesLocked, 1);
  assert.equal(locked.saved.size, 0);
  const orphan = fixture();
  orphan.deps.store.companyExists = async () => false;
  const result = await run(orphan.deps);
  assert.equal(result.sourcesFailed, 1);
  assert.equal(result.errors[0]?.code, 'source_company_missing');
  assert.deepEqual(orphan.calls, []);
});

test('lost lease prevents job writes and cannot mark another task successful', async () => {
  const f = fixture();
  f.deps.store.renew = async () => { throw new Error('mock lost lease'); };
  const result = await run(f.deps);
  assert.equal(result.sourcesFailed, 1);
  assert.equal(f.saved.size, 0);
  assert.ok(!f.calls.includes('complete'));
  assert.ok(!f.calls.includes('fail'));
});

test('database errors and termination return failure summaries with lease cleanup', async () => {
  const f = fixture();
  f.deps.store.saveJobs = async () => { throw new Error('private database details'); };
  const failure = await run(f.deps);
  assert.equal(failure.status, 'failed');
  assert.ok(f.calls.includes('fail'));
  assert.ok(f.calls.includes('release'));
  assert.ok(!JSON.stringify(failure).includes('private database details'));
  const controller = new AbortController();
  const stopped = fixture();
  stopped.deps.pages = async function* () { controller.abort(); yield { jobs: [job], cursor: '1' }; };
  const result = await runIngestion({ dryRun: false, signal: controller.signal }, stopped.deps);
  assert.equal(result.status, 'stopped');
  assert.equal(stopped.saved.size, 0);
  assert.equal(stopped.calls.at(-1), 'release');
});
