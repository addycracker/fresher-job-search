import "reflect-metadata";
import {
  encryptedFetch as fetch,
  fixtureSecurity,
  fixturePrivatePath,
} from "./security-fixture.js";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { getConnectionToken } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { configureHttp } from "../apps/api/src/bootstrap.js";
import { readApiConfig } from "../apps/api/src/shared/config/environment.js";
import { JobsController } from "../apps/api/src/modules/jobs/jobs.controller.js";
import { JobsService } from "../apps/api/src/modules/jobs/jobs.service.js";
import {
  JobsRepository,
  buildJobFilter,
} from "../apps/api/src/modules/jobs/jobs.repository.js";
import { JobsQueryDto } from "../apps/api/src/modules/jobs/dto/jobs-query.dto.js";
import { HealthController } from "../apps/api/src/modules/health/health.controller.js";
import { ResponseHandler } from "../apps/api/src/shared/handlers/response.handler.js";
import { ApiException } from "../apps/api/src/shared/exceptions/api.exception.js";
import {
  ERROR_CODES,
  RESPONSE_MESSAGES,
} from "../apps/api/src/shared/constants/index.js";
import {
  API_PATHS,
  type ApiResponse,
  type JobsPage,
  type JobDetails,
  type JobFilters,
} from "../packages/contracts/src/index.js";

const id = "000000000000000000000001";
const fixture = {
  _id: new Types.ObjectId(id),
  title: "Synthetic software role",
  companyDomain: "fixture.test",
  location: "Remote India",
  employmentType: "Full Time",
  provider: "lever",
  url: "https://jobs.fixture.test/job",
  applyUrl: "https://jobs.fixture.test/apply",
  firstSeenAt: new Date("2026-01-01"),
  publishedAt: null,
  descriptionText: "Synthetic description",
  descriptionHtml:
    '<p>Valid description</p><script>secret-script()</script><a href="javascript:alert(1)" onclick="bad()">bad link</a>',
};
const company = {
  domain: "fixture.test",
  name: "Synthetic fixture",
  website: "https://fixture.test",
};
const metadata: JobFilters = {
  locations: ["Remote India"],
  roles: [fixture.title],
  employmentTypes: ["full-time"],
  workModes: ["remote"],
  capabilities: { category: false, workMode: true, indexedSearch: false },
  stats: { totalJobs: 1, totalCompanies: 1, internships: 0 },
};
let empty = false;
let databaseDown = false;
let unexpectedFailure = false;
let lastQuery: JobsQueryDto | undefined;
const repository = {
  async list(query: JobsQueryDto) {
    if (unexpectedFailure) throw new Error("private database diagnostic");
    if (databaseDown)
      throw new ApiException(
        ERROR_CODES.DATABASE,
        RESPONSE_MESSAGES.DATABASE_UNAVAILABLE,
        503,
      );
    lastQuery = query;
    return {
      items: empty || query.page > 1 ? [] : [fixture],
      total: empty ? 0 : 1,
    };
  },
  async companyMap() {
    return new Map([[company.domain, company]]);
  },
  async findById(value: string) {
    return value === id ? fixture : null;
  },
  async filters() {
    return metadata;
  },
};
const connection = {
  readyState: 1,
  db: {
    async command() {
      return { ok: 1 };
    },
  },
};
let app: NestExpressApplication;
let origin = "";

before(async () => {
  const module = await Test.createTestingModule({
    controllers: [JobsController, HealthController],
    providers: [
      JobsService,
      ResponseHandler,
      { provide: JobsRepository, useValue: repository },
      { provide: getConnectionToken(), useValue: connection },
    ],
  }).compile();
  app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureHttp(app, {
    port: 4000,
    uri: "mongodb://fixture.invalid/jobs",
    corsOrigins: ["http://web.fixture.test"],
    production: false,
    swagger: true,
    dnsServers: [],
    security: fixtureSecurity,
  });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
after(async () => {
  await app?.close();
});

test("HTTP listing transforms and validates queries, joins companies and returns a standard envelope", async () => {
  const response = await fetch(
    origin +
      API_PATHS.jobs +
      "?q=software&location=India&employmentType=full-time&workMode=remote&page=1&pageSize=12&sort=oldest",
  );
  const body = (await response.json()) as ApiResponse<JobsPage>;
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  if (!body.success) assert.fail();
  assert.equal(body.data.items[0]?.company.name, company.name);
  assert.equal(body.data.items[0]?.employmentGroup, "full-time");
  assert.equal(body.data.items[0]?.workMode, "remote");
  assert.equal(lastQuery?.page, 1);
  assert.equal(lastQuery?.sort, "oldest");
  assert.equal(body.data.pagination.total, 1);
  assert.equal(body.requestId, response.headers.get("x-request-id"));
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("invalid and unexpected query parameters consistently return HTTP 400", async () => {
  for (const query of [
    "page=0",
    "page=NaN",
    "page=1.2",
    "pageSize=49",
    "pageSize=0",
    "sort=popular",
    "employmentType=other",
    "workMode=onsite",
    "q=a&q=b",
    "q[$ne]=x",
    "unknown=x",
    "q=" + "x".repeat(101),
    "category=engineering",
    "page=1000&pageSize=48",
  ]) {
    const response = await fetch(origin + API_PATHS.jobs + "?" + query);
    const body = (await response.json()) as ApiResponse<unknown>;
    assert.equal(response.status, 400, query);
    assert.equal(body.success, false, query);
    assert.ok("code" in body);
  }
});

test("empty database and out-of-range pages return valid empty pagination", async () => {
  empty = true;
  const response = await fetch(origin + API_PATHS.jobs);
  const body = (await response.json()) as ApiResponse<JobsPage>;
  empty = false;
  assert.ok(body.success);
  assert.deepEqual(body.data.items, []);
  assert.equal(body.data.pagination.totalPages, 0);
  assert.equal(body.data.pagination.hasNextPage, false);
  const page = (await fetch(origin + API_PATHS.jobs + "?page=2").then(
    (result) => result.json(),
  )) as ApiResponse<JobsPage>;
  assert.ok(page.success);
  assert.equal(page.data.items.length, 0);
  assert.equal(page.data.pagination.hasNextPage, false);
});

test("details return safe fields and sanitized descriptions; missing/invalid IDs have correct status", async () => {
  const response = await fetch(origin + API_PATHS.job(id));
  const body = (await response.json()) as ApiResponse<JobDetails>;
  assert.equal(response.status, 200);
  assert.ok(body.success);
  assert.equal(body.data.id, id);
  assert.ok(body.data.descriptionHtml?.includes("Valid description"));
  assert.ok(!body.data.descriptionHtml?.includes("<script"));
  assert.ok(!body.data.descriptionHtml?.includes("javascript:"));
  assert.ok(!body.data.descriptionHtml?.includes("onclick"));
  assert.ok(!("sourceId" in body.data));
  assert.ok(!("boardToken" in body.data));
  assert.equal(
    (await fetch(origin + API_PATHS.job("000000000000000000000002"))).status,
    404,
  );
  assert.equal((await fetch(origin + API_PATHS.job("invalid"))).status, 400);
});

test("filters route precedes parameter route, exposes real capabilities and Swagger documents public routes", async () => {
  const response = await fetch(origin + API_PATHS.filters);
  assert.equal(response.status, 200);
  const body = (await response.json()) as ApiResponse<JobFilters>;
  assert.ok(body.success);
  assert.equal(body.data.capabilities.category, false);
  const document = (await fetch(origin + "/api/docs-json").then((result) =>
    result.json(),
  )) as { paths: Record<string, unknown> };
  for (const path of [
    API_PATHS.jobs,
    API_PATHS.filters,
    "/api/v1/jobs/{id}",
    API_PATHS.health,
    API_PATHS.ready,
  ])
    assert.ok(document.paths[path], path);
});

test("database failures are sanitized and readiness reports unavailable connections", async () => {
  databaseDown = true;
  const response = await fetch(origin + API_PATHS.jobs);
  databaseDown = false;
  const body = (await response.json()) as ApiResponse<unknown>;
  assert.equal(response.status, 503);
  assert.ok(!body.success);
  assert.equal(body.code, ERROR_CODES.DATABASE);
  connection.readyState = 0;
  assert.equal((await fetch(origin + API_PATHS.ready)).status, 503);
  assert.equal((await fetch(origin + API_PATHS.health)).status, 200);
  connection.readyState = 1;
  assert.equal((await fetch(origin + API_PATHS.ready)).status, 200);
});

test("explicit CORS allowlist, request size limit and absence of write endpoints are enforced", async () => {
  const allowed = await fetch(origin + API_PATHS.jobs, {
    headers: { Origin: "http://web.fixture.test" },
  });
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "http://web.fixture.test",
  );
  const denied = await fetch(origin + API_PATHS.jobs, {
    headers: { Origin: "http://evil.fixture.test" },
  });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  assert.equal(
    (await fetch(origin + API_PATHS.jobs, { method: "POST" })).status,
    401,
  );
  const invalidBody = await fetch(origin + API_PATHS.jobs, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid",
  });
  assert.equal(invalidBody.status, 400);
  const invalidBodyResponse =
    (await invalidBody.json()) as ApiResponse<unknown>;
  assert.ok(!invalidBodyResponse.success);
  assert.equal(invalidBodyResponse.code, ERROR_CODES.INVALID_REQUEST);
  assert.equal(
    (
      await fetch(origin + API_PATHS.jobs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "x".repeat(20000) }),
      })
    ).status,
    413,
  );
});

test("unexpected failures preserve HTTP 500 without exposing internal details", async () => {
  unexpectedFailure = true;
  const response = await fetch(origin + API_PATHS.jobs);
  unexpectedFailure = false;
  const body = (await response.json()) as ApiResponse<unknown>;
  assert.equal(response.status, 500);
  assert.ok(!body.success);
  assert.equal(body.code, ERROR_CODES.INTERNAL);
  assert.ok(!JSON.stringify(body).includes("private database diagnostic"));
});

test("environment validation requires explicit origins and production always disables Swagger", () => {
  const environment = {
    API_MONGODB_URI: "mongodb://fixture.test/jobs",
    API_CORS_ORIGINS: "https://web.fixture.test",
    NODE_ENV: "production",
    API_SWAGGER_ENABLED: "true",
    API_CLIENT_KEY: fixtureSecurity.apiKey,
    API_PRIVATE_KEY_PATH: fixturePrivatePath,
  };
  assert.equal(readApiConfig(environment).swagger, false);
  assert.throws(() => readApiConfig({ ...environment, API_CORS_ORIGINS: "*" }));
  assert.throws(() => readApiConfig({ ...environment, API_PORT: "0" }));
  assert.throws(() =>
    readApiConfig({ ...environment, API_MONGODB_URI: "https://fixture.test" }),
  );
});

test("query builder escapes regex input and only builds server-defined filters", () => {
  const query = Object.assign(new JobsQueryDto(), {
    q: ".*",
    role: "[engineer]",
    location: "Bengaluru",
    employmentType: "internship",
    workMode: "remote",
  });
  const filter = buildJobFilter(query, false);
  const conditions = filter.$and!;
  const text = conditions[0]?.$or?.[0]?.title as RegExp;
  assert.equal(text.test("anything"), false);
  assert.equal(text.test("literal .* value"), true);
  assert.deepEqual(buildJobFilter(new JobsQueryDto(), false), {});
  assert.deepEqual(
    buildJobFilter(Object.assign(new JobsQueryDto(), { q: "software" }), true),
    { $and: [{ $text: { $search: "software" } }] },
  );
});

test("missing jobs collection permits empty searches, while index access failures become safe 503 errors", async () => {
  const model = (code: number) =>
    ({
      collection: {
        async indexes() {
          throw { code };
        },
      },
    }) as unknown as ConstructorParameters<typeof JobsRepository>[0];
  const companies = {} as ConstructorParameters<typeof JobsRepository>[1];
  assert.equal(
    await new JobsRepository(model(26), companies).indexedSearch(),
    false,
  );
  await assert.rejects(
    new JobsRepository(model(13), companies).indexedSearch(),
    (error: unknown) =>
      error instanceof ApiException && error.getStatus() === 503,
  );
});
