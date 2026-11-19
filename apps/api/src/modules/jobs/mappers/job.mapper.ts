import sanitizeHtml from "sanitize-html";
import type {
  PublicJob,
  JobDetails,
} from "../../../../../../packages/contracts/src/index.js";
import {
  EMPLOYMENT_PATTERNS,
  REMOTE_PATTERN,
} from "../../../shared/constants/index.js";
import type { StoredJob, StoredCompany } from "../interfaces/stored-job.js";

export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function mapJob(job: StoredJob, company?: StoredCompany): PublicJob {
  const employmentGroup = Object.entries(EMPLOYMENT_PATTERNS).find(
    ([, pattern]) => pattern.test(job.employmentType ?? ""),
  )?.[0] as PublicJob["employmentGroup"] | undefined;
  const remote =
    REMOTE_PATTERN.test(job.location ?? "") ||
    /^remote$/i.test(job.employmentType ?? "");
  return {
    id: job._id.toString(),
    title: job.title,
    company: {
      domain: job.companyDomain,
      name: company?.name ?? job.companyDomain,
      website: safeUrl(company?.website),
    },
    location: job.location?.trim() || null,
    employmentType: /^remote$/i.test(job.employmentType ?? "")
      ? null
      : job.employmentType?.trim() || null,
    employmentGroup: employmentGroup ?? null,
    workMode: remote ? "remote" : null,
    publishedAt: job.publishedAt?.toISOString() ?? null,
    discoveredAt: job.firstSeenAt.toISOString(),
    source: job.provider,
    url: safeUrl(job.url),
    applyUrl: safeUrl(job.applyUrl),
  };
}
export function mapJobDetails(
  job: StoredJob,
  company?: StoredCompany,
): JobDetails {
  return {
    ...mapJob(job, company),
    descriptionText: job.descriptionText?.trim() || null,
    descriptionHtml: job.descriptionHtml?.trim()
      ? sanitizeHtml(job.descriptionHtml, {
          allowedTags: sanitizeHtml.defaults.allowedTags,
          allowedAttributes: { a: ["href", "target", "rel"], "*": [] },
          allowedSchemes: ["https", "http", "mailto"],
          allowProtocolRelative: false,
          transformTags: {
            a: (_tag, attributes) => ({
              tagName: "a",
              attribs: {
                ...attributes,
                target: "_blank",
                rel: "noopener noreferrer",
              },
            }),
          },
        })
      : null,
  };
}
