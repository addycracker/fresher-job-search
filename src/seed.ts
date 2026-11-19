import { z } from 'zod';
import { isConfiguredProvider, providerUrls } from './providers.js';
import { message } from './messages.js';

const sourceSchema = z.strictObject({
  provider: z.string().refine(isConfiguredProvider, message('providerRequired')),
  boardToken: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/),
});

export const companySchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  website: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.pathname === '/' && !url.search && !url.hash
      && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname);
  }, message('invalidHomepage')),
  sources: z.array(sourceSchema),
});

export type Source = z.infer<typeof sourceSchema>;
export type CompanyRecord = z.infer<typeof companySchema> & { domain: string };

export class SourceOwnershipConflictError extends Error {}

export function sourceIdentity(source: Source) {
  return `${source.provider}:${source.boardToken}`;
}

export function sourceUrl(source: Source) {
  if (!isConfiguredProvider(source.provider)) throw new Error(message('providerNotConfigured'));
  return providerUrls[source.provider] + encodeURIComponent(source.boardToken);
}

export function validateDataset(input: unknown): CompanyRecord[] {
  const records = z.array(companySchema).parse(input);
  const domains = new Set<string>();
  const sources = new Set<string>();
  return records.map((record) => {
    const domain = new URL(record.website).hostname.toLowerCase().replace(/^www\./, '');
    if (domains.has(domain)) throw new Error(message('duplicateDomain', { domain }));
    domains.add(domain);
    for (const source of record.sources) {
      const identity = sourceIdentity(source);
      if (sources.has(identity)) throw new Error(message('duplicateSource', { identity }));
      sources.add(identity);
    }
    return { ...record, website: new URL(record.website).origin, domain };
  });
}

// A small interface keeps seed behavior testable without a running database.
export interface SeedStore {
  sourceOwner(source: Source): Promise<string | null>;
  upsertCompany(record: CompanyRecord): Promise<void | { inserted: boolean }>;
  upsertSource(domain: string, source: Source): Promise<void>;
}

export async function seedCompanies(records: CompanyRecord[], store: SeedStore) {
  // Preflight every ownership conflict before making any writes.
  for (const record of records) {
    for (const source of record.sources) {
      const owner = await store.sourceOwner(source);
      if (owner !== null && owner !== record.domain) {
        throw new SourceOwnershipConflictError(message('sourceOwnershipConflict', { identity: sourceIdentity(source), owner }));
      }
    }
  }
  for (const record of records) {
    await store.upsertCompany(record);
    for (const source of record.sources) await store.upsertSource(record.domain, source);
  }
}
