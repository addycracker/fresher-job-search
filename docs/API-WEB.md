# API and web application

**Transport update:** job requests/responses use RSA-OAEP/AES-256-GCM and `X-API-Key`. Run `npm run api:security:setup` once for a fresh checkout. See [API-SECURITY.md](API-SECURITY.md) for the wire protocol, required key settings and rate limits. Plaintext job requests are rejected.

The read-only NestJS API and Next.js website live in this repository. Company discovery, manual seeding, ingestion writers and their schemas remain unchanged. No deployment or database/index writes were performed for this implementation.

## Local setup

Use Node.js 22.15+ or 24 and run commands from the repository root.

```powershell
npm ci
# Copy only if the destination file does not already exist:
Copy-Item .env.example .env.development
Copy-Item apps/web/.env.example apps/web/.env.local
```

Preserve existing credentials when adding the following settings to `.env.development`:

```dotenv
API_PORT=4000
API_MONGODB_URI=
API_CORS_ORIGINS=http://localhost:3000
API_SWAGGER_ENABLED=true
```

`API_MONGODB_URI` should use a database user with **read-only** access to the existing database. If blank, the API falls back to the existing `MONGODB_URI`. Include the correct database name. Atlas network access must allow the host running the API. Optional `DNS_SERVERS` accepts comma-separated resolver IP addresses. No Gemini or OpenAI key is needed by the API or website.

In `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
API_BASE_URL=http://localhost:4000
WEB_SITE_URL=http://localhost:3000
```

`NEXT_PUBLIC_API_BASE_URL` is the browser-reachable API origin, baked into the frontend at build time. `API_BASE_URL` is the server-side API origin and falls back to the public value. `WEB_SITE_URL` is the website's canonical origin for metadata. Never place database credentials or private API keys in a `NEXT_PUBLIC_` variable.

Start two terminals:

```powershell
# Terminal 1
npm run api:dev
# Terminal 2
npm run web:dev
```

Open `http://localhost:3000`. Swagger is at `http://localhost:4000/api/docs` in development. API local environment loading preserves shell variables, then loads `.env.development`, then `.env`. Next.js loads its own application-local `.env.local`. Production should use injected environment variables rather than local files.

## API endpoints

All responses use the shared success/error envelope with a generated request ID and ISO timestamp. The same request ID appears in `X-Request-Id` and JSON request logs.

| Method and path            | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `GET /api/v1/jobs`         | Bounded search and pagination                                                    |
| `GET /api/v1/jobs/filters` | Available titles, locations, employment groups, capabilities and live statistics |
| `GET /api/v1/jobs/:id`     | Public details or HTTP 404; malformed IDs return 400                             |
| `GET /api/v1/health`       | Liveness, including connection state                                             |
| `GET /api/v1/health/ready` | Readiness; database ping failure returns 503                                     |

| Listing parameter | Supported values/behavior                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `q`               | Up to 100 characters; searches titles and stored descriptions                                      |
| `role`            | Escaped, case-insensitive title substring, up to 100 characters                                    |
| `location`        | Escaped, case-insensitive location substring, up to 100 characters                                 |
| `employmentType`  | `internship`, `full-time`, `part-time`, `contract`; normalizes only known stored spelling variants |
| `workMode`        | `remote`; only explicit remote/virtual location text or a stored `Remote` employment value         |
| `page`            | Positive integer, default 1, maximum 1000; maximum offset 20,000                                   |
| `pageSize`        | Positive integer, default 12, maximum 48                                                           |
| `sort`            | `newest` or `oldest`, ordered by `firstSeenAt` with `_id` as a stable tie breaker                  |
| `category`        | Rejected with 400 because classification is not stored                                             |

Unknown/repeated parameters, arbitrary nested Mongo filters, unsupported enum values and invalid pagination return 400. An out-of-range page returns an empty list with the accurate total. Empty databases return zero counts. Counts and page reads are separate bounded queries, so concurrent ingestion can change the database between them.

```powershell
Invoke-RestMethod 'http://localhost:4000/api/v1/health/ready'
# Use the website/typed encrypted API client to search jobs.
```

## Actual database compatibility and execution flow

1. The API reuses the existing `JobSchema` from `apps/job-ingestion/src/models.ts` and `CompanySchema` from `src/models.ts`. Collection names are explicitly `jobs` and `companies`. The existing `jobsources` collection and ingestion synchronization data are never written by this API.
2. Stored jobs use `companyDomain`, `title`, `location`, `employmentType`, `provider`, `url`, `applyUrl`, `descriptionText`, `descriptionHtml`, `publishedAt`, `firstSeenAt` and `lastSeenAt`, plus source/external identities and timestamps. The company name/website join uses `companyDomain` and `Company.domain`, not a fabricated company field on jobs.
3. A DTO transforms and validates the query. The service applies capability/pagination rules. The repository constructs only server-defined filters, projects public listing fields, performs lean bounded reads and obtains matching counts. Company information is fetched once per page using the distinct domains; there is no per-job query loop.
4. The mapper exposes public fields and safe HTTPS links, normalizes known employment spelling variants and sanitizes description HTML. Internal source IDs, synchronization metadata, credentials and board tokens are omitted.
5. `ResponseHandler` returns the success envelope. The global filter maps validation, not-found and database failures to safe errors with correct HTTP status codes. Raw database errors are not exposed.
6. The homepage and details use server-side API calls. The explorer uses the same typed client in the browser, requests one page at a time, debounces keyword changes and synchronizes filters/sort/page with the URL. It never connects to MongoDB.

## Search indexes

The API disables Mongoose `autoIndex` and `autoCreate`. Starting it never provisions indexes or collections. It detects an existing text index, caches capabilities for 30 seconds and uses MongoDB `$text` search when available. Without one, it falls back to escaped, case-insensitive word matching across title and descriptions, with a five-second database timeout. This fallback can scan documents and is intended for the current small dataset; prepare indexes before serving substantial public traffic. Native text search has MongoDB token/stemming semantics, whereas fallback search requires each word to match a substring.

An operator can separately provision the API indexes with:

```powershell
# DATABASE INDEX WRITE: only run against an approved database with index privileges.
npm run api:indexes
```

The script creates a weighted title/description text index and recency, employment and location indexes. It neither deletes indexes nor rewrites jobs. MongoDB supports one text index per collection: inspect/reconcile a pre-existing different text index before running this command. Regex substring filters are still bounded by query timeout; their indexes do not guarantee index-only execution. The setup command was **not run** during implementation.

## Data limitations

- No stored AI category, experience/seniority classification, salary, company logo or explicit onsite/hybrid field exists. The category selector is disabled. Initials are decorative company initials, not logos. The UI does not infer fresher eligibility: the database also includes experienced roles.
- Internship grouping uses actual employment type, not title guesses. A role titled “Intern” with missing or full-time employment data retains the provider's stored information.
- Many jobs have no `publishedAt`. Cards explicitly say “Indexed” using `firstSeenAt`; original dates are shown only when stored. Newest/oldest sorting is consistently by first indexed time.
- Location spelling variants and international jobs remain visible. No unsupported India-only or active/expired status is inferred. Availability still depends on the original employer posting.
- Dropdown metadata is capped at 100 distinct locations/titles and cached for 30 seconds. Longer-than-100-character filter options are omitted; keyword search can still find those jobs. Paginated jobs are not cached in the browser client or Next.js server fetches.
- The application has no LLM runtime calls. It can display classification only after a future schema-compatible feature supplies it.
- Google Fonts loads DM Sans and Manrope with `display=swap`; system fonts remain usable if that service is unavailable.

## Verification and production build

```powershell
npm run typecheck:all
npm run lint
npm test
npm run build:all
```

The existing root `build`, seed, discovery and ingestion commands remain available. A separate runtime TypeScript configuration enables Nest decorators for API development/tests without including API contracts in the ingestion Docker build.

With both local servers running and the existing database populated, run the optional **read-only** browser integration check:

```powershell
npm run test:browser
# Windows Edge alternative:
$env:BROWSER_CHANNEL='msedge'
npm run test:browser
```

It uses installed Chrome by default, captures ignored screenshots under `artifacts/`, and checks desktop/mobile navigation, filters, search, empty/reset states, details, pagination, hydration, overflow, API failure/retry behavior and automated WCAG 2 A/AA rules. Optional `BROWSER_TEST_BASE_URL` points it at another approved test website. It neither submits applications nor changes data. Unit/HTTP tests mock the repository and connection and do not require MongoDB or external ATS/LLM calls. Synthetic fixtures exist only in tests.

Production processes, after building:

```powershell
$env:NODE_ENV='production'
npm run api:start
# Separate terminal/process with the same production mode:
npm run web:start
```

## Deployment configuration (no deployment performed)

Run the API and web as separate Node processes/containers from this monorepo. The API production artifact is `dist-api/` and needs root production dependencies; the website needs `apps/web/.next`, its configuration/package and installed workspace dependencies. Set the browser-facing API origin **before building** the website. Set production `API_MONGODB_URI`, `API_CORS_ORIGINS` (exact comma-separated browser origins), `API_PORT`, `NODE_ENV=production`, `API_BASE_URL` and `WEB_SITE_URL` in the relevant service environment. Bind through HTTPS at the hosting ingress.

Use a MongoDB read-only user for the API, supply secrets through the hosting secret manager, and allow the API host through Atlas networking. Restrict ingress request rate/concurrency at the reverse proxy or platform; no distributed rate limiter is included. Swagger is always disabled in production. Probe liveness at `/api/v1/health` and readiness at `/api/v1/health/ready`; restart the process if the initial MongoDB connection fails. Established connections use the driver's normal reconnection behavior. Mongo errors return safe 503 responses, and shutdown hooks close the connection.

No AWS resources, EventBridge rules, Fargate task definitions or discovery/ingestion code need to change for these applications. Deployment remains a separate approval step.

## Verified locally — November 19, 2026

- `npm test`: 57 tests passed, including the existing discovery/ingestion tests.
- `npm run typecheck:all` and `npm run lint`: passed.
- `npm run build:all`: passed; the final frontend rebuild also passed.
- `npm run test:browser`: passed against the production frontend, including API failure/retry, mobile filters, pagination, search, hydration and overflow checks. Automated WCAG 2 A/AA checks reported no violations in the tested homepage, listing, details and mobile drawer states. This is not a substitute for a complete manual accessibility audit.
- Live read-only API verification: 384 existing jobs across 15 companies; internship filtering returned 6 records and explicit remote filtering returned 66. These observations are not hardcoded into the application.
- Compiled production API: readiness returned 200 and Swagger returned 404.
- All 38 protected pre-existing source, schema, provider configuration and dataset files matched their original checksums. No real seed, ingestion, index creation or deployment command was executed.

The native browser helper was unavailable, so visual and interaction checks used headless Chrome with Playwright. Screenshots are stored locally under the ignored `artifacts/` directory. The preview processes were stopped after verification.
