import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./brand";
import { PAGE_ROUTES } from "@/constants/routes";

export function Header() {
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <Link href={PAGE_ROUTES.JOBS}>Find opportunities</Link>
          <Link href={PAGE_ROUTES.HOW_IT_WORKS}>How it works</Link>
        </nav>
        <Link className="button button-dark nav-cta" href={PAGE_ROUTES.JOBS}>
          Explore jobs <ArrowUpRight size={16} />
        </Link>
      </div>
    </header>
  );
}
