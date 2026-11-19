import assert from 'node:assert/strict';
import test from 'node:test';
import { GenerateContentResponse, FinishReason, type GenerateContentParameters } from '@google/genai';
import { createGeminiDiscovery, geminiRequestFailure, type GeminiClient } from '../apps/company-discovery/src/gemini.js';
import { DiscoveryError } from '../apps/company-discovery/src/llm.js';
import { readDiscoveryConfig } from '../apps/company-discovery/src/config.js';
import { Budget } from '../apps/company-discovery/src/budget.js';

const config = readDiscoveryConfig({ GEMINI_API_KEY: 'mock-only' });
const record = { name: 'Synthetic fixture', website: 'https://fixture.test', sources: [{ provider: 'greenhouse', boardToken: 'synthetic-fixture' }] };
const material = 'Synthetic fixture: https://fixture.test and https://boards.greenhouse.io/synthetic-fixture';

test('classifies Google HTTP 400 invalid-key errors without printing credentials or raw payloads', () => {
  const error = Object.assign(new Error(JSON.stringify({ error: {
    message: 'API key not valid. secret-never-log',
    details: [{ reason: 'API_KEY_INVALID', metadata: { key: 'secret-never-log' } }],
  } })), { status: 400 });
  const result = geminiRequestFailure(error, 'search', 1);
  assert.equal(result.code, 'gemini_api_key_invalid');
  assert.equal(result.diagnostic?.httpStatus, 400);
  assert.ok(!JSON.stringify(result).includes('secret-never-log'));
  assert.equal(geminiRequestFailure(Object.assign(new Error('unknown raw payload'), { status: 400 }), 'search', 1).code, 'gemini_invalid_request');
});

test('quota errors mentioning billing documentation are not classified as requiring a billing account', () => {
  const quota = Object.assign(new Error(JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan and billing details. For more information see billing documentation.' } })), { status: 429 });
  assert.equal(geminiRequestFailure(quota, 'search', 3).code, 'gemini_quota_exceeded');
  const billing = Object.assign(new Error(JSON.stringify({ error: { message: 'Please enable billing to use this feature.' } })), { status: 400 });
  assert.equal(geminiRequestFailure(billing, 'search', 1).code, 'gemini_billing_required');
});

test('HTTP 402 is reported as payment required without retrying or logging raw errors', async () => {
  let attempts = 0;
  const client: GeminiClient = { models: { async generateContent() {
    attempts++;
    throw Object.assign(new Error('private payment details'), { status: 402 });
  } } };
  const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0 };
  await assert.rejects(createGeminiDiscovery(config, client)(1, new Budget(() => 120000), usage), (error: unknown) => {
    assert.ok(error instanceof DiscoveryError);
    assert.equal(error.code, 'gemini_payment_required');
    assert.equal(error.diagnostic?.httpStatus, 402);
    assert.ok(!JSON.stringify(error).includes('private payment details'));
    return true;
  });
  assert.equal(attempts, 1);
});
function response(text: string, grounded = false) {
  const result = new GenerateContentResponse();
  result.candidates = [{ finishReason: FinishReason.STOP, content: { parts: [{ text }] },
    ...(grounded ? { groundingMetadata: { webSearchQueries: ['synthetic fixture'], groundingChunks: [{ web: { uri: 'https://fixture.test' } }] } } : {}),
  }];
  result.usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 };
  return result;
}

test('provider selection defaults to Gemini Flash-Lite and uses only the selected provider key', () => {
  assert.equal(config.provider, 'gemini');
  assert.equal(config.model, 'gemini-2.5-flash-lite');
  const openai = readDiscoveryConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'openai-mock', GEMINI_API_KEY: 'gemini-mock' });
  assert.equal(openai.apiKey, 'openai-mock');
  assert.equal(openai.model, 'gpt-5-mini');
  assert.throws(() => readDiscoveryConfig({ LLM_PROVIDER: 'gemini', OPENAI_API_KEY: 'wrong-provider-only' }));
  assert.throws(() => readDiscoveryConfig({ LLM_PROVIDER: 'unsupported', GEMINI_API_KEY: 'mock-only' }));
});

test('Gemini uses separate grounded search and JSON extraction with shared validation and token accounting', async () => {
  const calls: GenerateContentParameters[] = [];
  const client: GeminiClient = { models: { async generateContent(input) {
    calls.push(input);
    return calls.length === 1 ? response(material, true) : response(JSON.stringify({ candidates: [record] }));
  } } };
  const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0 };
  const result = await createGeminiDiscovery(config, client)(3, new Budget(() => 120000), usage);
  assert.deepEqual(result, [record]);
  assert.equal(calls[0]?.model, 'gemini-2.5-flash-lite');
  assert.deepEqual(calls[0]?.config?.tools, [{ googleSearch: {} }]);
  assert.equal(calls[1]?.config?.responseMimeType, 'application/json');
  assert.ok(calls[1]?.config?.responseJsonSchema);
  assert.ok(calls[0]?.config?.abortSignal instanceof AbortSignal);
  assert.equal(calls[0]?.config?.httpOptions?.apiVersion, 'v1beta');
  assert.equal(calls[1]?.config?.httpOptions?.apiVersion, 'v1beta');
  assert.deepEqual(usage, { promptTokens: 20, outputTokens: 10, totalTokens: 30, reportedCalls: 2 });
});

test('Gemini rejects missing grounding and malformed extraction', async () => {
  for (const [first, second, expected] of [
    [response(material), response('{"candidates":[]}'), 'gemini_grounding_missing'],
    [response(material, true), response('invalid json'), 'gemini_invalid_output'],
  ] as const) {
    let calls = 0;
    const client: GeminiClient = { models: { async generateContent() { return ++calls === 1 ? first : second; } } };
    const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0 };
    await assert.rejects(createGeminiDiscovery(config, client)(3, new Budget(() => 120000), usage), new RegExp(expected));
  }
});

test('Google Search API-version rejection has a safe, actionable diagnostic', () => {
  const error = Object.assign(new Error(JSON.stringify({ error: { message: 'Search as tool is not enabled for api version v1. Use api version v1beta instead.' } })), { status: 400 });
  assert.equal(geminiRequestFailure(error, 'search', 1).code, 'gemini_api_version_unsupported');
});

test('Gemini model-access diagnostics do not disclose raw SDK errors or fall back to another provider', async () => {
  let calls = 0;
  const client: GeminiClient = { models: { async generateContent() {
    calls++;
    throw Object.assign(new Error('credential-secret-never-log'), { status: 404 });
  } } };
  const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0 };
  await assert.rejects(createGeminiDiscovery(config, client)(3, new Budget(() => 120000), usage), (error: unknown) => {
    assert.ok(error instanceof DiscoveryError);
    assert.equal(error.code, 'gemini_model_unavailable');
    assert.equal(error.diagnostic?.httpStatus, 404);
    assert.equal(error.diagnostic?.stage, 'search');
    assert.ok(!JSON.stringify(error).includes('credential-secret-never-log'));
    return true;
  });
  assert.equal(calls, 1);
});
