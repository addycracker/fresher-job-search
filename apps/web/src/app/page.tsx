import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Sparkles,
  Radio,
  Globe2,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { numberLabel, companyTone, initials } from "@/lib/format";
import { HeroSearch } from "@/features/jobs/components/hero-search";
import { JobCard } from "@/features/jobs/components/job-card";
import { EmptyState, ErrorState } from "@/components/states";
import { PAGE_ROUTES } from "@/constants/routes";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  const [listing, filters] = await Promise.allSettled([
    api.jobs({ pageSize: 6 }),
    api.filters(),
  ]);
  const page = listing.status === "fulfilled" ? listing.value : null;
  const metadata = filters.status === "fulfilled" ? filters.value : null;
  const spotlight = page?.items[0];
  const quickLocations = [
    "Bengaluru",
    "Bangalore",
    "Mumbai",
    "Pune",
    "Hyderabad",
    "Delhi",
  ]
    .filter((city) =>
      metadata?.locations.some((location) => location.includes(city)),
    )
    .slice(0, 4);
  const quickRoles =
    metadata?.roles
      .filter(
        (role) =>
          /intern|new grad|junior|associate/i.test(role) && role.length < 45,
      )
      .slice(0, 3) ?? [];
  return (
    <main id="main-content">
      <section className="hero">
        <div className="container hero-layout">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" />
              BIG POTENTIAL. BETTER BEGINNINGS.
            </div>
            <h1>
              Your career
              <br />
              starts{" "}
              <span className="hero-accent">
                here<span className="accent-dot">.</span>
              </span>
            </h1>
            <p className="hero-description">
              You bring the ambition.
              <br className="desktop-break" /> Find the opportunity that takes
              it further.
            </p>
            <div className="hero-points">
              <span>
                <Check size={14} />
                Real company listings
              </span>
              <span>
                <Check size={14} />
                Direct applications
              </span>
            </div>
          </div>
          <div className="hero-art" aria-label="Your next chapter">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-spark" aria-hidden="true">
              ✳
            </div>
            <div className="chapter-card">
              <span className="chapter-kicker">THE NEXT CHAPTER</span>
              <p>
                Made of
                <br />
                possibilities.
              </p>
              <div className="chapter-bottom">
                <span>
                  Your potential,
                  <br />
                  meet your next step.
                </span>
                <span className="chapter-arrow">
                  <ArrowUpRight size={28} />
                </span>
              </div>
            </div>
            {spotlight && (
              <Link
                className="floating-opportunity"
                href={PAGE_ROUTES.job(spotlight.id)}
              >
                <span
                  className={`company-avatar tone-${companyTone(spotlight.company.domain)}`}
                  aria-hidden="true"
                >
                  {initials(spotlight.company.name)}
                </span>
                <div>
                  <span>A NEW POSSIBILITY</span>
                  <strong>{spotlight.title}</strong>
                  <small>{spotlight.company.name}</small>
                </div>
                <ArrowUpRight size={18} />
              </Link>
            )}
            <div className="source-note">
              <span>
                <Radio size={15} />
              </span>
              From real hiring boards
            </div>
          </div>
        </div>
        <div className="container hero-search-wrap">
          <HeroSearch locations={metadata?.locations ?? []} />
          <div className="quick-locations">
            <span>Start somewhere:</span>
            {quickLocations.map((city) => (
              <Link
                key={city}
                href={`${PAGE_ROUTES.JOBS}?location=${encodeURIComponent(city)}`}
              >
                {city}
                <ArrowUpRight size={12} />
              </Link>
            ))}
            <Link href={PAGE_ROUTES.JOBS}>
              Explore everywhere <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>
      {quickRoles.length > 0 && (
        <div
          className="container quick-locations"
          style={{ paddingBottom: 24 }}
        >
          <span>Explore a role:</span>
          {quickRoles.map((role) => (
            <Link
              key={role}
              href={`${PAGE_ROUTES.JOBS}?role=${encodeURIComponent(role)}`}
            >
              {role}
              <ArrowUpRight size={12} />
            </Link>
          ))}
        </div>
      )}
      <section className="stats-band" aria-label="Current opportunities">
        <div className="container stats-inner">
          <div>
            <strong>
              {metadata ? numberLabel(metadata.stats.totalJobs) : "—"}
            </strong>
            <span>opportunities to explore</span>
          </div>
          <div>
            <strong>
              {metadata ? numberLabel(metadata.stats.totalCompanies) : "—"}
            </strong>
            <span>companies hiring</span>
          </div>
          <div>
            <strong>
              {metadata ? numberLabel(metadata.stats.internships) : "—"}
            </strong>
            <span>internship opportunities</span>
          </div>
          <p>
            <span className="small-orbit" aria-hidden="true">
              ✳
            </span>
            One place.
            <br />
            <strong>A world of possibilities.</strong>
          </p>
        </div>
      </section>
      <section className="container section-space opportunities">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A GOOD PLACE TO START</span>
            <h2>
              Fresh possibilities.
              <br />
              <span>Real next steps.</span>
            </h2>
          </div>
          <div>
            <p>
              Recently indexed roles from company hiring boards.
              <br />
              Explore the details to find your fit.
            </p>
            <Link className="text-link" href={PAGE_ROUTES.JOBS}>
              View all opportunities <ArrowRight size={17} />
            </Link>
          </div>
        </div>
        {page ? (
          page.items.length ? (
            <div className="job-grid">
              {page.items.map((job) => (
                <JobCard job={job} key={job.id} />
              ))}
            </div>
          ) : (
            <EmptyState databaseEmpty />
          )
        ) : (
          <ErrorState />
        )}
        <p className="data-note">
          <ShieldCheck size={14} />
          Listings come directly from public ATS boards. Experience requirements
          vary by role.
        </p>
      </section>
      <section id="how-it-works" className="how-section">
        <div className="container">
          <div className="how-heading">
            <span className="eyebrow">LESS NOISE. MORE DIRECTION.</span>
            <h2>
              A clearer path
              <br />
              to what comes next.
            </h2>
            <p>Finding your first step shouldn’t feel like a full-time job.</p>
          </div>
          <div className="how-grid">
            <article>
              <span className="feature-icon">
                <Globe2 size={24} />
              </span>
              <span className="step-number">01</span>
              <h3>From the source.</h3>
              <p>
                Discover roles published on company recruitment boards, with
                links to the original application.
              </p>
            </article>
            <article>
              <span className="feature-icon">
                <Layers3 size={24} />
              </span>
              <span className="step-number">02</span>
              <h3>Clarity, built in.</h3>
              <p>
                Search across titles and descriptions. Narrow by location,
                employment type and explicit remote listings.
              </p>
            </article>
            <article>
              <span className="feature-icon">
                <Sparkles size={24} />
              </span>
              <span className="step-number">03</span>
              <h3>Intelligence, honestly.</h3>
              <p>
                AI categories will appear when classification data is available.
                Until then, every label reflects stored job information.
              </p>
            </article>
          </div>
        </div>
      </section>
      <section className="container cta-section">
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER IS WAITING</span>
          <h2>
            Start with curiosity.
            <br />
            See where it takes you.
          </h2>
        </div>
        <Link href={PAGE_ROUTES.JOBS} className="button button-white">
          Find your opportunity <ArrowUpRight size={19} />
        </Link>
        <span className="cta-star" aria-hidden="true">
          ✳
        </span>
      </section>
    </main>
  );
}
