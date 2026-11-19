export const TRANSPORT = {
  VERSION: 1,
  RSA: "RSA-OAEP",
  HASH: "SHA-256",
  AES: "AES-GCM",
  KEY_BITS: 256,
  IV_BYTES: 12,
  TAG_BITS: 128,
  RSA_BITS: 3072,
  HEADERS: {
    API_KEY: "X-API-Key",
    KEY: "X-Encrypted-Key",
    PAYLOAD: "X-Encrypted-Payload",
  },
  PUBLIC_KEY_PATH: "/api/v1/security/public-key",
  MAX_HEADER: 4096,
  CLOCK_SKEW_MS: 60000,
  REPLAY_TTL_MS: 120000,
  MAX_REPLAYS: 10000,
} as const;
export interface CipherEnvelope {
  version: 1;
  iv: string;
  data: string;
}
export interface PublicEncryptionKey {
  keyId: string;
  spki: string;
}
export const transportAad = (
  direction: "request" | "response",
  method: string,
  path: string,
  id = "",
  status = 0,
) => `fresherjobs:v1:${direction}:${method}:${path}:${id}:${status}`;
