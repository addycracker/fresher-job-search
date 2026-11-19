import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { ingestionDefaults as config } from './config.js';
import type { IngestionSource, JobPage, NormalizedJob } from './types.js';

export class IngestionError extends Error {
  constructor(readonly code: string, readonly retryable = false) { super(code); }
}

const id = z.union([z.string().trim().min(1), z.number().int().nonnegative()]).transform(String);
const url = z.url().refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
});
const optionalText = z.string().nullish().transform((value) => value ?? '');
const date = z.string().datetime({ offset: true }).nullish().transform((value) => value ? new Date(value) : null);
const greenhouse = z.object({
  id, title: z.string().trim().min(1), absolute_url: url,
  location: z.object({ name: z.string() }).nullish(), content: optionalText,
});
const lever = z.object({
  id, text: z.string().trim().min(1), hostedUrl: url, applyUrl: url,
  categories: z.object({ location: optionalText, commitment: optionalText }).nullish(),
  descriptionPlain: optionalText, description: optionalText,
  additionalPlain: optionalText, additional: optionalText,
  lists: z.array(z.object({ text: optionalText, content: optionalText })).nullish(),
});
const ashby = z.object({
  id: id.optional(), title: z.string().trim().min(1), jobUrl: url, applyUrl: url,
  location: optionalText, employmentType: optionalText,
  descriptionPlain: optionalText, descriptionHtml: optionalText,
  publishedAt: date, isListed: z.boolean(),
});

export function normalizeJob(provider: string, input: unknown): NormalizedJob | null {
  if (provider === 'greenhouse') {
    const job = greenhouse.parse(input);
    return { externalId: job.id, title: job.title, url: job.absolute_url, applyUrl: job.absolute_url,
      location: job.location?.name ?? '', employmentType: '', descriptionText: '', descriptionHtml: job.content, publishedAt: null };
  }
  if (provider === 'lever') {
    const job = lever.parse(input);
    return { externalId: job.id, title: job.text, url: job.hostedUrl, applyUrl: job.applyUrl,
      location: job.categories?.location ?? '', employmentType: job.categories?.commitment ?? '',
      descriptionText: [job.descriptionPlain, job.additionalPlain].filter(Boolean).join('\n'),
      descriptionHtml: [job.description, ...(job.lists ?? []).map((list) => list.content), job.additional].filter(Boolean).join('\n'), publishedAt: null };
  }
  if (provider === 'ashby') {
    const job = ashby.parse(input);
    if (!job.isListed) return null;
    const externalId = job.id ?? new URL(job.jobUrl).pathname.split('/').filter(Boolean).at(-1);
    if (!externalId) throw new IngestionError('job_id_missing');
    return { externalId, title: job.title, url: job.jobUrl, applyUrl: job.applyUrl,
      location: job.location, employmentType: job.employmentType,
      descriptionText: job.descriptionPlain, descriptionHtml: job.descriptionHtml, publishedAt: job.publishedAt };
  }
  throw new IngestionError('provider_unsupported');
}

async function fetchJson(url: string, signal: AbortSignal, request: typeof fetch) {
  for (let attempt = 1; ; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await request(url, {
        redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(config.requestTimeoutMs)]),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new IngestionError(`provider_http_${response.status}`, config.retryHttpStatuses.includes(response.status));
      }
      const reader = response.body?.getReader();
      if (!reader) throw new IngestionError('provider_empty_response');
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > config.maxResponseBytes) {
          await reader.cancel();
          throw new IngestionError('provider_response_too_large');
        }
        chunks.push(value);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
      catch { throw new IngestionError('provider_invalid_json'); }
    } catch (error) {
      signal.throwIfAborted();
      const failure = error instanceof IngestionError ? error : new IngestionError('provider_network_failed', true);
      if (!failure.retryable || attempt >= config.maxAttempts) throw failure;
      await delay(config.retryDelayMs * attempt, undefined, { signal });
    }
  }
}

export function createPageFetcher(request: typeof fetch = fetch) {
  return async function* pages(source: IngestionSource, signal: AbortSignal): AsyncGenerator<JobPage> {
    const provider = source.provider as keyof typeof config.providers;
    if (!Object.hasOwn(config.providers, provider)) throw new IngestionError('provider_unsupported');
    const template = config.providers[provider].url;
    let total = 0;
    for (let page = 0; page < config.maxPages; page++) {
      signal.throwIfAborted();
      const endpoint = new URL(template.replace('{boardToken}', encodeURIComponent(source.boardToken)));
      if (provider === 'lever') {
        endpoint.searchParams.set('limit', String(config.pageSize));
        endpoint.searchParams.set('skip', String(page * config.pageSize));
      }
      const input = await fetchJson(endpoint.href, signal, request);
      const raw = provider === 'lever' ? z.array(z.unknown()).parse(input)
        : z.object({ jobs: z.array(z.unknown()) }).parse(input).jobs;
      total += raw.length;
      if (total > config.maxJobsPerSource) throw new IngestionError('source_job_limit_exceeded');
      // Validate a whole page before yielding any of it. Earlier pages can be safely rerun.
      const jobs = raw.map((job) => normalizeJob(provider, job)).filter((job) => job !== null);
      yield { jobs, cursor: String((page + 1) * config.pageSize) };
      if (provider !== 'lever' || raw.length < config.pageSize) return;
    }
    throw new IngestionError('source_page_limit_exceeded');
  };
}
