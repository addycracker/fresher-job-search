import { z } from 'zod';
import defaults from '../../../config/company-discovery.json' with { type: 'json' };
import { message } from '../../../src/messages.js';

export const discoveryDefaults = defaults;

export function readDiscoveryConfig(env: NodeJS.ProcessEnv = process.env) {
  const number = (value: string | undefined, fallback: number) => value === undefined ? fallback : Number(value);
  const provider = z.enum(['gemini', 'openai']).parse(env.LLM_PROVIDER ?? defaults.defaultProvider);
  return z.strictObject({
    provider: z.enum(['gemini', 'openai']),
    apiKey: z.string().trim().min(1, message('discoveryApiKeyRequired')),
    model: z.string().trim().min(1, message('discoveryModelRequired')),
    geminiApiVersion: z.string().regex(/^v\d+(?:alpha|beta)?$/),
    batchSize: z.number().int().min(1).max(defaults.maxBatchSize),
    executionTimeoutMs: z.number().int().min(defaults.shutdownReserveMs + 1).max(900000),
    requestTimeoutMs: z.number().int().positive().max(120000),
    databaseTimeoutMs: z.number().int().positive().max(60000),
    allowWrites: z.boolean(),
  }).parse({
    provider,
    apiKey: (provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENAI_API_KEY) ?? '',
    model: (provider === 'gemini' ? env.GEMINI_MODEL : env.OPENAI_MODEL) ?? defaults.models[provider],
    geminiApiVersion: env.GEMINI_API_VERSION ?? defaults.geminiApiVersion,
    batchSize: number(env.DISCOVERY_BATCH_SIZE, defaults.batchSize),
    executionTimeoutMs: number(env.DISCOVERY_TIMEOUT_MS, defaults.executionTimeoutMs),
    requestTimeoutMs: number(env.DISCOVERY_REQUEST_TIMEOUT_MS, defaults.requestTimeoutMs),
    databaseTimeoutMs: number(env.DISCOVERY_DATABASE_TIMEOUT_MS, defaults.databaseTimeoutMs),
    allowWrites: env.DISCOVERY_ALLOW_WRITES === 'true',
  });
}

export type DiscoveryConfig = ReturnType<typeof readDiscoveryConfig>;
