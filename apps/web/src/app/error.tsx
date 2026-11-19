"use client";
import { ErrorState } from "@/components/states";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="container section-space">
      <ErrorState retry={reset} />
    </main>
  );
}
