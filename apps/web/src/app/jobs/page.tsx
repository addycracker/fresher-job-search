import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsExplorer } from "@/features/jobs/components/jobs-explorer";
import { JobSkeletons } from "@/components/states";

export const metadata: Metadata = {
  title: "Explore opportunities",
  description:
    "Search real company listings by role, location and employment type. Find your next opportunity with FresherJobs AI.",
};
export default function JobsPage() {
  return (
    <main id="main-content" className="listing-page">
      <div className="container">
        <div className="listing-heading">
          <span className="eyebrow">ROOM FOR YOUR AMBITION</span>
          <h1>
            Find your <span>next step.</span>
          </h1>
          <p>A world of opportunities. A place to make them yours.</p>
        </div>
        <Suspense fallback={<JobSkeletons count={12} />}>
          <JobsExplorer />
        </Suspense>
      </div>
    </main>
  );
}
