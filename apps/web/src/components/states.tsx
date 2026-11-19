"use client";
import { ArrowRight, SearchX, WifiOff } from "lucide-react";
import { UI } from "@/constants/content";

export function JobSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div
      className="job-grid"
      aria-busy="true"
      aria-label="Loading opportunities"
    >
      {Array.from({ length: count }, (_, index) => (
        <div className="job-card skeleton-card" key={index}>
          <div className="skeleton skeleton-logo" />
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line medium" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}
export function ErrorState({ retry }: { retry?: () => void }) {
  return (
    <div className="state-panel" role="alert">
      <span className="state-icon">
        <WifiOff size={27} />
      </span>
      <h2>{UI.ERROR_TITLE}</h2>
      <p>{UI.ERROR_DESCRIPTION}</p>
      <button
        className="button button-primary"
        onClick={retry ?? (() => window.location.reload())}
      >
        {UI.RETRY}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
export function EmptyState({
  reset,
  databaseEmpty = false,
}: {
  reset?: () => void;
  databaseEmpty?: boolean;
}) {
  return (
    <div className="state-panel">
      <span className="state-icon">
        <SearchX size={28} />
      </span>
      <h2>{UI.EMPTY_TITLE}</h2>
      <p>{databaseEmpty ? UI.EMPTY_DATABASE : UI.EMPTY_DESCRIPTION}</p>
      {reset && (
        <button className="button button-primary" onClick={reset}>
          Clear filters <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
