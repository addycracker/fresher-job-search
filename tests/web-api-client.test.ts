import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiClient,
  ApiClientError,
  queryString,
} from "../apps/web/src/lib/api-client.js";
import { parseJobsSearch } from "../apps/web/src/features/jobs/services/query.js";
import { API_PATHS } from "../packages/contracts/src/index.js";
import { mockEncryptedFetch, fixtureSecurity } from "./security-fixture.js";

test("frontend client uses shared API routes, bounded query parameters and success envelopes", async () => {
  const requests: string[] = [];
  const request = mockEncryptedFetch(
    () => {
      return Response.json({
        success: true,
        message: "Test response",
        requestId: "mock-request",
        timestamp: new Date().toISOString(),
        data: {
          items: [],
          pagination: {
            page: 2,
            pageSize: 12,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      });
    },
    (url) => requests.push(url),
  );
  const client = createApiClient(
    () => "https://api.fixture.test",
    request,
    () => fixtureSecurity.apiKey,
  );
  const result = await client.jobs({
    q: "software engineer",
    page: 2,
    pageSize: 12,
  });
  assert.equal(result.items.length, 0);
  assert.ok(
    requests[0]?.startsWith("https://api.fixture.test" + API_PATHS.jobs),
  );
  const url = new URL(requests[0]!);
  assert.equal(url.searchParams.get("q"), "software engineer");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(
    queryString({ location: "Delhi NCR", workMode: "remote" }),
    "location=Delhi+NCR&workMode=remote",
  );
});

test("frontend client consistently rejects API errors, invalid JSON and malformed envelopes", async () => {
  const client = createApiClient(
    () => "https://api.fixture.test",
    mockEncryptedFetch(() =>
      Response.json(
        {
          success: false,
          code: "DATABASE_UNAVAILABLE",
          message: "Unavailable",
          requestId: "mock-id",
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      ),
    ),
    () => fixtureSecurity.apiKey,
  );
  await assert.rejects(
    client.filters(),
    (error: unknown) =>
      error instanceof ApiClientError &&
      error.status === 503 &&
      error.requestId === "mock-id",
  );
  const malformed = createApiClient(
    () => "https://api.fixture.test",
    mockEncryptedFetch(() => Response.json({ items: [] })),
    () => fixtureSecurity.apiKey,
  );
  await assert.rejects(malformed.jobs(), /couldn’t load/);
  const html = createApiClient(
    () => "https://api.fixture.test",
    mockEncryptedFetch(
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
    ),
    () => fixtureSecurity.apiKey,
  );
  await assert.rejects(html.jobs(), ApiClientError);
});

test("URL query parsing round-trips supported filters without inventing categories or job data", () => {
  const parsed = parseJobsSearch(
    new URLSearchParams(
      "q=developer&location=Pune&employmentType=internship&workMode=remote&page=2&sort=oldest",
    ),
  );
  assert.equal(parsed.employmentType, "internship");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.sort, "oldest");
  assert.equal(parsed.category, undefined);
  assert.equal(
    parseJobsSearch(new URLSearchParams("employmentType=invalid"))
      .employmentType,
    undefined,
  );
});
