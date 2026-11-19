import { z } from 'zod';
import defaults from '../../../config/job-ingestion.json' with { type: 'json' };

export const ingestionDefaults = defaults;
export function readIngestionConfig(env: NodeJS.ProcessEnv = process.env) {
  const number = (key: string, fallback: number) => env[key] === undefined ? fallback : Number(env[key]);
  return z.object({
    maxSources: z.number().int().min(1).max(10000),
    runTimeoutMs: z.number().int().min(1000).max(86400000),
    databaseTimeoutMs: z.number().int().min(1000).max(30000),
    allowWrites: z.boolean(),
  }).parse({
    maxSources: number('INGESTION_MAX_SOURCES', defaults.maxSources),
    runTimeoutMs: number('INGESTION_TIMEOUT_MS', defaults.runTimeoutMs),
    databaseTimeoutMs: number('INGESTION_DATABASE_TIMEOUT_MS', defaults.databaseTimeoutMs),
    allowWrites: env.INGESTION_ALLOW_WRITES === 'true',
  });
}
export type IngestionConfig = ReturnType<typeof readIngestionConfig>;
