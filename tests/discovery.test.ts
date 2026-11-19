import assert from 'node:assert/strict';
import test from 'node:test';
import { Budget } from '../apps/company-discovery/src/budget.js';
import { runDiscovery } from '../apps/company-discovery/src/discover.js';
import { createHandler } from '../apps/company-discovery/src/handler.js';
import { createBoardVerifier } from '../apps/company-discovery/src/verify.js';
import { readDiscoveryConfig } from '../apps/company-discovery/src/config.js';
import type { DiscoveryDependencies } from '../apps/company-discovery/src/types.js';
import { sourceIdentity, type CompanyRecord } from '../src/seed.js';

const config = readDiscoveryConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model' });
const budget = () => new Budget(() => 120000);
const candidate = (id: string) => ({
  name: `Synthetic fixture ${id}`, website: `https://${id}.test`,
  sources: [{ provider: 'greenhouse', boardToken: `synthetic-${id}` }],
});

function fixture(candidates: unknown[]) {
  const companies = new Map<string, CompanyRecord>();
  const sources = new Map<string, { owner: string; syncCursor: string }>();
  const lifecycle = { opened: 0, closed: 0 };
  const logs: Record<string, unknown>[] = [];
  const deps: DiscoveryDependencies = {
    provider: 'openai',
    async discover() { return candidates; },
    async verify() {},
    async openDatabase() { lifecycle.opened++; },
    async closeDatabase() { lifecycle.closed++; },
    log(event) { logs.push(event); },
    store: {
      async sourceOwner(source) { return sources.get(sourceIdentity(source))?.owner ?? null; },
      async upsertCompany(record) {
        const inserted = !companies.has(record.domain);
        companies.set(record.domain, record);
        return { inserted };
      },
      async upsertSource(domain, source) {
        const key = sourceIdentity(source);
        if (!sources.has(key)) sources.set(key, { owner: domain, syncCursor: 'preserve-me' });
      },
    },
  };
  return { deps, companies, sources, lifecycle, logs };
}

const run = (deps: DiscoveryDependencies, dryRun = false) => runDiscovery({ batchSize: 10, dryRun, budget: budget() }, deps);

test('inserts a verified company; reruns update the same identities and retain synchronization state', async () => {
  const f = fixture([candidate('one')]);
  const first = await run(f.deps);
  assert.equal(first.status, 'success');
  assert.equal(first.companiesInserted, 1);
  assert.equal(first.validBoards, 1);
  const second = await run(f.deps);
  assert.equal(second.companiesUpdated, 1);
  assert.equal(f.companies.size, 1);
  assert.equal(f.sources.size, 1);
  assert.equal([...f.sources.values()][0]?.syncCursor, 'preserve-me');
  assert.deepEqual(f.lifecycle, { opened: 2, closed: 2 });
});

test('dry-run verifies boards but never opens or writes to MongoDB', async () => {
  const f = fixture([candidate('one')]);
  let checked = 0;
  f.deps.verify = async () => { checked++; };
  const summary = await run(f.deps, true);
  assert.equal(checked, 1);
  assert.equal(summary.companiesPlanned, 1);
  assert.equal(summary.companiesInsertedOrUpdated, 0);
  assert.equal(f.companies.size, 0);
  assert.deepEqual(f.lifecycle, { opened: 0, closed: 0 });
});

test('rejects malformed candidates individually and continues the batch', async () => {
  const f = fixture([null, { name: 'missing fields' }, candidate('one')]);
  const summary = await run(f.deps);
  assert.equal(summary.candidatesDiscovered, 3);
  assert.equal(summary.failedCandidates, 2);
  assert.equal(summary.companiesInserted, 1);
  assert.equal(summary.status, 'partial');
  assert.ok(summary.errors.some((error) => error.code === 'candidate_invalid' && error.validationFields?.length));
});

test('rejects invalid ATS tokens and persists only verified sources from other candidates', async () => {
  const f = fixture([candidate('bad'), candidate('good')]);
  const verify = createBoardVerifier(config, async (url) =>
    String(url).includes('synthetic-bad') ? Response.json({}, { status: 404 }) : Response.json({ name: 'Synthetic fixture' }));
  f.deps.verify = verify;
  const summary = await run(f.deps);
  assert.equal(summary.invalidBoards, 1);
  assert.equal(summary.validBoards, 1);
  assert.equal(summary.failedCandidates, 1);
  assert.equal(summary.companiesInserted, 1);
  assert.ok(!f.companies.has('bad.test'));
});

test('unreachable ATS endpoints are never written', async () => {
  const f = fixture([candidate('one')]);
  let attempts = 0;
  f.deps.verify = createBoardVerifier(config, async () => { attempts++; throw new TypeError('secret transport details'); });
  const summary = await run(f.deps);
  assert.equal(attempts, 3);
  assert.equal(summary.invalidBoards, 1);
  assert.equal(summary.failedCandidates, 1);
  assert.equal(f.companies.size, 0);
  assert.equal(f.lifecycle.opened, 0);
  assert.ok(!JSON.stringify(f.logs).includes('secret transport details'));
});

test('duplicates use domains, even when names change; cross-company source conflicts are rejected', async () => {
  const first = candidate('one');
  const f = fixture([first, { ...first, name: 'Different fixture name' }, { ...candidate('two'), sources: first.sources }]);
  const summary = await run(f.deps);
  assert.equal(summary.duplicateRecords, 2);
  assert.equal(summary.failedCandidates, 1);
  assert.equal(f.companies.size, 1);
  assert.equal(summary.errors[0]?.code, 'source_ownership_conflict');
});

test('existing source ownership conflicts fail before company or source writes', async () => {
  const f = fixture([candidate('one')]);
  f.sources.set('greenhouse:synthetic-one', { owner: 'existing-owner.test', syncCursor: 'keep' });
  const summary = await run(f.deps);
  assert.equal(summary.companiesInsertedOrUpdated, 0);
  assert.equal(summary.failedCandidates, 1);
  assert.equal(summary.errors[0]?.code, 'source_ownership_conflict');
  assert.equal(f.sources.get('greenhouse:synthetic-one')?.owner, 'existing-owner.test');
});

test('one invalid source does not prevent saving another verified source for the same company', async () => {
  const record = candidate('one');
  record.sources.push({ provider: 'lever', boardToken: 'synthetic-other' });
  const f = fixture([record]);
  f.deps.verify = async (source) => { if (source.provider === 'lever') throw new Error(); };
  const summary = await run(f.deps);
  assert.equal(summary.invalidBoards, 1);
  assert.equal(summary.validBoards, 1);
  assert.equal(f.sources.size, 1);
  assert.equal(f.companies.get('one.test')?.sources.length, 1);
});

test('database write failure does not prevent a later candidate from succeeding', async () => {
  const f = fixture([candidate('bad'), candidate('good')]);
  const write = f.deps.store.upsertCompany;
  f.deps.store.upsertCompany = async (record) => {
    if (record.domain === 'bad.test') throw new Error('private database details');
    return write(record);
  };
  const summary = await run(f.deps);
  assert.equal(summary.failedCandidates, 1);
  assert.equal(summary.companiesInserted, 1);
  assert.equal(summary.errors[0]?.code, 'database_write_failed');
  assert.equal(f.lifecycle.closed, 1);
  assert.ok(!JSON.stringify(f.logs).includes('private database details'));
});

test('failed database initialization stops further writes and still disconnects', async () => {
  const f = fixture([candidate('one'), candidate('two')]);
  f.deps.openDatabase = async () => { throw new Error('mock connection failure'); };
  const summary = await run(f.deps);
  assert.equal(summary.status, 'failed');
  assert.equal(summary.failedCandidates, 1);
  assert.equal(summary.skippedCandidates, 1);
  assert.equal(f.lifecycle.closed, 1);
  assert.equal(f.companies.size, 0);
});

test('deadline awareness returns a summary without starting external work', async () => {
  const f = fixture([]);
  f.deps.discover = async () => { assert.fail('discovery must not start'); };
  const summary = await runDiscovery({ batchSize: 10, dryRun: true, budget: new Budget(() => 1) }, f.deps);
  assert.equal(summary.errors[0]?.code, 'deadline_reached');
  assert.equal(summary.status, 'failed');
});

test('handler validates event, defaults to dry-run and blocks unapproved write mode', async (t) => {
  t.mock.method(console, 'log', () => {});
  const f = fixture([candidate('one')]);
  const handler = createHandler(() => f.deps, () => ({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model' }));
  assert.equal((await handler({ batchSize: 0 })).errors[0]?.code, 'invalid_event');
  assert.equal((await handler({ dryRun: false })).errors[0]?.code, 'writes_disabled');
  assert.equal((await handler({})).companiesPlanned, 1);
  assert.equal(f.companies.size, 0);
});
