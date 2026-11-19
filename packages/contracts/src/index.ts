export const API_VERSIONS = { V1: "v1" } as const;
export const API_ROUTES = {
  PREFIX: "api",
  JOBS: "jobs",
  FILTERS: "filters",
  HEALTH: "health",
  READY: "ready",
  DOCS: "docs",
} as const;
export const ROUTE_PARAMS = { JOB_ID: "id" } as const;
const prefix = `/${API_ROUTES.PREFIX}/${API_VERSIONS.V1}`;
export const API_PATHS = {
  jobs: `${prefix}/${API_ROUTES.JOBS}`,
  filters: `${prefix}/${API_ROUTES.JOBS}/${API_ROUTES.FILTERS}`,
  job: (id: string) => `${prefix}/${API_ROUTES.JOBS}/${encodeURIComponent(id)}`,
  health: `${prefix}/${API_ROUTES.HEALTH}`,
  ready: `${prefix}/${API_ROUTES.HEALTH}/${API_ROUTES.READY}`,
} as const;
export const SORT_OPTIONS = ["newest", "oldest"] as const;
export const EMPLOYMENT_TYPES = [
  "internship",
  "full-time",
  "part-time",
  "contract",
] as const;
export const WORK_MODES = ["remote"] as const;
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  PAGE_SIZE: 12,
  MAX_PAGE_SIZE: 48,
  MAX_PAGE: 1000,
  MAX_OFFSET: 20000,
} as const;
export const VALIDATION_LIMITS = {
  SEARCH: 100,
  FILTER: 100,
  QUERY_TIMEOUT_MS: 5000,
  FILTER_OPTIONS: 100,
  BODY: "16kb",
  METADATA_TTL_MS: 30000,
} as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type SortOption = (typeof SORT_OPTIONS)[number];
export interface JobsQuery {
  q?: string;
  role?: string;
  category?: string;
  location?: string;
  employmentType?: EmploymentType;
  workMode?: (typeof WORK_MODES)[number];
  page?: number;
  pageSize?: number;
  sort?: SortOption;
}
export interface PublicJob {
  id: string;
  title: string;
  company: { name: string; domain: string; website: string | null };
  location: string | null;
  employmentType: string | null;
  employmentGroup: EmploymentType | null;
  workMode: "remote" | null;
  publishedAt: string | null;
  discoveredAt: string;
  source: string;
  url: string | null;
  applyUrl: string | null;
}
export interface JobDetails extends PublicJob {
  descriptionText: string | null;
  descriptionHtml: string | null;
}
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
export interface JobsPage {
  items: PublicJob[];
  pagination: Pagination;
}
export interface JobFilters {
  locations: string[];
  roles: string[];
  employmentTypes: EmploymentType[];
  workModes: "remote"[];
  capabilities: { category: false; workMode: boolean; indexedSearch: boolean };
  stats: { totalJobs: number; totalCompanies: number; internships: number };
}
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  requestId: string;
  timestamp: string;
}
export interface ApiFailure {
  success: false;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export interface HealthStatus {
  status: "ok" | "not_ready";
  database: "connected" | "disconnected";
}
