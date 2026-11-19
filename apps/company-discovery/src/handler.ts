import { z } from 'zod';
import { Budget } from './budget.js';
import { discoveryDefaults, readDiscoveryConfig, type DiscoveryConfig } from './config.js';
import { emptySummary, runDiscovery } from './discover.js';
import { createDependencies } from './runtime.js';
import type { DiscoveryDependencies } from './types.js';

// Structural typing avoids an AWS runtime dependency while matching Lambda's contract.
export interface LambdaContext {
  getRemainingTimeInMillis(): number;
  callbackWaitsForEmptyEventLoop: boolean;
}

export function createHandler(
  dependencies: (config: DiscoveryConfig) => DiscoveryDependencies = createDependencies,
  environment: () => NodeJS.ProcessEnv = () => process.env,
) {
  return async (event: unknown = {}, context?: LambdaContext) => {
    const input = z.strictObject({
      batchSize: z.number().int().min(1).max(discoveryDefaults.maxBatchSize).optional(),
      dryRun: z.boolean().default(true),
    }).safeParse(event);
    if (!input.success) {
      const summary = emptySummary(true);
      summary.status = 'failed';
      summary.errors.push({ candidate: null, code: 'invalid_event' });
      console.log(JSON.stringify({ event: 'discovery_complete', ...summary }));
      return summary;
    }
    try {
      const config = readDiscoveryConfig(environment());
      if (!input.data.dryRun && !config.allowWrites) {
        const summary = emptySummary(false, config.provider);
        summary.status = 'failed';
        summary.errors.push({ candidate: null, code: 'writes_disabled' });
        console.log(JSON.stringify({ event: 'discovery_complete', ...summary }));
        return summary;
      }
      if (context) context.callbackWaitsForEmptyEventLoop = false;
      const deadline = Date.now() + config.executionTimeoutMs;
      const budget = new Budget(() => Math.min(deadline - Date.now(), context?.getRemainingTimeInMillis() ?? Infinity));
      return await runDiscovery({
        batchSize: input.data.batchSize ?? config.batchSize,
        dryRun: input.data.dryRun,
        budget,
      }, dependencies(config));
    } catch {
      const summary = emptySummary(input.data.dryRun);
      summary.status = 'failed';
      summary.errors.push({ candidate: null, code: 'configuration_or_runtime_failed' });
      console.log(JSON.stringify({ event: 'discovery_complete', ...summary }));
      return summary;
    }
  };
}

export const handler = createHandler();
