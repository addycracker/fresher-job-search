import { seedCompanies, sourceIdentity, SourceOwnershipConflictError, validateDataset, type SeedStore } from '../../../src/seed.js';
import { z } from 'zod';
import { Budget, DeadlineError } from './budget.js';
import { discoveryDefaults } from './config.js';
import { DiscoveryError, RejectedCandidate } from './llm.js';
import type { DiscoveryDependencies, DiscoverySummary } from './types.js';

class DatabaseInitializationError extends Error {}

export function emptySummary(dryRun: boolean, llmProvider: DiscoverySummary['llmProvider'] = 'unconfigured'): DiscoverySummary {
  return {
    status: 'success', dryRun, llmProvider,
    candidatesDiscovered: 0, validBoards: 0, invalidBoards: 0,
    companiesInserted: 0, companiesUpdated: 0, companiesInsertedOrUpdated: 0, companiesPlanned: 0,
    duplicateRecords: 0, failedCandidates: 0, skippedCandidates: 0,
    llmUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0 },
    errors: [],
  };
}

export async function runDiscovery(
  options: { batchSize: number; dryRun: boolean; budget: Budget },
  deps: DiscoveryDependencies,
): Promise<DiscoverySummary> {
  const summary = emptySummary(options.dryRun, deps.provider);
  const { budget } = options;
  const domains = new Set<string>();
  const sourceOwners = new Map<string, string>();
  let opened = false;
  let processed = 0;
  const report = (candidate: number | null, code: string, diagnostic?: DiscoveryError['diagnostic'], validationFields?: string[]) => {
    const detail = { candidate, code, ...(diagnostic ? { diagnostic } : {}), ...(validationFields ? { validationFields } : {}) };
    summary.errors.push(detail);
    deps.log({ event: 'candidate_failure', ...detail });
  };
  // Wrap the existing store to count acknowledged company writes, including partial progress.
  const store: SeedStore = {
    async sourceOwner(source) { budget.check(); return deps.store.sourceOwner(source); },
    async upsertCompany(record) {
      budget.check();
      const result = await deps.store.upsertCompany(record);
      summary.companiesInsertedOrUpdated++;
      if (result) {
        if (result.inserted) summary.companiesInserted++;
        else summary.companiesUpdated++;
      }
      return result;
    },
    async upsertSource(domain, source) { budget.check(); await deps.store.upsertSource(domain, source); },
  };
  try {
    budget.check();
    const candidates = await deps.discover(options.batchSize, budget, summary.llmUsage);
    if (!Array.isArray(candidates) || candidates.length > options.batchSize) throw new DiscoveryError(`${deps.provider}_invalid_output`);
    summary.candidatesDiscovered = candidates.length;
    for (const [index, candidate] of candidates.entries()) {
      budget.check();
      if (candidate instanceof RejectedCandidate) {
        summary.failedCandidates++;
        report(index, candidate.code);
        processed++;
        continue;
      }
      let record;
      try {
        record = validateDataset([candidate])[0]!;
        if (!record.sources.length || record.sources.length > discoveryDefaults.maxSourcesPerCompany) throw new Error();
      } catch (error) {
        summary.failedCandidates++;
        const fields = error instanceof z.ZodError
          ? [...new Set(error.issues.map((issue) => issue.path.map(String).join('.') || 'record'))].slice(0, 5)
          : ['sources'];
        report(index, 'candidate_invalid', undefined, fields);
        processed++;
        continue;
      }
      if (domains.has(record.domain)) {
        summary.duplicateRecords++;
        processed++;
        continue;
      }
      if (record.sources.some((source) => sourceOwners.has(sourceIdentity(source)) && sourceOwners.get(sourceIdentity(source)) !== record.domain)) {
        summary.duplicateRecords++;
        summary.failedCandidates++;
        report(index, 'source_ownership_conflict');
        processed++;
        continue;
      }
      const approved = [];
      for (const source of record.sources) {
        budget.check();
        try {
          await deps.verify(source, budget);
          summary.validBoards++;
          approved.push(source);
        } catch (error) {
          if (error instanceof DeadlineError) throw error;
          summary.invalidBoards++;
          report(index, 'board_unverifiable');
        }
      }
      if (!approved.length) {
        summary.failedCandidates++;
        processed++;
        continue;
      }
      record.sources = approved;
      domains.add(record.domain);
      for (const source of approved) sourceOwners.set(sourceIdentity(source), record.domain);
      try {
        if (options.dryRun) summary.companiesPlanned++;
        else {
          budget.check();
          if (!opened) {
            opened = true;
            try { await deps.openDatabase(budget); }
            catch (error) {
              if (error instanceof DeadlineError) throw error;
              throw new DatabaseInitializationError();
            }
          }
          await seedCompanies([record], store);
        }
      } catch (error) {
        if (error instanceof DeadlineError) throw error;
        summary.failedCandidates++;
        if (error instanceof DatabaseInitializationError) { processed++; throw error; }
        report(index, error instanceof SourceOwnershipConflictError ? 'source_ownership_conflict' : 'database_write_failed');
      }
      processed++;
    }
  } catch (error) {
    summary.skippedCandidates = Math.max(0, summary.candidatesDiscovered - processed);
    report(null, error instanceof DeadlineError ? 'deadline_reached'
      : error instanceof DiscoveryError ? error.code
      : error instanceof DatabaseInitializationError ? 'database_initialization_failed' : 'discovery_failed',
      error instanceof DiscoveryError ? error.diagnostic : undefined);
  } finally {
    if (opened) {
      try { await deps.closeDatabase(); }
      catch { report(null, 'database_disconnect_failed'); }
    }
  }
  if (summary.errors.length) {
    summary.status = summary.companiesInsertedOrUpdated + summary.companiesPlanned > 0 ? 'partial' : 'failed';
  }
  deps.log({ event: 'discovery_complete', ...summary });
  return summary;
}
