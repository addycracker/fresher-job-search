# FresherJobs AI

The read-only NestJS API and Next.js website are documented in
[docs/API-WEB.md](docs/API-WEB.md), including setup, environment variables,
endpoints, data limitations, tests and production commands.

Job API calls require hybrid RSA/AES encryption and `X-API-Key`.
See [docs/API-SECURITY.md](docs/API-SECURITY.md) for first-time key setup,
rate limits, protocol details and production requirements.

```powershell
npm ci
# Add API settings to .env.development and copy apps/web/.env.example to .env.local.
npm run api:dev
# In a second terminal:
npm run web:dev
```

The website reads the existing jobs through the API. It does not connect to
MongoDB from the browser or write job records.

## Manual company seeding — Milestone 1

The ECS Fargate ingestion worker is documented in
[apps/job-ingestion/README.md](apps/job-ingestion/README.md).
It ingests seeded ATS boards without any LLM calls and defaults to dry-run.

Company discovery is documented in [apps/company-discovery/README.md](apps/company-discovery/README.md).
It adds grounded Gemini/OpenAI discovery and reuses the seed utilities below. Local discovery
is always write-free; the manual seed workflow remains available.

A small TypeScript CLI for seeding curated companies and recruitment boards into MongoDB Atlas. Provider API calls check board tokens before seeding; no jobs are persisted and no infrastructure is provisioned. Company records must be supplied and verified by the dataset maintainer.

## Setup

Use Node.js 22.15+ (or 24+) and npm. From the repository root:

```powershell
npm ci
Copy-Item .env.example .env.development
```

Set `MONGODB_URI` in `.env.development` to your Atlas connection string, including the intended database name. Configure Atlas network access and a database user with permission to write these collections and create indexes. Never commit credentials. Configuration precedence is shell environment, then `.env.development`, then `.env`. Both local environment files are ignored by Git.

If system DNS cannot resolve Atlas SRV records, optionally set `DNS_SERVERS` in
`.env.development` to comma-separated resolver IP addresses. This overrides DNS
only for the CLI process; leave it blank to use system DNS.

```powershell
npm run typecheck
npm test
npm run seed:companies -- --dry-run
# Run only when verified records and the intended Atlas database are ready:
npm run seed:companies
```

## Dataset contract

Edit `scripts/data/companies.json` as a JSON array. Each record has exactly these fields:

| Field                  | Meaning                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `name`                 | Verified company display name, nonempty                                                            |
| `website`              | Verified HTTPS company homepage, with no path other than `/`, credentials, port, query or fragment |
| `sources`              | Array of recruitment boards; may be empty                                                          |
| `sources[].provider`   | A provider key from `config/providers.json`                                                        |
| `sources[].boardToken` | Verified board identifier, using letters, digits, underscores or hyphens                           |

Manually verify the official website and each board's association with the company before adding records. Validation checks structure and consistency; provider checks confirm the configured board responds as expected. They do not prove company authenticity or company ownership of that board. Synthetic `.test` fixtures live only in tests.

The stable company key is the lowercased website hostname with a leading `www.` removed. Other subdomains remain distinct; use the same verified canonical homepage consistently. Names can change without creating a new company. A domain migration requires explicit data reconciliation. Source identity is the case-sensitive `(provider, boardToken)` pair, globally unique across companies. Copy tokens exactly from verified boards. The CLI derives canonical board URLs for the supported providers.

## Execution flow

1. Parse CLI arguments, load optional `.env.development` and `.env`, read JSON, and validate the entire dataset with Zod. Unknown fields, malformed records, duplicate domains, and repeated source identities fail before connecting.
2. Check every board token using the configured provider endpoint before any MongoDB connection or writes. With `--dry-run`, print planned upserts and totals after those checks, then exit without connecting to MongoDB. Dry-run requires provider network access; it cannot distinguish database inserts from updates or detect existing database ownership conflicts.
3. For a nonempty real run, connect with a bounded server-selection timeout and explicitly create declared indexes. Index creation fails if existing data violates uniqueness; the CLI never drops indexes. Empty input exits without a connection.
4. Check every source's existing owner before data writes. Upsert companies by domain and sources by provider/token plus owner. Unique indexes also guard concurrent conflicts.
5. Update only company name/website and source URL. Mongoose manages `createdAt`/`updatedAt`; synchronization fields (`lastSyncedAt`, `syncCursor`, `syncStatus`) are never overwritten. Reruns keep the same logical records; `updatedAt` may advance. Records absent from the dataset are not deleted.
6. Disconnect even on failure and return a nonzero exit code. Connection details are not printed.

Writes are sequential and are not a multi-document transaction. A database failure can leave partial progress; fix the problem and rerun safely. Basic tests use an in-memory store and mocked adapter calls, plus schema assertions; they do not replace an Atlas integration test. No real seed is run as part of testing.

## Files

- `src/models.ts`: NestJS decorator classes, timestamped schemas and unique indexes.
- `src/cli-models.ts`: standalone Mongoose models for the seed CLI.
- `config/providers.json`: provider identifiers and board base URLs; edit this file to configure providers.
- `src/providers.ts`: loads and validates provider configuration for schemas and seeding.
- `config/messages.json`: application CLI output and custom validation/error messages.
- `src/messages.ts`: shared message lookup and named placeholder formatting.
- `src/db.ts`: environment-based connection and disconnect helpers.
- `src/seed.ts`: validation, identity rules, URL derivation and seed flow.
- `src/mongo-seed-store.ts`: narrowly scoped MongoDB upserts.
- `scripts/seed-companies.ts`: CLI entry point and write-free dry-run with provider checks.
- `src/verify-boards.ts`: bounded provider requests and response checks before writes.
- `config/board-verification.json`: provider verification URLs, expected response fields, timeout and response size limit.
- `tests/verify-boards.test.ts`: mocked provider success and failure tests; no live API calls during tests.
- `scripts/data/companies.json`: empty curated input.
- `tests/seed.test.ts`: validation, duplicates, ownership, idempotency, adapter and schema tests.
- `package.json`, `package-lock.json`, `tsconfig.json`: dependencies, commands and TypeScript configuration.
- `.env.example`, `.gitignore`: configuration template and ignored local artifacts.
- `README.md`: setup and operational notes.

The schemas use NestJS `@Schema`, `@Prop` and `SchemaFactory`. In a Nest module,
register them with `MongooseModule.forFeature([{ name: Company.name, schema: CompanySchema }, { name: JobSource.name, schema: JobSourceSchema }])`.
The seed CLI uses `cli-models.ts` directly. Explicit `type` options on every property
allow the decorators to work with tsx without emitted decorator type metadata.

Provider names and URLs are configured only in `config/providers.json`, not repeated
in schema enums, TypeScript unions or URL-building code. Add a verified provider key
and HTTPS board base URL there, then restart the process. This URL format supports
boards addressed as a base URL followed by a single board token; other URL formats
would need a separate URL strategy. Provider configuration is not company seed data.

Configure each provider's verification endpoint in `config/board-verification.json`
with exactly one `{boardToken}` placeholder. Greenhouse uses its board metadata
endpoint; Lever and Ashby use public postings endpoints. Their returned job payloads
are used only to check the response and are discarded. Empty postings are treated
as inconclusive, because they cannot reliably prove a token exists; the seed stops
until verification is possible. HTTP errors (including rate limits), unexpected
responses, oversized bodies, redirects and timeouts also stop the run before writes.
No credentials are sent to providers. Endpoints follow the official
[Greenhouse](https://docs.greenhouse.io/job-board),
[Lever](https://github.com/lever/postings-api) and
[Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api) documentation.

Edit application wording in `config/messages.json`. Named placeholders such as
`{companies}` are filled at runtime. Built-in dependency errors (such as Zod's
standard type errors) still come from those dependencies. Field names, index
definitions and validation rules remain code rather than configurable prose.
#   f r e s h e r - j o b - s e a r c h 
 
 
