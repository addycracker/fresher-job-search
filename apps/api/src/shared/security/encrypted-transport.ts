import {
  constants,
  createDecipheriv,
  createCipheriv,
  createHash,
  privateDecrypt,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  TRANSPORT,
  transportAad,
} from "../../../../../packages/contracts/src/transport.js";
import type { SecurityConfig } from "./security-config.js";
import type { ApiRequest } from "../logger/request-context.js";

export const SECURITY_ERRORS = {
  UNAUTHORIZED: "A valid API key is required",
  ENCRYPTION_REQUIRED: "A valid encrypted request is required",
  REPLAY_REJECTED: "The request has expired or was already used",
  RATE_LIMITED: "Too many requests. Please try again later",
  SECURITY_BUSY: "Request verification is temporarily unavailable",
} as const;
export function securityFailure(
  req: Request,
  res: Response,
  status: number,
  code: keyof typeof SECURITY_ERRORS,
) {
  res.status(status).json({
    success: false,
    code,
    message: SECURITY_ERRORS[code],
    requestId: (req as ApiRequest).requestId,
    timestamp: new Date().toISOString(),
  });
}
const envelope = z
  .object({
    version: z.literal(1),
    iv: z.string().max(24),
    data: z.string().max(TRANSPORT.MAX_HEADER),
  })
  .strict();
const payload = z
  .object({
    id: z.uuid(),
    timestamp: z.number().int(),
    query: z.string().max(1500),
  })
  .strict();
function base64(value: string) {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error();
  return Buffer.from(value, "base64");
}
export function createEncryptedTransport(config: SecurityConfig) {
  const expectedKey = createHash("sha256").update(config.apiKey).digest();
  const used = new Map<string, number>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") return next();
    const key = req.get(TRANSPORT.HEADERS.API_KEY) ?? "";
    if (
      key.length > 256 ||
      !timingSafeEqual(createHash("sha256").update(key).digest(), expectedKey)
    )
      return securityFailure(req, res, 401, "UNAUTHORIZED");
    if (req.path === TRANSPORT.PUBLIC_KEY_PATH && req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.json(config.publicKey);
      return;
    }
    let aes: Buffer | undefined;
    try {
      if (req.method !== "GET" || req.url.includes("?")) throw new Error();
      const wrapped = req.get(TRANSPORT.HEADERS.KEY) ?? "";
      const encrypted = req.get(TRANSPORT.HEADERS.PAYLOAD) ?? "";
      if (wrapped.length > 1024 || encrypted.length > TRANSPORT.MAX_HEADER)
        throw new Error();
      aes = privateDecrypt(
        {
          key: config.privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        base64(wrapped),
      );
      if (aes.length !== TRANSPORT.KEY_BITS / 8) throw new Error();
      const packet = envelope.parse(
        JSON.parse(base64(encrypted).toString("utf8")),
      );
      const iv = base64(packet.iv),
        bytes = base64(packet.data);
      if (
        iv.length !== TRANSPORT.IV_BYTES ||
        (iv[0]! & 128) !== 0 ||
        bytes.length < 16
      )
        throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", aes, iv);
      decipher.setAAD(
        Buffer.from(transportAad("request", req.method, req.path)),
      );
      decipher.setAuthTag(bytes.subarray(-16));
      const decoded = payload.parse(
        JSON.parse(
          Buffer.concat([
            decipher.update(bytes.subarray(0, -16)),
            decipher.final(),
          ]).toString("utf8"),
        ),
      );
      const method = req.method,
        path = req.path;
      const json = res.json.bind(res);
      res.setHeader("Cache-Control", "no-store");
      res.json = ((body: unknown) => {
        const responseIv = randomBytes(TRANSPORT.IV_BYTES);
        responseIv[0] = responseIv[0]! | 128; // Separate request/response nonce spaces.
        const cipher = createCipheriv("aes-256-gcm", aes!, responseIv);
        cipher.setAAD(
          Buffer.from(
            transportAad("response", method, path, decoded.id, res.statusCode),
          ),
        );
        const data = Buffer.concat([
          cipher.update(JSON.stringify(body), "utf8"),
          cipher.final(),
          cipher.getAuthTag(),
        ]);
        return json({
          version: 1,
          iv: responseIv.toString("base64"),
          data: data.toString("base64"),
        });
      }) as Response["json"];
      res.once("finish", () => aes?.fill(0));
      res.once("close", () => aes?.fill(0));
      const now = Date.now();
      for (const [identity, expires] of used) {
        if (expires > now) break;
        used.delete(identity);
      }
      const identity = createHash("sha256").update(aes).digest("hex");
      if (
        Math.abs(now - decoded.timestamp) > TRANSPORT.CLOCK_SKEW_MS ||
        used.has(identity) ||
        used.has(decoded.id)
      )
        return securityFailure(req, res, 409, "REPLAY_REJECTED");
      if (used.size + 2 > TRANSPORT.MAX_REPLAYS)
        return securityFailure(req, res, 503, "SECURITY_BUSY");
      used.set(identity, now + TRANSPORT.REPLAY_TTL_MS);
      used.set(decoded.id, now + TRANSPORT.REPLAY_TTL_MS);
      req.url = path + (decoded.query ? "?" + decoded.query : "");
      return next();
    } catch {
      aes?.fill(0);
      return securityFailure(req, res, 400, "ENCRYPTION_REQUIRED");
    }
  };
}
