import "reflect-metadata";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { Controller, Get, Req } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request } from "express";
import { configureHttp } from "../apps/api/src/bootstrap.js";
import { fixtureSecurity } from "./security-fixture.js";
import { encryptCall } from "../apps/web/src/lib/encrypted-transport.js";
import {
  createApiClient,
  ApiClientError,
} from "../apps/web/src/lib/api-client.js";
import { TRANSPORT } from "../packages/contracts/src/transport.js";
let observedQuery: unknown;
@Controller("v1/jobs")
class FixtureController {
  @Get() read(@Req() req: Request) {
    observedQuery = req.query;
    return {
      success: true,
      message: "Fixture response",
      requestId: "fixture-request",
      timestamp: new Date().toISOString(),
      data: { items: [], pagination: { total: 0 } },
    };
  }
}
let app: NestExpressApplication, origin: string;
const config = {
  port: 4000,
  uri: "mongodb://fixture.invalid/jobs",
  corsOrigins: ["https://web.fixture.test"],
  production: false,
  swagger: false,
  dnsServers: [],
  security: fixtureSecurity,
};
before(async () => {
  const module = await Test.createTestingModule({
    controllers: [FixtureController],
  }).compile();
  app = module.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  configureHttp(app, config);
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
after(async () => {
  await app?.close();
});
test("frontend and server exchange encrypted requests/responses and generate fresh AES keys per call", async () => {
  const client = createApiClient(
    () => origin,
    fetch,
    () => fixtureSecurity.apiKey,
  );
  assert.deepEqual((await client.jobs({ q: "secret-query" })).items, []);
  assert.equal((observedQuery as Record<string, string>).q, "secret-query");
  const a = await encryptCall(
    fixtureSecurity.publicKey,
    "/api/v1/jobs?q=hidden",
    fixtureSecurity.apiKey,
  );
  const b = await encryptCall(
    fixtureSecurity.publicKey,
    "/api/v1/jobs?q=hidden",
    fixtureSecurity.apiKey,
  );
  assert.notEqual(
    a.headers[TRANSPORT.HEADERS.KEY],
    b.headers[TRANSPORT.HEADERS.KEY],
  );
  assert.equal(a.path.includes("?"), false);
  const response = await fetch(origin + a.path, { headers: a.headers });
  const wire: unknown = await response.json();
  assert.ok(!JSON.stringify(wire).includes("Fixture response"));
  assert.ok(((await a.decrypt(wire, 200)) as { success: boolean }).success);
  await assert.rejects(a.decrypt(wire, 201));
  await assert.rejects(b.decrypt(wire, 200));
});
test("missing or incorrect API keys and plaintext job requests are rejected", async () => {
  assert.equal((await fetch(origin + "/api/v1/jobs")).status, 401);
  assert.equal((await fetch(origin + "/API/V1/JOBS")).status, 401);
  assert.equal(
    (
      await fetch(origin + "/api/v1/jobs", {
        headers: { "X-API-Key": "wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(origin + "/api/v1/jobs", {
        headers: { "X-API-Key": fixtureSecurity.apiKey },
      })
    ).status,
    400,
  );
});
test("tampered packets, mismatched paths, exposed query strings and replays never reach the controller", async () => {
  const call = await encryptCall(
    fixtureSecurity.publicKey,
    "/api/v1/jobs",
    fixtureSecurity.apiKey,
  );
  const packet = JSON.parse(
    Buffer.from(call.headers[TRANSPORT.HEADERS.PAYLOAD], "base64").toString(),
  ) as { version: number; iv: string; data: string };
  const ciphertext = Buffer.from(packet.data, "base64");
  ciphertext[0] = ciphertext[0]! ^ 1;
  packet.data = ciphertext.toString("base64");
  const forged = {
    ...call.headers,
    [TRANSPORT.HEADERS.PAYLOAD]: Buffer.from(JSON.stringify(packet)).toString(
      "base64",
    ),
  };
  assert.equal(
    (await fetch(origin + call.path, { headers: forged })).status,
    400,
  );
  assert.equal(
    (await fetch(origin + call.path + "/other", { headers: call.headers }))
      .status,
    400,
  );
  assert.equal(
    (await fetch(origin + call.path + "?q=exposed", { headers: call.headers }))
      .status,
    400,
  );
  assert.equal(
    (await fetch(origin + call.path, { headers: call.headers })).status,
    200,
  );
  const replay = await fetch(origin + call.path, { headers: call.headers });
  assert.equal(replay.status, 409);
  assert.equal(
    ((await call.decrypt(await replay.json(), 409)) as { code: string }).code,
    "REPLAY_REJECTED",
  );
});
test("expired authenticated requests return an encrypted 409 response", async () => {
  const realNow = Date.now;
  let call: Awaited<ReturnType<typeof encryptCall>>;
  try {
    Date.now = () => realNow() - TRANSPORT.CLOCK_SKEW_MS * 3;
    call = await encryptCall(
      fixtureSecurity.publicKey,
      "/api/v1/jobs",
      fixtureSecurity.apiKey,
    );
  } finally {
    Date.now = realNow;
  }
  const response = await fetch(origin + call!.path, { headers: call!.headers });
  assert.equal(response.status, 409);
  assert.equal(
    ((await call!.decrypt(await response.json(), 409)) as { code: string })
      .code,
    "REPLAY_REJECTED",
  );
});

test("plaintext successful responses are never accepted by the frontend", async () => {
  const client = createApiClient(
    () => origin,
    async (input) =>
      String(input).endsWith(TRANSPORT.PUBLIC_KEY_PATH)
        ? Response.json(fixtureSecurity.publicKey)
        : Response.json({
            success: true,
            data: [],
            message: "fake",
            requestId: "fake",
            timestamp: new Date().toISOString(),
          }),
    () => fixtureSecurity.apiKey,
  );
  await assert.rejects(client.jobs(), ApiClientError);
});
test("rate limits use 429 and Retry-After, Helmet remains enabled, and spoofed forwarded addresses do not bypass limits", async () => {
  const module = await Test.createTestingModule({}).compile();
  const limited = module.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  configureHttp(limited, {
    ...config,
    security: { ...fixtureSecurity, rateLimit: 2 },
  });
  await limited.listen(0, "127.0.0.1");
  try {
    const url = (await limited.getUrl()) + TRANSPORT.PUBLIC_KEY_PATH;
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await fetch(url, { headers: { "X-API-Key": fixtureSecurity.apiKey } }))
          .status,
        200,
      );
    const blocked = await fetch(url, {
      headers: {
        "X-API-Key": fixtureSecurity.apiKey,
        "X-Forwarded-For": "192.0.2.7",
      },
    });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("retry-after"));
    assert.equal(blocked.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await limited.close();
  }
});
