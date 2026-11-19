# Encrypted API transport

The web client now encrypts each job API request and decrypts each response. No discovery or ingestion code is involved.

## Flow

1. The client retrieves the RSA public key from `GET /api/v1/security/public-key`, sending `X-API-Key`. This public-key bootstrap returns plaintext JSON and is cached in client memory for five minutes.
2. For every job API call, Web Crypto generates a fresh random 256-bit AES key and a 96-bit nonce. It encrypts the query string, timestamp and unique request ID with AES-256-GCM.
3. The AES key is wrapped using RSA-OAEP with SHA-256 and the server's 3072-bit public key. Only the wrapped key is sent in `X-Encrypted-Key`; the raw AES key is never sent. `X-Encrypted-Payload` contains a base64-encoded JSON cipher envelope. `X-API-Key` accompanies the call.
4. NestJS's transport middleware validates the API key, unwraps the AES key using the server-only private key, verifies/decrypts the request and checks its timestamp and replay identities. It passes the decrypted query to the existing DTO/controller/service/repository flow.
5. The normal response envelope, including application errors after successful decryption, is encrypted with the same AES key and a fresh response nonce. The client decrypts it before normal envelope parsing. The nonce high bit separates request and response nonce spaces. GCM additional authenticated data binds direction, method and path; responses also bind request ID and HTTP status.

Wire responses have `{ version: 1, iv, data }`. `data` contains ciphertext followed by the 128-bit GCM tag, in base64. There is no plaintext success fallback. Normal HTTP status codes remain intact. No keys, encrypted headers, decrypted queries or payloads are logged by application request logging.

The existing APIs are GET/read-only. Their query payload is encrypted in headers; paths, job IDs, HTTP methods and status codes remain routing metadata. Unencrypted query parameters on protected routes are rejected. No generic POST/CRUD protocol was introduced.

## Local setup

```powershell
# First setup only; refuses to overwrite an existing private key or populated key settings.
npm run api:security:setup
npm run api:dev
# Another terminal:
npm run web:dev
```

Local setup has already been run in this checkout. It generated `.secrets/api-private.pem`, appended API settings to the existing `.env.development`, and added the matching public browser-client key to `apps/web/.env.local`. Existing MongoDB/LLM credentials were preserved. `.secrets` is excluded from Git and Docker contexts. No database writes or deployment occurred.

| Variable               | Meaning                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `API_CLIENT_KEY`       | Required, 32–256 characters; validates `X-API-Key` using a constant-time hash comparison                                              |
| `API_PRIVATE_KEY_PATH` | Required filesystem path to a PKCS#8 RSA private key, at least 3072 bits; mounted read-only from a secret manager in production       |
| `NEXT_PUBLIC_API_KEY`  | Same client key, supplied before building Next.js; visible in browser code                                                            |
| `API_RATE_LIMIT`       | Requests per IP per window; default 120                                                                                               |
| `API_RATE_WINDOW_MS`   | Window in milliseconds; default 60000                                                                                                 |
| `API_TRUST_PROXY`      | Optional comma-separated exact trusted proxy IPs/CIDRs; blank by default, so arbitrary forwarded IP headers cannot bypass rate limits |

Never use the private RSA key in a `NEXT_PUBLIC_` variable. The setup helper is for local development; production should provision and mount keys through its secret manager. On Windows, enforce appropriate file ACLs in addition to file mode settings.

Changing the browser-client API key requires rebuilding the frontend. RSA rotation requires replacing the mounted private key and restarting all API instances with the same key pair; currently there is no overlapping-key rotation window. Existing clients cache the old public key for up to five minutes and may need a reload. Key material is not persisted in browser storage.

## Authentication and transport limits

`X-API-Key` is checked, but a static key shipped to a public browser **is observable and reusable by visitors**. It identifies this public client; it does not authenticate a person or prevent an authorized browser user from decrypting/scraping public jobs. No login/session system was added.

HTTPS is required in production for server authentication, public-key authenticity, headers and routing metadata. Browser Web Crypto requires a secure context; localhost is allowed for development. Custom payload encryption does not replace TLS, provide forward secrecy for recorded traffic after RSA-key compromise, or protect against XSS/browser compromise. Configure gateways/APM to redact these security headers and never record decrypted payloads.

Authentication failures, invalid encryption packets, parser errors and rate-limit failures before a trusted AES context is established return safe **plaintext error envelopes**. Public-key bootstrap and health/readiness probes also remain plaintext JSON over HTTPS. Valid decrypted job requests receive encrypted success and application-error bodies. CORS preflight is allowed without authentication; an explicit origin allowlist remains in force. Swagger is still disabled in production; its development query UI does not construct encrypted headers automatically.

Helmet remains enabled. `express-rate-limit` runs before RSA decryption on protected job/bootstrap routes, including failed authentication attempts. It sends HTTP 429 and `Retry-After`. It does not trust spoofed forwarded IPs unless a proxy range is explicitly configured. Health probes are exempt. SSR requests share the Next.js server's source IP, so tune the limit for expected traffic.

Replay protection rejects requests outside a ±60-second clock window, reused AES keys and reused request IDs, with HTTP 409. Its bounded memory cache fails closed with HTTP 503 if capacity is exhausted. API and browser clocks must be reasonably synchronized.

Both rate limiting and replay protection are **per API process**, reset on restart, and are not globally coordinated across replicas. Configure shared/edge limits and a shared replay store before claiming distributed enforcement. No Redis, additional database writes or AWS infrastructure were added for this milestone.

## Verification

```powershell
npm test
npm run typecheck:all
npm run lint
npm run build:all
# With both local servers running:
npm run test:browser
```

Tests use generated temporary RSA keys and mocked MongoDB. They cover browser/server crypto interoperability, fresh keys, encrypted success/errors, invalid API keys, tampering, path/status/request binding, replay rejection, plaintext-response rejection, CORS, Helmet and rate limits. Existing validation and persistence tests continue to run. Health probes can still be checked with ordinary HTTP tools; plain job API calls are intentionally rejected.

Local verification: all 63 unit/HTTP tests, typechecks and lint passed. The production build passed. The browser smoke suite passed with assertions that job requests carry encryption headers and no plaintext URL query, alongside the existing mobile/accessibility checks. Existing discovery/ingestion/schema files retained their original checksums. No deployment or database/index writes were performed.
