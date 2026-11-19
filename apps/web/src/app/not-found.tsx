import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PAGE_ROUTES } from "@/constants/routes";
export default function NotFound() {
  return (
    <main id="main-content" className="container section-space">
      <div className="state-panel">
        <span className="eyebrow">A DIFFERENT DIRECTION</span>
        <h1>This opportunity isn’t here.</h1>
        <p>
          The link may have changed. There are more possibilities to explore.
        </p>
        <Link className="button button-primary" href={PAGE_ROUTES.JOBS}>
          Explore opportunities
          <ArrowRight size={16} />
        </Link>
      </div>
    </main>
  );
}
