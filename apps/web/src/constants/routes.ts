export const PAGE_ROUTES = {
  HOME: "/",
  JOBS: "/jobs",
  HOW_IT_WORKS: "/#how-it-works",
  job: (id: string) => `/jobs/${encodeURIComponent(id)}`,
} as const;
