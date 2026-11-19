"use client";
import { useCallback, useEffect, useState } from "react";
import type { JobsPage } from "@contracts";
import { api } from "@/lib/api-client";
import { parseJobsSearch } from "../services/query";

export function useJobs(search: string) {
  const [data, setData] = useState<JobsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    api
      .jobs(parseJobsSearch(new URLSearchParams(search)), controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setData(page);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [search, revision]);
  return {
    data,
    loading,
    error,
    retry: useCallback(() => setRevision((value) => value + 1), []),
  };
}
