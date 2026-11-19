import { ZodError } from "zod";
import { CONFIG_KEYS } from "../constants/index.js";
import { InvalidEncryptionKeyError } from "../security/security-config.js";

const FIELDS: Record<string, string> = {
  port: CONFIG_KEYS.PORT,
  uri: "API_MONGODB_URI or MONGODB_URI",
  corsOrigins: CONFIG_KEYS.CORS,
  dnsServers: CONFIG_KEYS.DNS,
  apiKey: "API_CLIENT_KEY",
  path: "API_PRIVATE_KEY_PATH",
  rate: "API_RATE_LIMIT",
  window: "API_RATE_WINDOW_MS",
};
const HINTS = {
  INVALID_ENVIRONMENT:
    "Set the listed environment variables in .env.development or the process environment",
  EADDRINUSE:
    "API_PORT is already in use; stop the existing API process or choose another port",
  EACCES:
    "Check file permissions and whether the configured API port can be bound",
  ENOENT:
    "A required local environment or private-key file is missing; check API_PRIVATE_KEY_PATH",
  INVALID_PRIVATE_KEY:
    "API_PRIVATE_KEY_PATH must contain a valid RSA private key of at least 3072 bits",
  STARTUP_FAILED:
    "Check API environment settings and dependency initialization",
} as const;
export function startupDiagnostic(error: unknown, stage: string) {
  if (error instanceof ZodError) {
    return {
      stage,
      code: "INVALID_ENVIRONMENT",
      fields: [
        ...new Set(
          error.issues.map(
            (issue) => FIELDS[String(issue.path[0])] ?? "API_CONFIGURATION",
          ),
        ),
      ],
      hint: HINTS.INVALID_ENVIRONMENT,
    };
  }
  const rawCode =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const code =
    typeof rawCode === "string" &&
    ["EADDRINUSE", "EACCES", "ENOENT"].includes(rawCode)
      ? (rawCode as "EADDRINUSE" | "EACCES" | "ENOENT")
      : error instanceof InvalidEncryptionKeyError
        ? "INVALID_PRIVATE_KEY"
        : "STARTUP_FAILED";
  return { stage, code, hint: HINTS[code] };
}
