import {
  EMPLOYMENT_TYPES,
  PAGINATION_DEFAULTS,
  type JobsQuery,
} from "@contracts";

export function parseJobsSearch(params: URLSearchParams): JobsQuery {
  const type = params.get("employmentType");
  return {
    q: params.get("q") || undefined,
    role: params.get("role") || undefined,
    location: params.get("location") || undefined,
    category: params.get("category") || undefined,
    employmentType: EMPLOYMENT_TYPES.find((item) => item === type),
    workMode: params.get("workMode") === "remote" ? "remote" : undefined,
    page: params.has("page")
      ? Number(params.get("page"))
      : PAGINATION_DEFAULTS.PAGE,
    pageSize: PAGINATION_DEFAULTS.PAGE_SIZE,
    sort: params.get("sort") === "oldest" ? "oldest" : "newest",
  };
}
