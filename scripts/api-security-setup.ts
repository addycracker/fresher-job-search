import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
import { TRANSPORT } from "../packages/contracts/src/transport.js";

// Local setup only. Refuse to replace keys or environment values.
const privatePath = ".secrets/api-private.pem";
if (
  existsSync(privatePath) ||
  [".env.development", "apps/web/.env.local"].some(
    (file) =>
      existsSync(file) &&
      /^(?:API_CLIENT_KEY|NEXT_PUBLIC_API_KEY|API_PRIVATE_KEY_PATH)=.+$/m.test(
        readFileSync(file, "utf8"),
      ),
  )
) {
  throw new Error(
    "Security configuration already exists; rotate keys explicitly instead of overwriting it.",
  );
}
const pair = generateKeyPairSync("rsa", {
  modulusLength: TRANSPORT.RSA_BITS,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const apiKey = randomBytes(32).toString("hex");
mkdirSync(".secrets", { recursive: true });
writeFileSync(privatePath, pair.privateKey, { flag: "wx", mode: 0o600 });
function setLocalValues(file: string, values: Record<string, string>) {
  let content = existsSync(file) ? readFileSync(file, "utf8") : "";
  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    content = pattern.test(content)
      ? content.replace(pattern, `${name}=${value}`)
      : content + `\n${name}=${value}\n`;
  }
  writeFileSync(file, content);
}
setLocalValues(".env.development", {
  API_CLIENT_KEY: apiKey,
  API_PRIVATE_KEY_PATH: privatePath,
});
appendFileSync(
  ".env.development",
  "\nAPI_RATE_LIMIT=120\nAPI_RATE_WINDOW_MS=60000\n",
);
setLocalValues("apps/web/.env.local", { NEXT_PUBLIC_API_KEY: apiKey });
console.log(
  "Local encryption keys configured. No credentials were printed. Restart API and web processes.",
);
