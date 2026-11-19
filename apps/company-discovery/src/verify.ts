import { setTimeout as delay } from 'node:timers/promises';
import { verifyBoard } from '../../../src/verify-boards.js';
import type { Source } from '../../../src/seed.js';
import { Budget, DeadlineError } from './budget.js';
import type { DiscoveryConfig } from './config.js';

export function createBoardVerifier(config: DiscoveryConfig, request: typeof fetch = fetch) {
  return async (source: Source, budget: Budget) => {
    budget.check();
    try {
      await verifyBoard(source, (url, options) => {
        budget.check();
        const signal = budget.signal(config.requestTimeoutMs);
        return request(url, { ...options, signal: options?.signal ? AbortSignal.any([options.signal, signal]) : signal });
      }, async (ms) => {
        budget.check();
        await delay(Math.min(ms, budget.remaining()));
      });
    } catch (error) {
      if (budget.remaining() <= 0) throw new DeadlineError();
      throw error;
    }
  };
}
