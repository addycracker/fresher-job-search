import { discoveryDefaults } from './config.js';

export class DeadlineError extends Error {}

export class Budget {
  constructor(private readonly remainingTime: () => number) {}

  remaining() {
    return Math.max(0, this.remainingTime() - discoveryDefaults.shutdownReserveMs);
  }

  check() {
    if (this.remaining() <= 0) throw new DeadlineError();
  }

  signal(timeoutMs: number) {
    this.check();
    return AbortSignal.timeout(Math.max(1, Math.floor(Math.min(timeoutMs, this.remaining()))));
  }
}
