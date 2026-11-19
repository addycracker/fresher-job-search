import { existsSync } from "node:fs";
import { z } from "zod";
import { CONFIG_KEYS } from "../constants/index.js";
import { readSecurityConfig } from "../security/security-config.js";

export function loadLocalEnvironment() {
  for (const file of [".env.development", ".env"])
    if (existsSync(file)) process.loadEnvFile(file);
}
export function readApiConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env[CONFIG_KEYS.NODE_ENV] === "production";
  const origins = (env[CONFIG_KEYS.CORS] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsed = z
    .object({
      port: z.coerce.number().int().min(1).max(65535),
      uri: z
        .string()
        .min(1)
        .refine((value) => /^mongodb(?:\+srv)?:\/\//.test(value)),
      corsOrigins: z
        .array(
          z
            .url()
            .refine(
              (value) =>
                new URL(value).origin === value &&
                ["http:", "https:"].includes(new URL(value).protocol),
            ),
        )
        .min(1),
      swagger: z.boolean(),
      production: z.boolean(),
      dnsServers: z.array(z.string()),
    })
    .parse({
      port: env[CONFIG_KEYS.PORT] ?? 4000,
      uri:
        env[CONFIG_KEYS.DATABASE_URI]?.trim() ||
        env[CONFIG_KEYS.SHARED_DATABASE_URI]?.trim() ||
        "",
      corsOrigins: origins,
      swagger: !production && env[CONFIG_KEYS.SWAGGER] !== "false",
      production,
      dnsServers: (env[CONFIG_KEYS.DNS] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
  return { ...parsed, security: readSecurityConfig(env) };
}
export type ApiConfig = ReturnType<typeof readApiConfig>;
