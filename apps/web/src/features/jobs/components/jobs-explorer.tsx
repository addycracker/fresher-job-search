"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import type { JobFilters } from "@contracts";
import { PAGINATION_DEFAULTS, VALIDATION_LIMITS } from "@contracts";
import { api } from "@/lib/api-client";
import { numberLabel } from "@/lib/format";
import { UI } from "@/constants/content";
import { useJobs } from "../hooks/use-jobs";
import { parseJobsSearch } from "../services/query";
import { FiltersPanel } from "./filters-panel";
import { JobCard } from "./job-card";
import { EmptyState, ErrorState, JobSkeletons } from "@/components/states";

export function JobsExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const query = useMemo(
    () => parseJobsSearch(new URLSearchParams(search)),
    [search],
  );
  const { data, loading, error, retry } = useJobs(search);
  const [filters, setFilters] = useState<JobFilters | null>(null);
  const [filtersError, setFiltersError] = useState(false);
  const [filtersRevision, setFiltersRevision] = useState(0);
  const [keyword, setKeyword] = useState(query.q ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setFiltersError(false);
    api
      .filters(controller.signal)
      .then(setFilters)
      .catch(() => {
        if (!controller.signal.aborted) setFiltersError(true);
      });
    return () => controller.abort();
  }, [filtersRevision]);
  useEffect(() => {
    setKeyword(query.q ?? "");
  }, [query.q]);
  useEffect(() => {
    if (keyword.trim() === (query.q ?? "")) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(search);
      if (keyword.trim()) params.set("q", keyword.trim());
      else params.delete("q");
      params.delete("page");
      router.replace(`${pathname}?${params}`, { scroll: false });
    }, UI.SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [keyword, query.q, search, pathname, router]);
  useEffect(() => {
    if (drawerOpen && !dialog.current?.open) dialog.current?.showModal();
    else if (!drawerOpen && dialog.current?.open) dialog.current.close();
  }, [drawerOpen]);
  function update(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in changes)) params.delete("page");
    router.replace(`${pathname}?${params}`, { scroll: false });
  }
  function reset() {
    setKeyword("");
    router.replace(pathname, { scroll: false });
  }
  const active = [
    query.q,
    query.location,
    query.employmentType,
    query.workMode,
    query.role,
  ].filter(Boolean).length;
  const pagination = data?.pagination;
  const currentPage = query.page ?? PAGINATION_DEFAULTS.PAGE;
  const pages = pagination
    ? Array.from({ length: Math.min(5, pagination.totalPages) }, (_, index) => {
        const start = Math.max(
          1,
          Math.min(currentPage - 2, pagination.totalPages - 4),
        );
        return start + index;
      })
    : [];
  const panel = (
    <>
      {filtersError && (
        <p className="filter-help" role="alert">
          Filters are temporarily unavailable.{" "}
          <button
            className="subtle-link"
            onClick={() => setFiltersRevision((value) => value + 1)}
          >
            Retry filters
          </button>
        </p>
      )}
      <FiltersPanel
        filters={filters}
        query={query}
        update={update}
        reset={reset}
      />
    </>
  );
  return (
    <>
      <div className="listing-search">
        <Search size={21} aria-hidden="true" />
        <label htmlFor="jobs-search" className="sr-only">
          Search by title, skill or keyword
        </label>
        <input
          id="jobs-search"
          placeholder={UI.SEARCH_PLACEHOLDER}
          value={keyword}
          maxLength={VALIDATION_LIMITS.SEARCH}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {keyword && (
          <button
            className="icon-button"
            onClick={() => {
              setKeyword("");
              update({ q: undefined });
            }}
            aria-label="Clear search"
          >
            <X size={18} />
          </button>
        )}
        <span className="search-shortcut" aria-hidden="true">
          Find your fit <ArrowUpRight size={14} />
        </span>
      </div>
      <div className="listing-layout">
        <aside className="desktop-filters" aria-label="Filter opportunities">
          {panel}
        </aside>
        <section
          className="results-section"
          aria-label="Job results"
          aria-busy={loading}
        >
          <div className="results-toolbar">
            <div>
              <button
                className="button mobile-filter-button"
                onClick={() => setDrawerOpen(true)}
              >
                <SlidersHorizontal size={16} />
                Filters{active > 0 && <span>{active}</span>}
              </button>
              <p aria-live="polite">
                {loading ? (
                  "Finding possibilities…"
                ) : data ? (
                  <>
                    <strong>{numberLabel(data.pagination.total)}</strong>{" "}
                    opportunities
                  </>
                ) : (
                  "Opportunities"
                )}
              </p>
            </div>
            <label className="sort-control">
              Sort by
              <select
                aria-label="Sort opportunities"
                value={query.sort}
                onChange={(event) => update({ sort: event.target.value })}
              >
                <option value="newest">Newest indexed</option>
                <option value="oldest">Oldest indexed</option>
              </select>
            </label>
          </div>
          {active > 0 && (
            <div className="active-filters">
              {(
                ["location", "employmentType", "workMode", "role"] as const
              ).map(
                (key) =>
                  query[key] && (
                    <button
                      key={key}
                      onClick={() => update({ [key]: undefined })}
                    >
                      {query[key]}
                      <X size={12} />
                    </button>
                  ),
              )}
              <button className="clear-all" onClick={reset}>
                Clear all
              </button>
            </div>
          )}
          {loading ? (
            <JobSkeletons count={PAGINATION_DEFAULTS.PAGE_SIZE} />
          ) : error ? (
            <>
              <ErrorState retry={retry} />
              <button className="subtle-link" onClick={reset}>
                Reset search and filters
              </button>
            </>
          ) : data?.items.length ? (
            <>
              <div className="job-grid results-grid">
                {data.items.map((job) => (
                  <JobCard job={job} key={job.id} />
                ))}
              </div>
              {pagination && (
                <div className="pagination">
                  <p>
                    Showing{" "}
                    {numberLabel(
                      (pagination.page - 1) * pagination.pageSize + 1,
                    )}
                    –
                    {numberLabel(
                      (pagination.page - 1) * pagination.pageSize +
                        data.items.length,
                    )}{" "}
                    of {numberLabel(pagination.total)}
                  </p>
                  <nav aria-label="Results pages">
                    <button
                      aria-label="Previous page"
                      disabled={!pagination.hasPreviousPage}
                      onClick={() => update({ page: String(currentPage - 1) })}
                    >
                      <ChevronLeft size={17} />
                    </button>
                    {pages.map((page) => (
                      <button
                        key={page}
                        aria-label={`Page ${page}`}
                        aria-current={currentPage === page ? "page" : undefined}
                        onClick={() => update({ page: String(page) })}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      aria-label="Next page"
                      disabled={
                        !pagination.hasNextPage ||
                        currentPage >= PAGINATION_DEFAULTS.MAX_PAGE
                      }
                      onClick={() => update({ page: String(currentPage + 1) })}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </nav>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              reset={reset}
              databaseEmpty={filters?.stats.totalJobs === 0}
            />
          )}
        </section>
      </div>
      <dialog
        ref={dialog}
        className="filter-dialog"
        onCancel={() => setDrawerOpen(false)}
        onClose={() => setDrawerOpen(false)}
        aria-label="Filter opportunities"
      >
        <div className="drawer-top">
          <span>Find your fit</span>
          <button
            className="icon-button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close filters"
          >
            <X size={23} />
          </button>
        </div>
        {panel}
        <button
          className="button button-primary drawer-done"
          onClick={() => setDrawerOpen(false)}
        >
          Show opportunities
        </button>
      </dialog>
    </>
  );
}
