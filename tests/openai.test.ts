import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type OpenAI from 'openai';
import { createOpenAIDiscovery, OpenAIDiscoveryError, type OpenAIClient } from '../apps/company-discovery/src/openai.js';
import { readDiscoveryConfig } from '../apps/company-discovery/src/config.js';
import { Budget } from '../apps/company-discovery/src/budget.js';
import { RejectedCandidate } from '../apps/company-discovery/src/llm.js';

const config = readDiscoveryConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model' });
const record = { name: 'Synthetic fixture', website: 'https://fixture.test', sources: [{ provider: 'greenhouse', boardToken: 'synthetic-fixture' }] };
const material = 'Synthetic fixture: https://fixture.test and https://boards.greenhouse.io/synthetic-fixture';
function response(text: string, grounded = false): Response {
  return {
    id: 'resp_mock', object: 'response', status: 'completed', output_text: text,
    output: [
      ...(grounded ? [{ id: 'search_mock', type: 'web_search_call', status: 'completed', action: { type: 'search', query: 'synthetic fixture' } }] : []),
      { id: 'message_mock', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: grounded ? [{ type: 'url_citation', url: 'https://fixture.test', title: 'Synthetic fixture', start_index: 0, end_index: text.length }] : [] }] },
    ],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  } as Response;
}

async function execute(second: Response, first = response(material, true)) {
  const calls: { input: ResponseCreateParamsNonStreaming; options?: OpenAI.RequestOptions }[] = [];
  const client: OpenAIClient = { responses: { async create(input, options) {
    calls.push({ input, options }); return calls.length === 1 ? first : second;
  } } };
  const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0 };
  const result = await createOpenAIDiscovery(config, client)(10, new Budget(() => 120000), usage);
  return { result, calls, usage };
}

test('uses required live web search then strict structured extraction, with timeout and usage totals', async () => {
  const { result, calls, usage } = await execute(response(JSON.stringify({ candidates: [record] })));
  assert.deepEqual(result, [record]);
  assert.deepEqual(calls[0]?.input.tools, [{ type: 'web_search', external_web_access: true }]);
  assert.equal(calls[0]?.input.tool_choice, 'required');
  assert.equal(calls[1]?.input.text?.format?.type, 'json_schema');
  assert.ok(calls[0]?.options?.signal instanceof AbortSignal);
  assert.equal(calls[0]?.options?.maxRetries, 0);
  assert.equal(calls[0]?.input.store, false);
  assert.deepEqual(usage, { promptTokens: 20, outputTokens: 10, totalTokens: 30, reportedCalls: 2 });
});

test('rejects malformed output, missing grounding, incomplete responses and uncited search output', async () => {
  for (const text of ['not-json', '{}', JSON.stringify({ candidates: Array(11).fill(record) })]) {
    await assert.rejects(execute(response(text)), OpenAIDiscoveryError);
  }
  await assert.rejects(execute(response('{"candidates":[]}'), response(material)), /openai_grounding_missing/);
  const incomplete = response(material, true);
  incomplete.status = 'incomplete';
  await assert.rejects(execute(response('{"candidates":[]}'), incomplete), /openai_incomplete/);
  const uncited = response(material, true);
  const output = uncited.output.find((item) => item.type === 'message');
  if (output?.type === 'message' && output.content[0]?.type === 'output_text') output.content[0].annotations = [];
  await assert.rejects(execute(response('{"candidates":[]}'), uncited), /openai_grounding_missing/);
});

test('rejects extraction-invented URLs and retains malformed candidates for individual rejection', async () => {
  const result = await execute(response(JSON.stringify({ candidates: [{ missing: true }, { ...record, website: 'https://invented.test' }] })));
  assert.deepEqual(result.result, [{ missing: true }, new RejectedCandidate('candidate_evidence_missing')]);
  const substring = await execute(response(JSON.stringify({ candidates: [record] })), response(material + '-different-token', true));
  assert.deepEqual(substring.result, [new RejectedCandidate('candidate_evidence_missing')]);
});

test('retries transient failures but not authentication errors', async () => {
  let attempts = 0;
  const client: OpenAIClient = { responses: { async create() {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('not logged'), { status: 503 });
    return attempts === 2 ? response(material, true) : response('{"candidates":[]}');
  } } };
  const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0 };
  await createOpenAIDiscovery(config, client)(10, new Budget(() => 120000), usage);
  assert.equal(attempts, 3);
  let authAttempts = 0;
  const denied: OpenAIClient = { responses: { async create() { authAttempts++; throw Object.assign(new Error('private'), { status: 401 }); } } };
  await assert.rejects(createOpenAIDiscovery(config, denied)(10, new Budget(() => 120000), usage), /openai_access_denied/);
  assert.equal(authAttempts, 1);
});

test('diagnostics expose safe HTTP status and stage without raw SDK messages or credentials', async () => {
  for (const [status, expected] of [[400, 'openai_invalid_request'], [403, 'openai_access_denied'], [404, 'openai_model_unavailable']] as const) {
    const client: OpenAIClient = { responses: { async create() { throw Object.assign(new Error('credential-secret-do-not-log'), { status }); } } };
    const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0 };
    await assert.rejects(createOpenAIDiscovery(config, client)(3, new Budget(() => 120000), usage), (error: unknown) => {
      assert.ok(error instanceof OpenAIDiscoveryError);
      assert.equal(error.code, expected);
      assert.equal(error.diagnostic?.stage, 'search');
      assert.equal(error.diagnostic?.httpStatus, status);
      assert.equal(error.diagnostic?.attempts, 1);
      assert.ok(!JSON.stringify(error).includes('credential-secret-do-not-log'));
      return true;
    });
  }
});
