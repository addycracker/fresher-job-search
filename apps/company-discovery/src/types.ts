import type { SeedStore, Source } from '../../../src/seed.js';
import type { Budget } from './budget.js';

export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  reportedCalls: number;
}

export interface DiscoverySummary {
  status: 'success' | 'partial' | 'failed';
  dryRun: boolean;
  llmProvider: 'gemini' | 'openai' | 'unconfigured';
  candidatesDiscovered: number;
  validBoards: number;
  invalidBoards: number;
  companiesInserted: number;
  companiesUpdated: number;
  companiesInsertedOrUpdated: number;
  companiesPlanned: number;
  duplicateRecords: number;
  failedCandidates: number;
  skippedCandidates: number;
  llmUsage: TokenUsage;
  errors: { candidate: number | null; code: string; validationFields?: string[]; diagnostic?: { stage: string; attempts: number; httpStatus?: number; hint: string } }[];
}

export interface DiscoveryDependencies {
  provider: 'gemini' | 'openai';
  discover(batchSize: number, budget: Budget, usage: TokenUsage): Promise<unknown[]>;
  verify(source: Source, budget: Budget): Promise<void>;
  openDatabase(budget: Budget): Promise<void>;
  closeDatabase(): Promise<void>;
  store: SeedStore;
  log(event: Record<string, unknown>): void;
}
