export const BRAND = {
  NAME: "FresherJobs",
  SUFFIX: "AI",
  TAGLINE: "A better beginning.",
} as const;
export const UI = {
  ERROR_TITLE: "A small pause in your search.",
  ERROR_DESCRIPTION:
    "We couldn’t load opportunities right now. Please try again in a moment.",
  RETRY: "Try again",
  EMPTY_TITLE: "Your next opportunity is still out there.",
  EMPTY_DESCRIPTION:
    "Try a broader search or clear a filter to discover more roles.",
  EMPTY_DATABASE: "New opportunities are on their way. Check back soon.",
  SEARCH_PLACEHOLDER: "Job title, skill, or keyword",
  CATEGORY_UNAVAILABLE:
    "AI categories aren’t available for these listings yet.",
  TYPE_UNAVAILABLE: "Type not listed",
  LOCATION_UNAVAILABLE: "Location not listed",
  REQUEST_TIMEOUT_MS: 10000,
  SEARCH_DEBOUNCE_MS: 350,
} as const;
export const EMPLOYMENT_LABELS = {
  internship: "Internship",
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
} as const;
