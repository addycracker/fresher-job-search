"use client";
import { useId } from "react";
import { MapPin, BriefcaseBusiness, RotateCcw, Sparkles } from "lucide-react";
import type { JobFilters, JobsQuery } from "@contracts";
import { EMPLOYMENT_LABELS, UI } from "@/constants/content";

export function FiltersPanel({
  filters,
  query,
  update,
  reset,
}: {
  filters: JobFilters | null;
  query: JobsQuery;
  update: (changes: Record<string, string | undefined>) => void;
  reset: () => void;
}) {
  const id = useId();
  return (
    <div className="filters-panel">
      <div className="filters-heading">
        <h2>Make it yours</h2>
        <button className="reset-link" onClick={reset}>
          <RotateCcw size={13} />
          Reset
        </button>
      </div>
      <fieldset>
        <legend>
          <MapPin size={15} />
          Location
        </legend>
        <label className="sr-only" htmlFor={`${id}-location`}>
          Filter by location
        </label>
        <select
          id={`${id}-location`}
          value={query.location ?? ""}
          onChange={(event) =>
            update({ location: event.target.value || undefined })
          }
        >
          <option value="">Anywhere</option>
          {query.location && !filters?.locations.includes(query.location) && (
            <option>{query.location}</option>
          )}
          {filters?.locations.map((location) => (
            <option key={location}>{location}</option>
          ))}
        </select>
      </fieldset>
      <fieldset>
        <legend>
          <BriefcaseBusiness size={15} />
          Employment type
        </legend>
        {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
          <label className="check-row" key={value}>
            <input
              type="radio"
              name={`${id}-employment`}
              checked={query.employmentType === value}
              disabled={
                !filters?.employmentTypes.includes(
                  value as keyof typeof EMPLOYMENT_LABELS,
                )
              }
              onChange={() => update({ employmentType: value })}
            />
            <span>{label}</span>
          </label>
        ))}
        {query.employmentType && (
          <button
            className="subtle-link"
            onClick={() => update({ employmentType: undefined })}
          >
            Any employment type
          </button>
        )}
      </fieldset>
      <fieldset>
        <legend>Work arrangement</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={query.workMode === "remote"}
            disabled={!filters?.capabilities.workMode}
            onChange={(event) =>
              update({ workMode: event.target.checked ? "remote" : undefined })
            }
          />
          <span>Remote / virtual</span>
        </label>
        <p className="filter-help">
          Shown only when explicitly listed. Onsite and hybrid information isn’t
          available.
        </p>
      </fieldset>
      <fieldset>
        <legend>Role title</legend>
        <label className="sr-only" htmlFor={`${id}-role`}>
          Filter by role title
        </label>
        <select
          id={`${id}-role`}
          value={query.role ?? ""}
          onChange={(event) =>
            update({ role: event.target.value || undefined })
          }
        >
          <option value="">Any title</option>
          {query.role && !filters?.roles.includes(query.role) && (
            <option>{query.role}</option>
          )}
          {filters?.roles.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
      </fieldset>
      <fieldset className="classification-filter">
        <legend>
          <Sparkles size={14} />
          AI category
        </legend>
        <select aria-label="AI category unavailable" disabled>
          <option>Coming when available</option>
        </select>
        <p className="filter-help">{UI.CATEGORY_UNAVAILABLE}</p>
      </fieldset>
    </div>
  );
}
