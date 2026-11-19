import { connectDatabase, disconnectDatabase } from '../../../src/db.js';
import { CompanyModel, JobSourceModel } from '../../../src/cli-models.js';
import { mongoSeedStore } from '../../../src/mongo-seed-store.js';
import { createOpenAIDiscovery } from './openai.js';
import { createGeminiDiscovery } from './gemini.js';
import { createBoardVerifier } from './verify.js';
import type { DiscoveryConfig } from './config.js';
import type { DiscoveryDependencies } from './types.js';

export function createDependencies(config: DiscoveryConfig): DiscoveryDependencies {
  return {
    provider: config.provider,
    discover: config.provider === 'gemini' ? createGeminiDiscovery(config) : createOpenAIDiscovery(config),
    verify: createBoardVerifier(config),
    store: mongoSeedStore,
    async openDatabase(budget) {
      budget.check();
      await connectDatabase({ timeoutMs: Math.max(1, Math.floor(Math.min(config.databaseTimeoutMs, budget.remaining()))) });
      budget.check();
      await CompanyModel.createIndexes();
      budget.check();
      await JobSourceModel.createIndexes();
    },
    closeDatabase: disconnectDatabase,
    log(event) { console.log(JSON.stringify(event)); },
  };
}
