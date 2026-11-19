import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { providerNames, providerUrls } from '../../../src/providers.js';
import { message } from '../../../src/messages.js';
import { Budget } from './budget.js';
import { discoveryDefaults as settings, type DiscoveryConfig } from './config.js';
import { DiscoveryError, extractionSchema, fillPrompt, parseCandidates } from './llm.js';
import type { TokenUsage } from './types.js';

export interface GeminiClient {
  models: { generateContent(input: GenerateContentParameters): Promise<GenerateContentResponse> };
}

export function geminiRequestFailure(error: unknown, stage: 'search' | 'extraction', attempts: number) {
  const rawStatus = error !== null && typeof error === 'object' && 'status' in error ? error.status : undefined;
  const httpStatus = typeof rawStatus === 'number' && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined;
  let code = 'gemini_request_failed';
  let hint = message('geminiRequestFailed');
  // The SDK puts Google's JSON error body in Error.message. Inspect it locally,
  // but emit only known classifications, never raw messages or metadata.
  let reason: string | undefined;
  let serverMessage = '';
  if (error instanceof Error) {
    try {
      const parsed: unknown = JSON.parse(error.message);
      const payload = z.object({ error: z.object({
        message: z.string().optional(),
        details: z.array(z.object({ reason: z.string().optional() }).passthrough()).optional(),
      }).passthrough() }).safeParse(parsed);
      if (payload.success) {
        reason = payload.data.error.details?.find((detail) => detail.reason)?.reason;
        serverMessage = payload.data.error.message ?? '';
      }
    } catch { /* A non-JSON message is not logged. */ }
  }
  if (httpStatus === 402) {
    code = 'gemini_payment_required'; hint = message('geminiPaymentRequired');
  } else if (reason === 'API_KEY_INVALID' || reason === 'API_KEY_EXPIRED'
    || /api key (?:not valid|is invalid|expired)/i.test(serverMessage)) {
    code = 'gemini_api_key_invalid'; hint = message('geminiApiKeyInvalid');
  } else if (reason === 'SERVICE_DISABLED') {
    code = 'gemini_service_disabled'; hint = message('geminiServiceDisabled');
  } else if (reason === 'BILLING_DISABLED' || reason === 'BILLING_NOT_ACTIVE'
    || /(?:enable|set up|setup|activate) billing|billing (?:must be enabled|is disabled)|(?:requires?|need to (?:set up|setup)) (?:a )?paid plan/i.test(serverMessage)) {
    code = 'gemini_billing_required'; hint = message('geminiBillingRequired');
  } else if (/user location is not supported/i.test(serverMessage)) {
    code = 'gemini_region_unsupported'; hint = message('geminiRegionUnsupported');
  } else if (/search as tool.*api version/i.test(serverMessage)) {
    code = 'gemini_api_version_unsupported'; hint = message('geminiApiVersionUnsupported');
  } else if (httpStatus === 401 || httpStatus === 403) { code = 'gemini_access_denied'; hint = message('geminiAccessDenied'); }
  else if (httpStatus === 429) { code = 'gemini_quota_exceeded'; hint = message('geminiQuotaExceeded'); }
  else if (httpStatus === 404) { code = 'gemini_model_unavailable'; hint = message('geminiModelUnavailable'); }
  else if (httpStatus === 400) { code = 'gemini_invalid_request'; hint = message('geminiInvalidRequest'); }
  else if (httpStatus && httpStatus >= 500) { code = 'gemini_service_unavailable'; hint = message('geminiServiceUnavailable'); }
  else if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) { code = 'gemini_timeout'; hint = message('geminiTimeout'); }
  else if (error instanceof TypeError) { code = 'gemini_network_failed'; hint = message('geminiNetworkFailed'); }
  return new DiscoveryError(code, { stage, attempts, ...(httpStatus === undefined ? {} : { httpStatus }), hint });
}

export function createGeminiDiscovery(config: DiscoveryConfig, client?: GeminiClient) {
  const sdk = client ?? new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { apiVersion: config.geminiApiVersion, retryOptions: { attempts: 1 } } });
  return async (batchSize: number, budget: Budget, usage: TokenUsage): Promise<unknown[]> => {
    async function generate(input: GenerateContentParameters, stage: 'search' | 'extraction') {
      for (let attempt = 1; ; attempt++) {
        budget.check();
        try {
          const response = await sdk.models.generateContent({
            ...input,
            config: {
              ...input.config,
              abortSignal: budget.signal(config.requestTimeoutMs),
              httpOptions: { apiVersion: config.geminiApiVersion, timeout: Math.max(1, Math.floor(Math.min(config.requestTimeoutMs, budget.remaining()))), retryOptions: { attempts: 1 } },
              maxOutputTokens: settings.maxOutputTokens,
            },
          });
          if (response.usageMetadata) {
            usage.reportedCalls++;
            usage.promptTokens += response.usageMetadata.promptTokenCount ?? 0;
            usage.outputTokens += response.usageMetadata.candidatesTokenCount ?? 0;
            usage.totalTokens += response.usageMetadata.totalTokenCount ?? 0;
          }
          if (response.candidates?.[0]?.finishReason !== 'STOP') throw new DiscoveryError('gemini_incomplete');
          return response;
        } catch (error) {
          if (error instanceof DiscoveryError) throw error;
          const status = error !== null && typeof error === 'object' && 'status' in error ? error.status : undefined;
          const transient = error instanceof TypeError || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
            || (typeof status === 'number' && settings.retryHttpStatuses.includes(status));
          if (!transient || attempt >= settings.maxLLMAttempts) throw geminiRequestFailure(error, stage, attempt);
          await delay(Math.min(settings.retryDelayMs * attempt, budget.remaining()));
        }
      }
    }
    const variables = { batchSize, providers: providerNames.join(', '), boardUrls: Object.values(providerUrls).join(', ') };
    const grounded = await generate({
      model: config.model,
      contents: fillPrompt(settings.searchPrompt, variables),
      config: { tools: [{ googleSearch: {} }] },
    }, 'search');
    const metadata = grounded.candidates?.[0]?.groundingMetadata;
    if (!metadata?.webSearchQueries?.length || !metadata.groundingChunks?.some((chunk) => chunk.web?.uri)) {
      throw new DiscoveryError('gemini_grounding_missing');
    }
    const material = grounded.text;
    if (!material || material.length > settings.maxGroundedTextChars) throw new DiscoveryError('gemini_invalid_output');
    const structured = await generate({
      model: config.model,
      contents: fillPrompt(settings.extractPrompt, { ...variables, material: JSON.stringify(material) }),
      config: { responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(extractionSchema(batchSize), { target: 'draft-7' }) },
    }, 'extraction');
    return parseCandidates(structured.text ?? '', material, batchSize, 'gemini');
  };
}
