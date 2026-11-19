import {
  TRANSPORT,
  transportAad,
  type CipherEnvelope,
  type PublicEncryptionKey,
} from "@transport";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export function encode64(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(value);
}
export function decode64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export async function encryptCall(
  publicKey: PublicEncryptionKey,
  path: string,
  apiKey: string,
) {
  const [pathname, query = ""] = path.split("?");
  const id = crypto.randomUUID();
  const aes = await crypto.subtle.generateKey(
    { name: TRANSPORT.AES, length: TRANSPORT.KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
  const rsa = await crypto.subtle.importKey(
    "spki",
    decode64(publicKey.spki),
    { name: TRANSPORT.RSA, hash: TRANSPORT.HASH },
    false,
    ["encrypt"],
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", aes));
  const wrapped = await crypto.subtle.encrypt(
    { name: TRANSPORT.RSA },
    rsa,
    raw,
  );
  raw.fill(0);
  const iv = crypto.getRandomValues(new Uint8Array(TRANSPORT.IV_BYTES));
  iv[0] = iv[0]! & 127;
  const data = await crypto.subtle.encrypt(
    {
      name: TRANSPORT.AES,
      iv,
      additionalData: encoder.encode(transportAad("request", "GET", pathname!)),
      tagLength: TRANSPORT.TAG_BITS,
    },
    aes,
    encoder.encode(JSON.stringify({ id, timestamp: Date.now(), query })),
  );
  const packet: CipherEnvelope = {
    version: 1,
    iv: encode64(iv),
    data: encode64(new Uint8Array(data)),
  };
  return {
    path: pathname!,
    headers: {
      Accept: "application/json",
      [TRANSPORT.HEADERS.API_KEY]: apiKey,
      [TRANSPORT.HEADERS.KEY]: encode64(new Uint8Array(wrapped)),
      [TRANSPORT.HEADERS.PAYLOAD]: encode64(
        encoder.encode(JSON.stringify(packet)),
      ),
    },
    async decrypt(value: unknown, status: number): Promise<unknown> {
      if (
        !value ||
        typeof value !== "object" ||
        !("version" in value) ||
        value.version !== 1 ||
        !("iv" in value) ||
        typeof value.iv !== "string" ||
        !("data" in value) ||
        typeof value.data !== "string"
      )
        throw new Error("Invalid encrypted response");
      const responseIv = decode64(value.iv);
      if (
        responseIv.length !== TRANSPORT.IV_BYTES ||
        (responseIv[0]! & 128) === 0
      )
        throw new Error("Invalid response nonce");
      const result = await crypto.subtle.decrypt(
        {
          name: TRANSPORT.AES,
          iv: responseIv,
          additionalData: encoder.encode(
            transportAad("response", "GET", pathname!, id, status),
          ),
          tagLength: TRANSPORT.TAG_BITS,
        },
        aes,
        decode64(value.data),
      );
      return JSON.parse(decoder.decode(result)) as unknown;
    },
  };
}
