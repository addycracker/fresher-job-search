# Job ingestion worker — ECS Fargate preparation

A one-shot TypeScript worker that reads existing MongoDB `JobSource` records,
fetches public postings from Greenhouse, Lever and Ashby, and upserts normalized
jobs. It runs once and exits; it is suitable for an ECS Fargate task rather than
an HTTP service. It requires no Gemini or OpenAI credentials.

This first ingestion milestone stores all public jobs. Fresher classification,
closed-job reconciliation and scheduling are not implemented. Discovery and the
manual seed script are unchanged. No AWS resources are created by this code.

## Flow

1. Load optional local environment files and validate CLI configuration. Default
   to dry-run. Shell settings take precedence over `.env.development`, then `.env`.
2. Connect using the shared MongoDB helper, with bounded driver operation timeouts.
   Read up to `INGESTION_MAX_SOURCES` sources in deterministic `_id` order. Check
   that the source's linked company domain exists before processing it.
3. In write mode only, create Job/lease indexes, then acquire an expiring per-source
   lease. A source owned by another task is skipped. Existing Company and JobSource
   schemas are not changed; leases use a separate collection.
4. Fetch and validate provider responses. Greenhouse requests content; Lever follows
   `skip`/`limit` pagination; Ashby uses its board response and excludes `isListed=false`
   postings. An empty valid feed is accepted. An invalid token, bad response shape,
   oversized response, exhausted retries or pagination limit fails that source.
5. Normalize jobs and deduplicate IDs within the run. Renew the source lease before
   writing each page. Upsert using unique `(provider, boardToken, externalId)`
   identities. Jobs also hold a Mongoose ObjectId `source` reference to JobSource
   plus the company domain. A rerun updates rows instead of creating duplicates.
6. In write mode, update `syncCursor` after each persisted page. Update
   `lastSyncedAt` only after the full board succeeds. Failure sets `syncStatus=failed`
   and preserves the previous last successful synchronization time and cursor.
   The cursor is diagnostic in this version: reruns start at page zero and use
   idempotent upserts. Successful completion clears it.
7. Release the lease, continue to other sources, emit JSON summaries and disconnect.
   SIGTERM/SIGINT and the run deadline abort HTTP work, stop starting new page writes,
   and allow lease/connection cleanup. Failed or partial runs return exit code 1.

All endpoint URLs, pagination sizes, retry settings and bounds live in
`config/job-ingestion.json`. CLI messages remain in `config/messages.json`.
Provider behavior follows the official [Greenhouse API](https://docs.greenhouse.io/job-board),
[Lever API](https://github.com/lever/postings-api) and
[Ashby API](https://developers.ashbyhq.com/docs/public-job-posting-api) documentation.

## Local testing

From the repository root:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Tests mock ATS HTTP requests and MongoDB; they require no API keys, database or AWS
account. Synthetic fixtures live only in tests, never in ingestion input.

To inspect real sources and planned jobs without writing:

```powershell
npm run ingest:jobs -- --dry-run
```

Unlike discovery dry-run, ingestion dry-run connects to MongoDB **to read seeded
sources and companies**. It fetches public ATS data but does not create indexes,
acquire leases, insert/update jobs or modify synchronization metadata. It does not
read `scripts/data/companies.json`.

Write mode requires both `--write` and `INGESTION_ALLOW_WRITES=true`. After write
approval, the command would be `npm run ingest:jobs -- --write`; this command has
not been executed during implementation.

## Environment

| Variable | Default / purpose |
| --- | --- |
| `MONGODB_URI` | Required; intended Atlas database, never logged |
| `DNS_SERVERS` | Optional shared connection helper DNS override |
| `INGESTION_MAX_SOURCES` | `1000`; sources selected per run |
| `INGESTION_TIMEOUT_MS` | `840000`; whole-run deadline |
| `INGESTION_DATABASE_TIMEOUT_MS` | `10000`; database operation limit |
| `INGESTION_ALLOW_WRITES` | `false`; must be `true` alongside `--write` for writes |

The lease duration is 120 seconds by default. It exceeds the configured worst-case
HTTP retry window, and is renewed before page writes and successful completion.
Keep it longer than the total request retries plus database operation time if
adjusting these settings. Failed/terminated task leases can be reclaimed after
expiry. Keep task clocks synchronized and avoid suspending live worker processes.

## Docker

Start Docker Desktop's Linux engine, then build from the repository root:

```powershell
docker build -f apps/job-ingestion/Dockerfile -t fresherjobs-ingestion:local .
docker run --rm --env-file .env.development fresherjobs-ingestion:local node dist/apps/job-ingestion/src/index.js --dry-run
```

The container defaults to `--write`; database writes still require
`INGESTION_ALLOW_WRITES=true`. The command above explicitly overrides it for a
dry-run. For an intentional local write, run:

```powershell
docker run --rm --env-file .env.development -e INGESTION_ALLOW_WRITES=true fresherjobs-ingestion:local
```

The multi-stage build emits JavaScript, installs
production dependencies, and runs as the unprivileged `node` user. Local `.env`
files are excluded from the build context and never copied into the image. The
runtime contains the worker, shared modules, and configuration, with no frontend
or API server. No ports are exposed. The root dependency set is reused; no new npm
dependencies were added for ingestion.

The Docker CLI is available on this machine, but the Docker engine was not running
during implementation. Image build and container execution still need verification.

## ECS Fargate task template

`ecs-task-definition.example.json` is a reviewable template, not a deployment
script. Its 256 CPU / 512 MiB configuration, `awsvpc` networking and 120-second
stop timeout follow [AWS Fargate task-definition parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html).
The task is a batch job: do not initially run it as an always-on ECS service that
continually restarts it when it exits.

Before a future deployment, after approval:

- Build and push the reviewed image to ECR.
- Replace all `${...}` placeholders with real image, region, execution-role, log
  group and secret ARNs. ECS does not expand these placeholders automatically.
- Use Secrets Manager or SSM for `MONGODB_URI`. The execution role needs permission
  to pull the image, emit logs and retrieve that secret (and decrypt it when needed).
  This worker calls no AWS APIs, so it does not itself require a task IAM role.
- Supply subnets/security groups with HTTPS egress to the configured ATS endpoints
  and connectivity to Atlas. Ensure Atlas network access permits the task's egress.
- For an initial dry-run, override the template's command with `--dry-run` and set
  `INGESTION_ALLOW_WRITES=false`. No ECR, IAM,
  ECS cluster, networking, CloudWatch resources or schedule is provisioned here.
- The supplied template now uses `--write` with `INGESTION_ALLOW_WRITES=true` for
  intentional ingestion writes.

The task template is configured for ingestion writes. The image selects the write
command but requires write permission in its environment. Neither has been deployed
to AWS by this implementation.

## Data and operational limits

- No records are deleted, and disappearing jobs are not automatically marked closed.
  Job closure needs a separate complete-snapshot reconciliation milestone.
- Writes are nontransactional. Earlier successful pages remain if a later page
  fails; rerunning repairs partial progress. A partially successful MongoDB bulk
  operation can write some rows before raising an error; summary insert/update
  counts include completed acknowledged batches, not a rollback guarantee.
- `firstSeenAt` is insertion-only, `lastSeenAt` advances monotonically. Provider
  publication dates are stored only when actually supplied. No dates are guessed.
- HTML descriptions are stored as supplied. Sanitize before any future HTML display.
- Source leases reduce overlapping task races. Dry-runs never acquire locks and
  may make overlapping read-only provider requests.
- Offset pagination can change while an employer publishes/removes postings;
  deduplication limits repeated rows, and future full runs re-fetch the board.
- Jobs from inactive/unlisted Ashby postings are skipped. No classifier, enrichment,
  queue, retry service or scheduler is included.
- Increasing `INGESTION_MAX_SOURCES` may require a longer runtime or future
  partitioning; this version processes sources sequentially.

## Files

- `src/index.ts`: CLI lifecycle, write gate, shutdown and connection cleanup.
- `src/config.ts`, `config/job-ingestion.json`: environment and provider settings.
- `src/providers.ts`: bounded HTTP fetching, pagination and normalization.
- `src/models.ts`: Job schema/indexes and separate source-lease model.
- `src/store.ts`: source reads, leases, bulk upserts and sync updates.
- `src/worker.ts`, `src/types.ts`: orchestration, summaries and interfaces.
- `Dockerfile`, `ecs-task-definition.example.json`: container and Fargate preparation.
- `tests/ingestion-{providers,store,worker}.test.ts`: mocked behavior tests.

Existing shared Company/JobSource schemas, manual seeding and discovery code were
left unchanged by this ingestion milestone.
