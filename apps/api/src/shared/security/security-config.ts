import { readFileSync } from "node:fs";
import {
  createPrivateKey,
  createPublicKey,
  createHash,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";
import { TRANSPORT } from "../../../../../packages/contracts/src/transport.js";

export interface SecurityConfig {
  apiKey: string;
  privateKey: KeyObject;
  publicKey: { keyId: string; spki: string };
  rateLimit: number;
  windowMs: number;
  trustProxy: string[];
}
export class InvalidEncryptionKeyError extends Error {
  constructor() {
    super("Invalid encryption key");
  }
}
export function securityFromKey(
  apiKey: string,
  pem: string,
  rateLimit = 120,
  windowMs = 60000,
  trustProxy: string[] = [],
): SecurityConfig {
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(pem);
  } catch {
    throw new InvalidEncryptionKeyError();
  }
  if (
    privateKey.asymmetricKeyType !== "rsa" ||
    (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < TRANSPORT.RSA_BITS
  )
    throw new InvalidEncryptionKeyError();
  const der = createPublicKey(privateKey).export({
    type: "spki",
    format: "der",
  });
  return {
    apiKey,
    privateKey,
    publicKey: {
      keyId: createHash("sha256").update(der).digest("hex"),
      spki: der.toString("base64"),
    },
    rateLimit,
    windowMs,
    trustProxy,
  };
}
export function readSecurityConfig(env: NodeJS.ProcessEnv): SecurityConfig {
  const values = z
    .object({
      apiKey: z.string().min(32).max(256),
      path: z.string().min(1),
      rate: z.coerce.number().int().min(1).max(10000),
      window: z.coerce.number().int().min(1000).max(3600000),
    })
    .parse({
      apiKey: env.API_CLIENT_KEY,
      path: env.API_PRIVATE_KEY_PATH,
      rate: env.API_RATE_LIMIT ?? 120,
      window: env.API_RATE_WINDOW_MS ?? 60000,
    });
  return securityFromKey(
    values.apiKey,
    readFileSync(values.path, "utf8"),
    values.rate,
    values.window,
    (env.API_TRUST_PROXY ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
