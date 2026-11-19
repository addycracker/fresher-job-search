import {
  generateKeyPairSync,
  privateDecrypt,
  createDecipheriv,
  createCipheriv,
  randomBytes,
  constants,
} from "node:crypto";
import {
  TRANSPORT,
  transportAad,
} from "../packages/contracts/src/transport.js";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import { securityFromKey } from "../apps/api/src/shared/security/security-config.js";
import { encryptCall } from "../apps/web/src/lib/encrypted-transport.js";
export const fixturePem = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;
export const fixtureSecurity = securityFromKey(
  "synthetic-api-key-for-unit-tests-only",
  fixturePem,
  1000,
);
const fixtureDirectory = mkdtempSync(join(tmpdir(), "fresherjobs-security-"));
export const fixturePrivatePath = join(fixtureDirectory, "fixture.pem");
writeFileSync(fixturePrivatePath, fixturePem, { mode: 0o600 });
after(() => {
  unlinkSync(fixturePrivatePath);
  rmdirSync(fixtureDirectory);
});
export const encryptedFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (
    !(
      url.pathname === "/api/v1/jobs" ||
      url.pathname.startsWith("/api/v1/jobs/")
    ) ||
    (init?.method && init.method !== "GET")
  )
    return globalThis.fetch(input, init);
  const call = await encryptCall(
    fixtureSecurity.publicKey,
    url.pathname + url.search,
    fixtureSecurity.apiKey,
  );
  const response = await globalThis.fetch(url.origin + call.path, {
    ...init,
    headers: { ...call.headers, ...init?.headers },
  });
  const wire: unknown = await response.json();
  const body =
    wire && typeof wire === "object" && "version" in wire
      ? await call.decrypt(wire, response.status)
      : wire;
  return Response.json(body, {
    status: response.status,
    headers: response.headers,
  });
};
export function mockEncryptedFetch(
  reply: () => Response,
  observe?: (url: string) => void,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === TRANSPORT.PUBLIC_KEY_PATH)
      return Response.json(fixtureSecurity.publicKey);
    const headers = new Headers(init?.headers);
    const aes = privateDecrypt(
      {
        key: fixtureSecurity.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(headers.get(TRANSPORT.HEADERS.KEY)!, "base64"),
    );
    const packet = JSON.parse(
      Buffer.from(headers.get(TRANSPORT.HEADERS.PAYLOAD)!, "base64").toString(),
    ) as { iv: string; data: string };
    const bytes = Buffer.from(packet.data, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      aes,
      Buffer.from(packet.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(transportAad("request", "GET", url.pathname)));
    decipher.setAuthTag(bytes.subarray(-16));
    const decoded = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(0, -16)),
        decipher.final(),
      ]).toString(),
    ) as { query: string; id: string };
    if (url.search) throw new Error("Query leaked into wire URL");
    observe?.(url.href + "?" + decoded.query);
    const response = reply();
    const body = await response.text();
    const iv = randomBytes(12);
    iv[0] = iv[0]! | 128;
    const cipher = createCipheriv("aes-256-gcm", aes, iv);
    cipher.setAAD(
      Buffer.from(
        transportAad(
          "response",
          "GET",
          url.pathname,
          decoded.id,
          response.status,
        ),
      ),
    );
    const data = Buffer.concat([
      cipher.update(body),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return Response.json(
      { version: 1, iv: iv.toString("base64"), data: data.toString("base64") },
      { status: response.status },
    );
  };
}
