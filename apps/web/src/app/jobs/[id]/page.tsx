import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowUpRight,
  MapPin,
  BriefcaseBusiness,
  CalendarDays,
  Globe2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { companyTone, initials, dateLabel } from "@/lib/format";
import { PAGE_ROUTES } from "@/constants/routes";
import { EMPLOYMENT_LABELS, UI } from "@/constants/content";
import { JobCard } from "@/features/jobs/components/job-card";

export const dynamic = "force-dynamic";
const loadJob = cache((id: string) => api.job(id));
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const job = await loadJob((await params).id);
    return {
      title: `${job.title} at ${job.company.name}`,
      description: `${job.title} at ${job.company.name}${job.location ? ` · ${job.location}` : ""}. View the role and apply directly.`,
    };
  } catch {
    return { title: "Opportunity details", robots: { index: false } };
  }
}
export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await loadJob(id).catch((error: unknown) => {
    if (error instanceof ApiClientError && [400, 404].includes(error.status))
      notFound();
    throw error;
  });
  const related = await api
    .jobs({
      q: job.title.split(/\s+/).slice(0, 2).join(" ").slice(0, 100),
      pageSize: 4,
    })
    .catch(() => null);
  const others =
    related?.items.filter((item) => item.id !== job.id).slice(0, 3) ?? [];
  return (
    <main id="main-content" className="detail-page">
      <div className="container">
        <Link className="back-link" href={PAGE_ROUTES.JOBS}>
          <ArrowLeft size={16} />
          Back to opportunities
        </Link>
        <div className="detail-layout">
          <article>
            <div className="detail-heading">
              <span
                className={`company-avatar large tone-${companyTone(job.company.domain)}`}
                aria-hidden="true"
              >
                {initials(job.company.name)}
              </span>
              <div className="detail-company">
                {job.company.name}
                <span>via {job.source}</span>
              </div>
              <h1>{job.title}</h1>
              <div className="detail-facts">
                <span>
                  <MapPin size={16} />
                  {job.location ?? UI.LOCATION_UNAVAILABLE}
                </span>
                <span>
                  <BriefcaseBusiness size={16} />
                  {job.employmentGroup
                    ? EMPLOYMENT_LABELS[job.employmentGroup]
                    : (job.employmentType ?? UI.TYPE_UNAVAILABLE)}
                </span>
                {job.workMode && (
                  <span>
                    <Globe2 size={16} />
                    Remote / virtual
                  </span>
                )}
                <span>
                  <CalendarDays size={16} />
                  {dateLabel(job)}
                </span>
              </div>
            </div>
            <section className="description-panel">
              <span className="eyebrow">THE OPPORTUNITY</span>
              <h2>A closer look at the role.</h2>
              {job.descriptionHtml ? (
                <div
                  className="job-description"
                  dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
                />
              ) : job.descriptionText ? (
                <div className="job-description plain-description">
                  {job.descriptionText}
                </div>
              ) : (
                <p>
                  The provider hasn’t supplied a description for this listing.
                  Check the original posting for more details.
                </p>
              )}
            </section>
          </article>
          <aside className="detail-sidebar">
            <div className="apply-card">
              <span className="eyebrow">TAKE THE NEXT STEP</span>
              <h2>
                See yourself
                <br />
                in this role?
              </h2>
              <p>
                Your application goes directly to the company’s recruitment
                platform.
              </p>
              {job.applyUrl ? (
                <a
                  className="button button-primary"
                  href={job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apply for this role
                  <ArrowUpRight size={18} />
                </a>
              ) : (
                <p className="unavailable-note">
                  An application URL wasn’t supplied.
                </p>
              )}
              {job.url && (
                <a
                  className="subtle-link original-link"
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View original posting
                  <ExternalLink size={13} />
                </a>
              )}
              <div className="direct-note">
                <ShieldCheck size={16} />
                <span>Direct application. No account needed here.</span>
              </div>
            </div>
            <div className="insights-card">
              <Sparkles size={20} />
              <h3>Clear information. No guesses.</h3>
              <p>
                AI category and experience classification haven’t been supplied
                for this role. Review the description for eligibility.
              </p>
              {!job.publishedAt && (
                <p>
                  The original posting date is unavailable. The date above shows
                  when this job was first indexed.
                </p>
              )}
            </div>
            {job.company.website && (
              <a
                className="company-site"
                href={job.company.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit {job.company.name}
                <ArrowUpRight size={16} />
              </a>
            )}
          </aside>
        </div>
        {others.length > 0 && (
          <section className="related-jobs">
            <div className="section-heading">
              <div>
                <span className="eyebrow">KEEP YOUR OPTIONS OPEN</span>
                <h2>More to explore.</h2>
              </div>
              <Link className="text-link" href={PAGE_ROUTES.JOBS}>
                All opportunities
                <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="job-grid">
              {others.map((item) => (
                <JobCard key={item.id} job={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
