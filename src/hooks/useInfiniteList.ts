'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PaginationMeta {
  page:  number;
  limit: number;
  total: number;
  pages: number;
}

interface ApiEnvelope<T> {
  data:        T[];
  pagination?: PaginationMeta;
}

export interface UseInfiniteListOptions {
  endpoint: string;                                   // base URL, e.g. /api/ws/employees
  pageSize?: number;                                  // default 50
  params?:   Record<string, string | number | undefined>;
}

interface UseInfiniteListResult<T> {
  items:       T[];
  total:       number;
  loading:     boolean;
  fetchingMore: boolean;
  loadMore:    () => void;
  reset:       () => void;
  hasMore:     boolean;
}

/**
 * useInfiniteList — paginated fetcher with deduplication by `_id`.
 *
 * Server contract: endpoint accepts `?page=N&limit=M&<custom params>` and
 * returns `{ data: T[], pagination: { page, limit, total, pages } }`.
 */
export function useInfiniteList<T extends { _id: string }>({
  endpoint, pageSize = 50, params = {},
}: UseInfiniteListOptions): UseInfiniteListResult<T> {
  const [items,        setItems]        = useState<T[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const pageRef = useRef(1);

  // Build a stable query-string ignoring undefined values
  const buildQs = useCallback((page: number) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    return qs.toString();
  }, [params, pageSize]);

  const fetchPage = useCallback(async (page: number, reset: boolean) => {
    if (reset) setLoading(true); else setFetchingMore(true);
    try {
      const res  = await fetch(`${endpoint}?${buildQs(page)}`);
      const json = (await res.json()) as ApiEnvelope<T>;
      const arr  = json.data ?? [];
      if (reset) setItems(arr);
      else setItems((prev) => {
        const seen = new Set(prev.map((p) => p._id));
        return [...prev, ...arr.filter((a) => !seen.has(a._id))];
      });
      setTotal(json.pagination?.total ?? arr.length);
    } finally {
      setLoading(false); setFetchingMore(false);
    }
  }, [endpoint, buildQs]);

  // Reset to page 1 whenever params change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    pageRef.current = 1;
    fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, paramsKey]);

  const loadMore = useCallback(() => {
    if (fetchingMore) return;
    const next = pageRef.current + 1;
    pageRef.current = next;
    fetchPage(next, false);
  }, [fetchingMore, fetchPage]);

  const reset = useCallback(() => {
    pageRef.current = 1;
    fetchPage(1, true);
  }, [fetchPage]);

  return {
    items, total, loading, fetchingMore,
    loadMore, reset,
    hasMore: items.length < total,
  };
}
