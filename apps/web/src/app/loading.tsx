import { JobSkeletons } from "@/components/states";
export default function Loading() {
  return (
    <main id="main-content" className="container section-space">
      <div className="skeleton skeleton-heading" />
      <JobSkeletons />
    </main>
  );
}
