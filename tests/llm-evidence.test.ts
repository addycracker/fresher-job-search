import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCandidates, RejectedCandidate } from '../apps/company-discovery/src/llm.js';

const candidate = { name: 'Synthetic fixture', website: 'https://fixture.test', sources: [{ provider: 'greenhouse', boardToken: 'synthetic-fixture' }] };
const text = JSON.stringify({ candidates: [candidate] });

test('accepts equivalent homepage www, Markdown formatting, trailing slashes and configured board-host aliases', () => {
  const material = '**https://www.fixture.test/** and `https://job-boards.greenhouse.io/synthetic-fixture/`';
  assert.deepEqual(parseCandidates(text, material, 1, 'gemini'), [candidate]);
});

test('does not treat different company domains, tokens or arbitrary subdomains as matching evidence', () => {
  for (const material of [
    'https://fixture.test https://boards.greenhouse.io/synthetic-fixture-other',
    'https://another.test https://boards.greenhouse.io/synthetic-fixture',
    'https://other.fixture.test https://boards.greenhouse.io/synthetic-fixture',
  ]) {
    assert.deepEqual(parseCandidates(text, material, 1, 'gemini'), [new RejectedCandidate('candidate_evidence_missing')]);
  }
});
