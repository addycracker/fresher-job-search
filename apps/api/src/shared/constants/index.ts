export {
  API_ROUTES,
  API_VERSIONS,
  ROUTE_PARAMS,
  PAGINATION_DEFAULTS,
  VALIDATION_LIMITS,
  SORT_OPTIONS,
} from "../../../../../packages/contracts/src/index.js";
export const RESPONSE_MESSAGES = {
  JOBS_FETCHED: "Jobs fetched successfully",
  JOB_FETCHED: "Job fetched successfully",
  FILTERS_FETCHED: "Available filters fetched successfully",
  HEALTHY: "Service is healthy",
  NOT_READY: "Database connection is not ready",
  JOB_NOT_FOUND: "This opportunity could not be found",
  INVALID_QUERY: "Some query parameters are invalid",
  INVALID_REQUEST: "The request body is invalid",
  INVALID_ID: "Job ID must be a valid MongoDB ObjectId",
  UNSUPPORTED_FILTER: "This filter is not supported by the stored job data",
  PAGE_LIMIT: "Requested page exceeds the supported pagination range",
  NOT_FOUND: "The requested endpoint does not exist",
  INTERNAL_ERROR: "An unexpected error occurred",
  DATABASE_UNAVAILABLE:
    "Job data is temporarily unavailable. Please try again shortly",
  BODY_TOO_LARGE: "Request body is too large",
  STARTED: "API listening",
  START_FAILED: "API could not start; check environment configuration",
} as const;
export const ERROR_CODES = {
  INVALID_QUERY: "INVALID_QUERY",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_ID: "INVALID_ID",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  UNSUPPORTED_FILTER: "UNSUPPORTED_FILTER",
  PAGE_LIMIT: "PAGE_LIMIT",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL: "INTERNAL_ERROR",
  DATABASE: "DATABASE_UNAVAILABLE",
  NOT_READY: "NOT_READY",
  BODY_TOO_LARGE: "BODY_TOO_LARGE",
} as const;
export const CONFIG_KEYS = {
  PORT: "API_PORT",
  DATABASE_URI: "API_MONGODB_URI",
  SHARED_DATABASE_URI: "MONGODB_URI",
  CORS: "API_CORS_ORIGINS",
  SWAGGER: "API_SWAGGER_ENABLED",
  NODE_ENV: "NODE_ENV",
  DNS: "DNS_SERVERS",
} as const;
export const API_CONFIG = Symbol("API_CONFIG");
export const EMPLOYMENT_PATTERNS = {
  internship: /^(intern|internship)$/i,
  "full-time": /^full[\s-]?time$/i,
  "part-time": /^part[\s-]?time$/i,
  contract: /^contract(or)?$/i,
} as const;
export const REMOTE_PATTERN = /\b(remote|virtual)\b/i;
export const API_INDEXES = [
  {
    key: { title: "text", descriptionText: "text", descriptionHtml: "text" },
    options: {
      name: "api_job_search",
      weights: { title: 5, descriptionText: 1, descriptionHtml: 1 },
    },
  },
  { key: { firstSeenAt: -1, _id: -1 }, options: { name: "api_job_recent" } },
  {
    key: { employmentType: 1, firstSeenAt: -1 },
    options: { name: "api_job_employment" },
  },
  {
    key: { location: 1, firstSeenAt: -1 },
    options: { name: "api_job_location" },
  },
] as const;
