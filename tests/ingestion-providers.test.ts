import assert from 'node:assert/strict';
import test from 'node:test';
import { createPageFetcher, normalizeJob } from '../apps/job-ingestion/src/providers.js';
import type { IngestionSource } from '../apps/job-ingestion/src/types.js';
import { ingestionDefaults } from '../apps/job-ingestion/src/config.js';

const source: IngestionSource = { id: '000000000000000000000001', companyDomain: 'fixture.test', provider: 'greenhouse', boardToken: 'synthetic-fixture' };
const greenhouse = { id: 123, title: 'Synthetic job', absolute_url: 'https://boards.fixture.test/job/123', content: '<p>Description</p>', location: { name: 'Test location' } };
const lever = (id: string) => ({ id, text: 'Synthetic job', hostedUrl: `https://jobs.fixture.test/${id}`, applyUrl: `https://jobs.fixture.test/${id}/apply`, categories: { location: 'Test location' }, descriptionPlain: 'Description' });
const ashby = { title: 'Synthetic job', jobUrl: 'https://jobs.fixture.test/synthetic-board/synthetic-job', applyUrl: 'https://jobs.fixture.test/synthetic-board/synthetic-job/apply', isListed: true, publishedAt: '2026-01-01T00:00:00.000Z' };
async function collect(provider: string, request: typeof fetch, signal = new AbortController().signal) {
  const pages = [];
  for await (const page of createPageFetcher(request)({ ...source, provider }, signal)) pages.push(page);
  return pages;
}

test('normalizes all three providers and derives an Ashby ID when the public response omits it', () => {
  assert.equal(normalizeJob('greenhouse', greenhouse)?.externalId, '123');
  assert.equal(normalizeJob('lever', lever('id-one'))?.descriptionText, 'Description');
  assert.equal(normalizeJob('ashby', ashby)?.externalId, 'synthetic-job');
  assert.equal(normalizeJob('ashby', { ...ashby, isListed: false }), null);
  assert.throws(() => normalizeJob('greenhouse', { ...greenhouse, absolute_url: 'javascript:alert(1)' }));
  assert.throws(() => normalizeJob('unknown', greenhouse));
});

test('Greenhouse requests full content and accepts an empty valid board', async () => {
  const pages = await collect('greenhouse', async (url) => {
    assert.equal(new URL(String(url)).searchParams.get('content'), 'true');
    return Response.json({ jobs: [greenhouse] });
  });
  assert.equal(pages[0]?.jobs.length, 1);
  assert.equal((await collect('greenhouse', async () => Response.json({ jobs: [] })))[0]?.jobs.length, 0);
});

test('Lever follows skip/limit pagination until the final short page', async () => {
  const offsets: string[] = [];
  const pages = await collect('lever', async (url) => {
    const endpoint = new URL(String(url));
    offsets.push(endpoint.searchParams.get('skip')!);
    assert.equal(endpoint.searchParams.get('limit'), String(ingestionDefaults.pageSize));
    return Response.json(offsets.length === 1 ? Array.from({ length: ingestionDefaults.pageSize }, (_, index) => lever(`id-${index}`)) : [lever('final-id')]);
  });
  assert.deepEqual(offsets, ['0', String(ingestionDefaults.pageSize)]);
  assert.equal(pages.length, 2);
  assert.equal(pages[1]?.jobs[0]?.externalId, 'final-id');
});

test('invalid tokens, malformed payloads and redirects fail without yielding jobs', async () => {
  for (const request of [
    (async () => Response.json({}, { status: 404 })) as typeof fetch,
    (async () => Response.json({}, { status: 302 })) as typeof fetch,
    (async () => new Response('not-json')) as typeof fetch,
    (async () => Response.json({ error: 'invalid board' })) as typeof fetch,
    (async () => Response.json({ jobs: [{ missing: true }] })) as typeof fetch,
  ]) await assert.rejects(collect('greenhouse', request));
});

test('transient provider failures retry within limits and a pre-aborted run makes no requests', async () => {
  let calls = 0;
  const result = await collect('greenhouse', async () => {
    if (++calls === 1) return Response.json({}, { status: 503 });
    return Response.json({ jobs: [greenhouse] });
  });
  assert.equal(calls, 2);
  assert.equal(result[0]?.jobs.length, 1);
  let attempts = 0;
  await assert.rejects(collect('greenhouse', async () => { attempts++; throw new TypeError('mock network'); }));
  assert.equal(attempts, ingestionDefaults.maxAttempts);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(collect('greenhouse', async () => { assert.fail('must not request'); }, controller.signal));
});
