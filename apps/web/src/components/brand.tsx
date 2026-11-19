import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BRAND } from "@/constants/content";
import { PAGE_ROUTES } from "@/constants/routes";

export function Brand() {
  return (
    <Link
      className="brand"
      href={PAGE_ROUTES.HOME}
      aria-label={`${BRAND.NAME} ${BRAND.SUFFIX} home`}
    >
      <span className="brand-mark" aria-hidden="true">
        <ArrowUpRight size={23} strokeWidth={2.6} />
      </span>
      <span>
        {BRAND.NAME}
        <span className="brand-ai">{BRAND.SUFFIX}</span>
      </span>
    </Link>
  );
}
