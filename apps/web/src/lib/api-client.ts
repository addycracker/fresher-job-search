import {
  API_PATHS,
  type ApiResponse,
  type JobDetails,
  type JobFilters,
  type JobsPage,
  type JobsQuery,
} from "@contracts";
import { UI } from "@/constants/content";
import { encryptCall } from "@/lib/encrypted-transport";
import { TRANSPORT, type PublicEncryptionKey } from "@transport";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}
export function queryString(query: JobsQuery) {
  const result = new URLSearchParams();
  const keys: (keyof JobsQuery)[] = [
    "q",
    "role",
    "category",
    "location",
    "employmentType",
    "workMode",
    "page",
    "pageSize",
    "sort",
  ];
  for (const key of keys) {
    const value = query[key];
    if (value !== undefined && String(value).trim())
      result.set(key, String(value));
  }
  return result.toString();
}
function apiBase() {
  const value =
    typeof window === "undefined"
      ? (process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL)
      : process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value)
    throw new ApiClientError(
      "API_CONFIGURATION_MISSING",
      0,
      UI.ERROR_DESCRIPTION,
    );
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new ApiClientError(
      "API_CONFIGURATION_INVALID",
      0,
      UI.ERROR_DESCRIPTION,
    );
  return value.replace(/\/$/, "");
}
function isEnvelope(value: unknown): value is ApiResponse<unknown> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.success === "boolean" &&
    typeof record.message === "string" &&
    typeof record.requestId === "string" &&
    typeof record.timestamp === "string" &&
    (record.success ? "data" in record : typeof record.code === "string")
  );
}
export function createApiClient(
  baseUrl: () => string = apiBase,
  request: typeof fetch = fetch,
  apiKey: () => string = () => process.env.NEXT_PUBLIC_API_KEY ?? "",
) {
  let cachedKey: { value: PublicEncryptionKey; expires: number } | undefined;
  async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(UI.REQUEST_TIMEOUT_MS);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeout])
      : timeout;
    const key = apiKey();
    if (!key)
      throw new ApiClientError(
        "API_CONFIGURATION_MISSING",
        0,
        UI.ERROR_DESCRIPTION,
      );
    if (!cachedKey || cachedKey.expires < Date.now()) {
      const bootstrap = await request(baseUrl() + TRANSPORT.PUBLIC_KEY_PATH, {
        headers: { [TRANSPORT.HEADERS.API_KEY]: key },
        cache: "no-store",
        signal: combinedSignal,
      });
      const value: unknown = await bootstrap.json();
      if (
        !bootstrap.ok ||
        !value ||
        typeof value !== "object" ||
        !("spki" in value) ||
        typeof value.spki !== "string" ||
        !("keyId" in value) ||
        typeof value.keyId !== "string"
      )
        throw new ApiClientError(
          "ENCRYPTION_BOOTSTRAP_FAILED",
          bootstrap.status,
          UI.ERROR_DESCRIPTION,
        );
      cachedKey = {
        value: { spki: value.spki, keyId: value.keyId },
        expires: Date.now() + 300000,
      };
    }
    const encrypted = await encryptCall(cachedKey.value, path, key);
    const response = await request(baseUrl() + encrypted.path, {
      cache: "no-store",
      headers: encrypted.headers,
      signal: combinedSignal,
    });
    let body: unknown;
    try {
      const wire: unknown = await response.json();
      // Failures before an AES key is authenticated (401/429, malformed packets)
      // cannot be encrypted. Never accept a plaintext successful response.
      body =
        !response.ok && isEnvelope(wire) && !wire.success
          ? wire
          : await encrypted.decrypt(wire, response.status);
    } catch {
      throw new ApiClientError(
        "INVALID_API_RESPONSE",
        response.status,
        UI.ERROR_DESCRIPTION,
      );
    }
    if (!isEnvelope(body))
      throw new ApiClientError(
        "INVALID_API_RESPONSE",
        response.status,
        UI.ERROR_DESCRIPTION,
      );
    if (!body.success)
      throw new ApiClientError(
        body.code,
        response.status,
        body.message,
        body.requestId,
      );
    if (!response.ok)
      throw new ApiClientError(
        "INVALID_API_STATUS",
        response.status,
        UI.ERROR_DESCRIPTION,
        body.requestId,
      );
    return body.data as T;
  }
  return {
    jobs: (query: JobsQuery = {}, signal?: AbortSignal) =>
      get<JobsPage>(`${API_PATHS.jobs}?${queryString(query)}`, signal),
    filters: (signal?: AbortSignal) =>
      get<JobFilters>(API_PATHS.filters, signal),
    job: (id: string, signal?: AbortSignal) =>
      get<JobDetails>(API_PATHS.job(id), signal),
  };
}
export const api = createApiClient();
