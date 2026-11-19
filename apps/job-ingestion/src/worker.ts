import { randomUUID } from 'node:crypto';
import { IngestionError } from './providers.js';
import type { IngestionDependencies, IngestionSummary } from './types.js';

export async function runIngestion(
  options: { dryRun: boolean; signal: AbortSignal }, deps: IngestionDependencies,
): Promise<IngestionSummary> {
  const summary: IngestionSummary = {
    status: 'success', dryRun: options.dryRun, sourcesFound: 0, sourcesCompleted: 0,
    sourcesFailed: 0, sourcesLocked: 0, jobsFetched: 0, jobsInserted: 0, jobsUpdated: 0,
    jobsPlanned: 0, duplicatesSkipped: 0, errors: [],
  };
  const owner = randomUUID();
  const report = (source: string | null, code: string) => {
    summary.errors.push({ source, code });
    deps.log({ event: 'ingestion_failure', source, code });
  };
  try {
    options.signal.throwIfAborted();
    const sources = await deps.store.listSources();
    summary.sourcesFound = sources.length;
    for (const source of sources) {
      options.signal.throwIfAborted();
      let acquired = false;
      const seen = new Set<string>();
      try {
        if (!await deps.store.companyExists(source.companyDomain)) throw new IngestionError('source_company_missing');
        if (!options.dryRun) {
          acquired = await deps.store.acquire(source, owner);
          if (!acquired) { summary.sourcesLocked++; continue; }
          await deps.store.progress(source, '0');
        }
        const seenAt = new Date();
        for await (const page of deps.pages(source, options.signal)) {
          options.signal.throwIfAborted();
          summary.jobsFetched += page.jobs.length;
          const unique = page.jobs.filter((job) => {
            if (seen.has(job.externalId)) { summary.duplicatesSkipped++; return false; }
            seen.add(job.externalId);
            return true;
          });
          if (options.dryRun) summary.jobsPlanned += unique.length;
          else {
            await deps.store.renew(source, owner);
            const result = await deps.store.saveJobs(source, unique, seenAt);
            summary.jobsInserted += result.inserted;
            summary.jobsUpdated += result.updated;
            await deps.store.progress(source, page.cursor);
          }
        }
        options.signal.throwIfAborted();
        if (!options.dryRun) {
          await deps.store.renew(source, owner);
          await deps.store.complete(source, new Date());
        }
        summary.sourcesCompleted++;
        deps.log({ event: 'source_complete', source: source.id, jobs: seen.size, dryRun: options.dryRun });
      } catch (error) {
        summary.sourcesFailed++;
        report(source.id, error instanceof IngestionError ? error.code : options.signal.aborted ? 'ingestion_stopped' : 'source_failed');
        if (acquired) {
          try {
            await deps.store.renew(source, owner);
            await deps.store.fail(source);
          } catch { report(source.id, 'failure_status_not_saved'); }
        }
        if (options.signal.aborted) break;
      } finally {
        if (acquired) {
          try { await deps.store.release(source, owner); }
          catch { report(source.id, 'lease_release_failed'); }
        }
      }
    }
  } catch (error) { report(null, options.signal.aborted ? 'ingestion_stopped' : 'source_listing_failed'); }
  if (options.signal.aborted) summary.status = 'stopped';
  else if (summary.errors.length) summary.status = summary.sourcesCompleted ? 'partial' : 'failed';
  deps.log({ event: 'ingestion_complete', ...summary });
  return summary;
}
