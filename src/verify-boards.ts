import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import settings from '../config/board-verification.json' with { type: 'json' };
import { message } from './messages.js';
import { sourceIdentity, type CompanyRecord, type Source } from './seed.js';

const config = z.strictObject({
  timeoutMs: z.number().int().positive(),
  maxAttempts: z.number().int().min(1).max(5),
  retryDelayMs: z.number().int().nonnegative().max(5000),
  retryHttpStatuses: z.array(z.number().int().min(400).max(599)),
  maxResponseBytes: z.number().int().positive(),
  providers: z.record(z.string(), z.strictObject({
    url: z.string().refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password
          && value.split('{boardToken}').length === 2
          && !url.hostname.includes('{');
      } catch { return false; }
    }, message('invalidVerificationUrl')),
    field: z.string().nullable(),
    type: z.enum(['string', 'array']),
  })),
}).parse(settings);

export class BoardVerificationError extends Error {
  constructor(reason: string, readonly retryable = false) {
    super(reason);
  }
}

async function verifyBoardOnce(source: Source, request: typeof fetch) {
  const identity = sourceIdentity(source);
  const fail = (reason: string, retryable = false): never => {
    throw new BoardVerificationError(message('boardVerificationFailed', { identity, reason }), retryable);
  };
  const rule = Object.hasOwn(config.providers, source.provider) ? config.providers[source.provider] : undefined;
  if (!rule) return fail(message('verificationNotConfigured'));
  try {
    const response = await request(rule.url.replace('{boardToken}', encodeURIComponent(source.boardToken)), {
      signal: AbortSignal.timeout(config.timeoutMs),
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400) {
        return fail(message('verificationRedirected', { status: response.status }));
      }
      return fail(message('verificationHttpError', { status: response.status }), config.retryHttpStatuses.includes(response.status));
    }
    const reader = response.body?.getReader();
    if (!reader) return fail(message('verificationInvalidResponse'));
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > config.maxResponseBytes) {
        await reader.cancel();
        return fail(message('verificationResponseTooLarge'));
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const value = rule.field === null ? body
      : body && typeof body === 'object' && Object.hasOwn(body, rule.field)
        ? (body as Record<string, unknown>)[rule.field] : undefined;
    if (rule.type === 'string') {
      if (typeof value !== 'string' || !value.trim()) return fail(message('verificationInvalidResponse'));
    } else {
      if (!Array.isArray(value)) return fail(message('verificationInvalidResponse'));
      // Empty postings cannot reliably distinguish a valid idle board from an unknown token.
      if (!value.length) return fail(message('verificationInconclusive'));
      if (!value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))) {
        return fail(message('verificationInvalidResponse'));
      }
    }
  } catch (error) {
    if (error instanceof BoardVerificationError) throw error;
    if (error instanceof SyntaxError) return fail(message('verificationMalformedJson'));
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return fail(message('verificationTimedOut', { timeoutMs: config.timeoutMs }), true);
    }
    return fail(message('verificationRequestFailed'), true);
  }
}

export async function verifyBoard(
  source: Source,
  request: typeof fetch = fetch,
  wait: (ms: number) => Promise<unknown> = delay,
) {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      await verifyBoardOnce(source, request);
      return;
    } catch (error) {
      if (!(error instanceof BoardVerificationError)) throw error;
      if (!error.retryable || attempt === config.maxAttempts) {
        throw new BoardVerificationError(message('verificationAttemptsFailed', { reason: error.message, attempts: attempt }));
      }
      await wait(config.retryDelayMs * attempt);
    }
  }
}

export async function verifyBoards(records: CompanyRecord[], request: typeof fetch = fetch) {
  for (const record of records) {
    for (const source of record.sources) await verifyBoard(source, request);
  }
}
