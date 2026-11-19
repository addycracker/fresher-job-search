import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Response, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { setTimeout as delay } from 'node:timers/promises';
import { providerNames, providerUrls } from '../../../src/providers.js';
import { message } from '../../../src/messages.js';
import { Budget } from './budget.js';
import { discoveryDefaults as settings, type DiscoveryConfig } from './config.js';
import type { TokenUsage } from './types.js';
import { DiscoveryError as OpenAIDiscoveryError, extractionSchema, fillPrompt, parseCandidates } from './llm.js';

export { DiscoveryError as OpenAIDiscoveryError } from './llm.js';

function requestFailure(error: unknown, stage: 'search' | 'extraction', attempts: number) {
  const rawStatus = error !== null && typeof error === 'object' && 'status' in error ? error.status : undefined;
  const httpStatus = typeof rawStatus === 'number' && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined;
  let code = 'openai_request_failed';
  let hint = message('openaiRequestFailed');
  if (httpStatus === 401 || httpStatus === 403) { code = 'openai_access_denied'; hint = message('openaiAccessDenied'); }
  else if (httpStatus === 429) { code = 'openai_quota_exceeded'; hint = message('openaiQuotaExceeded'); }
  else if (httpStatus === 404) { code = 'openai_model_unavailable'; hint = message('openaiModelUnavailable'); }
  else if (httpStatus === 400) { code = 'openai_invalid_request'; hint = message('openaiInvalidRequest'); }
  else if (httpStatus && httpStatus >= 500) { code = 'openai_service_unavailable'; hint = message('openaiServiceUnavailable'); }
  else if (error instanceof OpenAI.APIConnectionTimeoutError || error instanceof OpenAI.APIUserAbortError
    || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) {
    code = 'openai_timeout'; hint = message('openaiTimeout');
  } else if (error instanceof TypeError || error instanceof OpenAI.APIConnectionError) {
    code = 'openai_network_failed'; hint = message('openaiNetworkFailed');
  }
  return new OpenAIDiscoveryError(code, { stage, attempts, ...(httpStatus === undefined ? {} : { httpStatus }), hint });
}

export interface OpenAIClient {
  responses: { create(input: ResponseCreateParamsNonStreaming, options?: OpenAI.RequestOptions): Promise<Response> };
}

function recordUsage(response: Response, usage: TokenUsage) {
  if (!response.usage) return;
  usage.reportedCalls++;
  usage.promptTokens += response.usage.input_tokens;
  usage.outputTokens += response.usage.output_tokens;
  usage.totalTokens += response.usage.total_tokens;
}

export function createOpenAIDiscovery(config: DiscoveryConfig, client?: OpenAIClient) {
  const sdk: OpenAIClient = client ?? new OpenAI({ apiKey: config.apiKey, maxRetries: 0 });
  return async (batchSize: number, budget: Budget, usage: TokenUsage): Promise<unknown[]> => {
    async function generate(input: ResponseCreateParamsNonStreaming, stage: 'search' | 'extraction') {
      for (let attempt = 1; ; attempt++) {
        budget.check();
        try {
          const response = await sdk.responses.create({
            ...input,
            store: false,
            stream: false,
            max_output_tokens: settings.maxOutputTokens,
          }, {
            signal: budget.signal(config.requestTimeoutMs),
            timeout: Math.max(1, Math.floor(Math.min(config.requestTimeoutMs, budget.remaining()))),
            maxRetries: 0,
          });
          recordUsage(response, usage);
          if (response.status !== 'completed') throw new OpenAIDiscoveryError('openai_incomplete');
          return response;
        } catch (error) {
          if (error instanceof OpenAIDiscoveryError) throw error;
          const status = error !== null && typeof error === 'object' && 'status' in error ? error.status : undefined;
          const transient = error instanceof TypeError || error instanceof OpenAI.APIConnectionError
            || (error instanceof Error && ['TimeoutError', 'AbortError', 'APIConnectionTimeoutError', 'APIUserAbortError'].includes(error.name))
            || (typeof status === 'number' && settings.retryHttpStatuses.includes(status));
          if (!transient || attempt >= settings.maxLLMAttempts) throw requestFailure(error, stage, attempt);
          await delay(Math.min(settings.retryDelayMs * attempt, budget.remaining()));
        }
      }
    }

    const variables = { batchSize, providers: providerNames.join(', '), boardUrls: Object.values(providerUrls).join(', ') };
    const grounded = await generate({
      model: config.model,
      input: fillPrompt(settings.searchPrompt, variables),
      tools: [{ type: 'web_search', external_web_access: true }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
    }, 'search');
    const searched = grounded.output.some((item) => item.type === 'web_search_call' && item.status === 'completed');
    const cited = grounded.output.some((item) => item.type === 'message' && item.content.some((part) =>
      part.type === 'output_text' && part.annotations.some((annotation) => annotation.type === 'url_citation')));
    if (!searched || !cited) throw new OpenAIDiscoveryError('openai_grounding_missing');
    const material = grounded.output_text;
    if (!material || material.length > settings.maxGroundedTextChars) throw new OpenAIDiscoveryError('openai_invalid_output');

    const outputSchema = extractionSchema(batchSize);
    const structured = await generate({
      model: config.model,
      input: fillPrompt(settings.extractPrompt, { ...variables, material: JSON.stringify(material) }),
      text: { format: zodTextFormat(outputSchema, 'company_candidates') },
    }, 'extraction');
    return parseCandidates(structured.output_text, material, batchSize, 'openai');
  };
}
