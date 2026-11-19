import { z } from 'zod';
import { companySchema, sourceUrl } from '../../../src/seed.js';
import { discoveryDefaults } from './config.js';

export class DiscoveryError extends Error {
  constructor(readonly code: string, readonly diagnostic?: {
    stage: 'search' | 'extraction'; attempts: number; httpStatus?: number; hint: string;
  }) { super(code); }
}

export class RejectedCandidate {
  constructor(readonly code: string) {}
}

function evidenceIdentity(value: string) {
  const url = new URL(value);
  // Homepage www aliases already share the same identity in validateDataset().
  if (url.pathname === '/') url.hostname = url.hostname.replace(/^www\./, '');
  for (const [alias, canonical] of Object.entries(discoveryDefaults.boardUrlAliases)) {
    if (url.href.startsWith(alias)) return canonical + url.href.slice(alias.length).replace(/\/$/, '');
  }
  return url.href.replace(/\/$/, '');
}

export function fillPrompt(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (key, name: string) => String(values[name] ?? key));
}

export function extractionSchema(batchSize: number) {
  // Website semantics are enforced by the existing schema after extraction.
  return z.strictObject({ candidates: z.array(companySchema.extend({ website: z.string() })).max(batchSize) });
}

export function parseCandidates(text: string, material: string, batchSize: number, provider: string): unknown[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new DiscoveryError(`${provider}_invalid_output`); }
  const envelope = z.strictObject({ candidates: z.array(z.unknown()).max(batchSize) }).safeParse(parsed);
  if (!envelope.success) throw new DiscoveryError(`${provider}_invalid_output`);
  const evidenceUrls = new Set<string>();
  for (const match of material.matchAll(/https:\/\/[^\s<>"'\[\]*`]+/g)) {
    try { evidenceUrls.add(evidenceIdentity(match[0].replace(/[),.;]+$/, ''))); }
    catch { /* Ignore malformed URLs in search prose. */ }
  }
  return envelope.data.candidates.map((candidate) => {
    const result = companySchema.safeParse(candidate);
    if (!result.success) return candidate;
    const record = result.data;
    const urls = [record.website, ...record.sources.map(sourceUrl)];
    return urls.some((url) => !evidenceUrls.has(evidenceIdentity(url)))
      ? new RejectedCandidate('candidate_evidence_missing') : record;
  });
}
