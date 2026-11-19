# Company discovery

This application discovers candidate companies using the official Gemini or OpenAI
SDK, checks their public ATS boards, and optionally persists approved records using
the existing company seeder. It does not import the manual JSON dataset, fetch jobs
for ingestion, deploy infrastructure, or expose an HTTP API. The Company and
JobSource schemas are unchanged.

## Local commands

Use Node.js 22.15+ or 24 and run these from the repository root:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

All tests mock both LLM providers, ATS HTTP requests and MongoDB. They need no credentials,
network access or AWS resources. Synthetic `.test` records exist only in tests.

For a live discovery dry-run, set the selected provider's variables below in your existing
`.env.development`, then run:

```powershell
npm run discover:companies
npm run discover:companies -- 5
```

This local command always uses dry-run, even if `DISCOVERY_ALLOW_WRITES=true`.
It makes calls to the selected LLM provider and read-only public ATS requests, prints a JSON
summary, and never connects to MongoDB or writes to the manual dataset. The default
batch is 10 and the maximum is 50. No live LLM calls or real database writes
are part of the unit tests.

## Configuration

| Variable | Required / default |
| --- | --- |
| `LLM_PROVIDER` | `gemini` (default) or `openai`; no automatic fallback |
| `GEMINI_API_KEY` | Required only for Gemini; never logged |
| `GEMINI_MODEL` | Default `gemini-2.5-flash-lite` |
| `GEMINI_API_VERSION` | Default `v1beta`; required for the Google Search tool used here |
| `OPENAI_API_KEY` | Required only for OpenAI; never logged |
| `OPENAI_MODEL` | Default `gpt-5-mini` |
| `DISCOVERY_BATCH_SIZE` | Optional, `10`; invocation `batchSize` overrides it |
| `DISCOVERY_TIMEOUT_MS` | Optional, `240000`; whole-run budget |
| `DISCOVERY_REQUEST_TIMEOUT_MS` | Optional, `60000`; request time limit |
| `DISCOVERY_DATABASE_TIMEOUT_MS` | Optional, `10000`; MongoDB operation limit |
| `DISCOVERY_ALLOW_WRITES` | Optional, `false`; must be exactly `true` for write mode |
| `MONGODB_URI` | Required only in write mode; include the intended database name |
| `DNS_SERVERS` | Optional MongoDB DNS override; leave blank to use system DNS |

The CLI loads `.env.development`, then `.env`; shell variables take precedence.
Lambda uses its environment directly and does not load local `.env` files.
The model is deliberately configurable rather than tied to an expiring model ID.

Prompts, retry settings, output limits, and batch limits live in
`config/company-discovery.json`. Provider names and board URLs come from
`config/providers.json`; verification endpoints and retry limits come from
`config/board-verification.json`. No additional providers were introduced.
Application messages stay in `config/messages.json`; structured error codes are
stable machine-readable identifiers.

## Execution flow

1. Validate the invocation and environment. Default to `dryRun: true`. Reject write
   mode before any service call unless `DISCOVERY_ALLOW_WRITES=true`.
2. With Gemini, use Google Search grounding and require search queries plus web
   grounding chunks. With OpenAI, use required live `web_search` and require a
   completed search call plus URL citations. A model answer alone is not evidence.
3. Make a separate structured JSON extraction request using a JSON Schema derived
   from the existing Zod company schema. Separate stages avoid depending on
   combined grounding/JSON support. Copy exact homepage and board URLs from search
   material; reject extraction URLs absent from that material with
   `candidate_evidence_missing`. Evidence matching accepts homepage `www` aliases,
   Markdown formatting and the explicitly configured Greenhouse board-host alias;
   it never substitutes a different company domain or board token.
4. Run each candidate through existing `validateDataset()`. Reject malformed or
   sourceless candidates, and cap sources per company. Deduplicate by normalized
   domain, never by name. The first accepted occurrence of a domain wins.
5. Run the shared `verifyBoard()` against every source's public ATS endpoint.
   Reject invalid, unreachable or otherwise unverifiable boards. If a company has
   several sources, retain its verified subset; if none pass, reject the company.
6. In dry-run, count planned companies and stop without MongoDB access. Existing
   database ownership conflicts cannot be checked in this mode.
7. In write mode, connect lazily after the first board passes, ensure the existing
   schema indexes exist, and call `seedCompanies()` with the shared Mongo store
   for each candidate. This preserves source ownership checks and narrow upserts,
   never deletes records, and never writes synchronization fields.
8. Continue after individual candidate failures. Stop on database initialization
   failure or exhausted time budget. Always disconnect after attempting to open
   MongoDB, including after errors. Emit a structured summary.

Integration follows the official OpenAI [web-search documentation](https://developers.openai.com/api/docs/guides/tools-web-search),
[structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs),
and [Node SDK documentation](https://github.com/openai/openai-node).
The Gemini adapter uses the official `@google/genai` SDK. Both adapters share
extraction schemas, evidence URL checks, dataset validation, ATS verification and
database persistence. The current selection is `LLM_PROVIDER=gemini` with
`GEMINI_MODEL=gemini-2.5-flash-lite`. Switch to `LLM_PROVIDER=openai` and set
`OPENAI_API_KEY` to use OpenAI later. There is no silent fallback or reuse of keys
across providers. Model access and quotas must be available for the selected
provider. No live calls are part of tests.

## Handler and summary

The exported handler is `apps/company-discovery/src/handler.ts`, also exported
through `index.ts`. It accepts a direct Lambda event:

```json
{ "batchSize": 10, "dryRun": true }
```

It returns a plain JSON object, not an API Gateway response. `status` is `success`,
`partial` or `failed`; candidate failures do not throw away the rest of the batch.
Because failures are returned rather than thrown, a future caller must inspect
`status`; Lambda will not automatically retry a returned failed summary.

| Summary field | Meaning |
| --- | --- |
| `candidatesDiscovered` | Number of extracted candidate entries in the batch |
| `validBoards` | Provider checks that passed, before database ownership checks |
| `invalidBoards` | Invalid or unverifiable sources, including outages and inconclusive empty boards |
| `companiesInserted`, `companiesUpdated` | Acknowledged MongoDB company upsert outcomes; updates can be no-ops |
| `companiesInsertedOrUpdated` | Total acknowledged company upserts |
| `companiesPlanned` | Verified candidates eligible for upsert in dry-run |
| `duplicateRecords` | Skipped repeated domains or conflicting source identities within this batch |
| `failedCandidates` | Candidates rejected entirely, or failing persistence |
| `skippedCandidates` | Entries not completed because the batch stopped early |
| `llmProvider` | Selected provider, or `unconfigured` if setup failed |
| `llmUsage` | Selected provider token totals and number of calls reporting usage |
| `errors` | Candidate indexes (zero-based), safe error codes and validation field paths when applicable; `null` means a run-level failure |

The existing store now returns its company upsert outcome so counts come from
MongoDB acknowledgements, not a potentially racy pre-read. The manual seed ignores
that return value and behaves as before. Writes remain sequential and
nontransactional: a source write failure can leave its company inserted, which is
reported in acknowledged counts and can be repaired by rerunning.

The handler uses the smaller of the configured deadline and Lambda's remaining
time, reserves 10 seconds for cleanup, and checks that budget before operations.
LLM and ATS requests are abortable, retries are bounded, and MongoDB operations
have driver timeouts. It stops starting work when the budget is exhausted.
External cancellation cannot undo completed database writes or guarantee LLM
billing information for requests that returned no response.

## Future deployment — not performed

After approval, compile using `npm run build`. In a separate packaging directory,
include `dist/apps/company-discovery/`, `dist/src/`, `dist/config/` (preserving these
paths), root `package.json` and `package-lock.json`, and production dependencies
installed with `npm ci --omit=dev`. Do not include `.env` files, tests, or the manual
company dataset. Use a compatible Lambda Node.js runtime, such as Node.js 24, and
handler `dist/apps/company-discovery/src/handler.handler`. Preserve `type: module`
so compiled `.js` files load as ES modules.

Configure environment secrets, network access to OpenAI/public ATS endpoints and
Atlas, and a Lambda timeout longer than the configured run budget plus cleanup.
Initially invoke with `dryRun: true`. Only after write approval, enable
`DISCOVERY_ALLOW_WRITES=true` and explicitly invoke with `dryRun: false`.
No deployment, scheduling or AWS resource creation is included. Packaging follows
the [AWS TypeScript ZIP deployment documentation](https://docs.aws.amazon.com/lambda/latest/dg/typescript-package.html).

## Limits and remaining checks

- Live provider credentials, model access, quotas and grounding behavior need an
  approved live smoke test. Unit tests verify SDK request shapes with a mock.
- Search evidence and a responding board do not independently prove that the board
  belongs to the company website. No official-site link crawler or legal company
  verification is implemented. Do not treat the LLM as proof of ownership.
- Empty Lever/Ashby posting arrays remain inconclusive under the shared verifier;
  legitimate companies with no published roles may be skipped.
- Public endpoint limits and outages can reject otherwise valid candidates. They
  are counted as unverifiable, not declared nonexistent.
- Grounding and extraction token usage is aggregated when returned by the SDK;
  search charges and failed requests with no usage metadata are not estimated.
- Manual seed data is unchanged, including the intentionally invalid fictional
  records previously added for testing. Remove those before a real manual seed.

## Files in this change

Created:

- `apps/company-discovery/src/{handler,discover,gemini,openai,llm,verify,index,local,config,budget,runtime,types}.ts`
- `apps/company-discovery/README.md`
- `config/company-discovery.json`
- `tests/discovery.test.ts`, `tests/gemini.test.ts`, `tests/openai.test.ts`, `tests/mongo-seed-store.test.ts`

Modified:

- `src/seed.ts`: export the existing schema, expose typed ownership errors and
  optionally return company upsert outcomes through `SeedStore`.
- `src/mongo-seed-store.ts`: return acknowledged insert/update outcome.
- `src/db.ts`: accept optional bounded driver timeouts for discovery.
- `src/providers.ts`: import the same JSON configuration so TypeScript includes it
  in build output.
- `config/messages.json`, `.env.example`, `package.json`, `package-lock.json`,
  `tsconfig.json`, `README.md`: messages, settings, SDK dependency, commands and docs.

The manual script, manual dataset, MongoDB schemas and ingestion code were not
changed in this milestone.
