import Link from "next/link";
import { ArrowUpRight, MapPin, BriefcaseBusiness, Globe2 } from "lucide-react";
import type { PublicJob } from "@contracts";
import { companyTone, dateLabel, initials } from "@/lib/format";
import { PAGE_ROUTES } from "@/constants/routes";
import { UI, EMPLOYMENT_LABELS } from "@/constants/content";

export function JobCard({ job }: { job: PublicJob }) {
  return (
    <Link href={PAGE_ROUTES.job(job.id)} className="job-card">
      <div className="job-company-row">
        <span
          className={`company-avatar tone-${companyTone(job.company.domain)}`}
          aria-hidden="true"
        >
          {initials(job.company.name)}
        </span>
        <div className="company-name">
          <strong>{job.company.name}</strong>
          <span>via {job.source}</span>
        </div>
        <ArrowUpRight size={19} className="card-arrow" aria-hidden="true" />
      </div>
      <h3>{job.title}</h3>
      <div className="job-location">
        <MapPin size={14} aria-hidden="true" />
        <span>{job.location ?? UI.LOCATION_UNAVAILABLE}</span>
      </div>
      <div className="job-tags">
        <span>
          <BriefcaseBusiness size={12} />
          {job.employmentGroup
            ? EMPLOYMENT_LABELS[job.employmentGroup]
            : (job.employmentType ?? UI.TYPE_UNAVAILABLE)}
        </span>
        {job.workMode && (
          <span className="tag-remote">
            <Globe2 size={12} />
            Remote
          </span>
        )}
      </div>
      <div className="job-card-bottom">
        <time dateTime={job.publishedAt ?? job.discoveredAt}>
          {dateLabel(job)}
        </time>
        <span>
          View role <span aria-hidden="true">↗</span>
        </span>
      </div>
    </Link>
  );
}
