import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./brand";
import { PAGE_ROUTES } from "@/constants/routes";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <div>
          <Brand />
          <p>A little clarity. A lot of possibility.</p>
        </div>
        <div className="footer-links">
          <Link href={PAGE_ROUTES.JOBS}>
            All opportunities <ArrowUpRight size={14} />
          </Link>
          <Link href={`${PAGE_ROUTES.JOBS}?employmentType=internship`}>
            Internships <ArrowUpRight size={14} />
          </Link>
          <Link href={PAGE_ROUTES.HOW_IT_WORKS}>
            Our approach <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>FresherJobs AI · Built for your next chapter.</span>
        <span>Direct listings. Clearer decisions.</span>
      </div>
    </footer>
  );
}
