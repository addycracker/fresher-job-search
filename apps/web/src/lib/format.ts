import type { PublicJob } from "@contracts";

export function dateLabel(
  job: Pick<PublicJob, "publishedAt" | "discoveredAt">,
) {
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(job.publishedAt ?? job.discoveredAt));
  return `${job.publishedAt ? "Posted" : "Indexed"} ${date}`;
}
export const numberLabel = (value: number) =>
  new Intl.NumberFormat("en-IN").format(value);
export function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
export function companyTone(domain: string) {
  return [...domain].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
}
