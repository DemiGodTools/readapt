import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * A tiny SWR layer for React Native.
 * ---------------------------------------------------------------------------
 * Why not the `swr` package? React Native has no window focus events, and the
 * app already stores every other cache in AsyncStorage. This is ~150 lines
 * that give us exactly what the screens need:
 *
 *   - stale-while-revalidate: cached data paints on the first frame, a
 *     background request quietly replaces it.
 *   - request dedupe: ten components asking for the same key share one fetch.
 *   - persistence: the last good payload survives an app kill / offline start.
 *   - optimistic updates: mutate() applies a local delta immediately and
 *     revalidates afterwards, rolling back on failure.
 */

export type QueryState<T> = {
  data: T | undefined;
  error: unknown;
  updatedAt: number;
  isValidating: boolean;
};

type Listener = () => void;

const memory = new Map<string, QueryState<any>>();
const listeners = new Map<string, Set<Listener>>();
const inflight = new Map<string, Promise<any>>();
const fetchers = new Map<string, (key: string) => Promise<any>>();

const STORAGE_PREFIX = "swr:";
const DEFAULT_STALE_TIME = 30_000;

const notify = (key: string) => {
  const bucket = listeners.get(key);
  if (!bucket) return;
  bucket.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
};

const stateFor = <T>(key: string): QueryState<T> => {
  const existing = memory.get(key);
  if (existing) return existing as QueryState<T>;
  const fresh: QueryState<T> = {
    data: undefined,
    error: null,
    updatedAt: 0,
    isValidating: false,
  };
  memory.set(key, fresh);
  return fresh;
};

const persist = (key: string, state: QueryState<any>) => {
  AsyncStorage.setItem(
    STORAGE_PREFIX + key,
    JSON.stringify({ data: state.data, updatedAt: state.updatedAt })
  ).catch(() => {});
};

const write = <T>(key: string, next: Partial<QueryState<T>>, persistIt: boolean) => {
  const merged: QueryState<T> = { ...stateFor<T>(key), ...next };
  memory.set(key, merged);
  if (persistIt && merged.data !== undefined) persist(key, merged);
  notify(key);
  return merged;
};

export const getCachedQuery = <T,>(key: string): T | undefined =>
  memory.get(key)?.data as T | undefined;

/** Reads the disk copy for a key (used to paint before the first network call). */
export const hydrateQuery = async (key: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000) => {
  const existing = memory.get(key);
  if (existing?.data !== undefined) return existing.data;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.data === undefined) return undefined;
    const updatedAt = Number(parsed.updatedAt) || 0;
    if (maxAgeMs > 0 && Date.now() - updatedAt > maxAgeMs) return undefined;

    // Another caller may have finished first while we were reading disk.
    if (memory.get(key)?.data !== undefined) return memory.get(key)?.data;
    write(key, { data: parsed.data, updatedAt, error: null }, false);
    return parsed.data;
  } catch {
    return undefined;
  }
};

export const setQueryData = <T,>(
  key: string,
  data: T | ((current: T | undefined) => T),
  options: { persist?: boolean; updatedAt?: number } = {}
) => {
  const { persist: persistIt = true, updatedAt = Date.now() } = options;
  const current = memory.get(key)?.data as T | undefined;
  const next = typeof data === "function" ? (data as (c: T | undefined) => T)(current) : data;
  return write<T>(key, { data: next, updatedAt, error: null }, persistIt);
};

/**
 * Applies an optimistic delta, then revalidates.
 * The previous value is returned so callers can roll back if the server says no.
 */
export const mutateQuery = async <T,>(
  key: string,
  updater: T | ((current: T | undefined) => T),
  options: { revalidate?: boolean; persist?: boolean } = {}
) => {
  const { revalidate = true, persist: persistIt = true } = options;
  const previous = memory.get(key)?.data as T | undefined;
  setQueryData(key, updater, { persist: persistIt });

  if (revalidate) {
    const fetcher = fetchers.get(key);
    if (fetcher) {
      try {
        await runQuery(key, fetcher);
      } catch {}
    }
  }
  return previous;
};

const runQuery = async <T,>(key: string, fetcher: (key: string) => Promise<T>): Promise<T> => {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    write<T>(key, { isValidating: true }, false);
    try {
      const data = await fetcher(key);
      write<T>(
        key,
        { data, error: null, updatedAt: Date.now(), isValidating: false },
        true
      );
      return data;
    } catch (error) {
      write<T>(key, { error, isValidating: false }, false);
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
};

/** Fetches now, bypassing staleness. Used by pull-to-refresh and focus. */
export const revalidateQuery = async <T,>(key: string, fetcher?: (key: string) => Promise<T>) => {
  const fn = fetcher || (fetchers.get(key) as ((key: string) => Promise<T>) | undefined);
  if (!fn) return undefined;
  return runQuery(key, fn);
};

export const invalidateQuery = (key: string) => {
  const state = memory.get(key);
  if (!state) return;
  memory.set(key, { ...state, updatedAt: 0 });
};

export type UseQueryOptions<T> = {
  /** Data younger than this is served without a request. Default 30s. */
  staleTime?: number;
  /** Keep the last payload on disk for offline cold starts. Default true. */
  persist?: boolean;
  /** Set false to hold requests (offline, signed out). */
  enabled?: boolean;
  /** Skip the automatic background revalidation. */
  revalidateOnMount?: boolean;
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: unknown) => void;
};

export function useQuery<T>(
  key: string | null,
  fetcher: (key: string) => Promise<T>,
  options: UseQueryOptions<T> = {}
) {
  const {
    staleTime = DEFAULT_STALE_TIME,
    persist: persistIt = true,
    enabled = true,
    revalidateOnMount = true,
    initialData,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<QueryState<T> | undefined>(() =>
    key ? (memory.get(key) as QueryState<T> | undefined) : undefined
  );

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const handlersRef = useRef({ onSuccess, onError });
  handlersRef.current = { onSuccess, onError };
  const persistRef = useRef(persistIt);
  persistRef.current = persistIt;
  const staleRef = useRef(staleTime);
  staleRef.current = staleTime;

  useEffect(() => {
    if (!key) return;

    let cancelled = false;

    const sync = () => {
      if (!cancelled) setState(memory.get(key) as QueryState<T> | undefined);
    };

    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(sync);
    fetchers.set(key, (k: string) => fetcherRef.current(k));
    setState(memory.get(key) as QueryState<T> | undefined);

    (async () => {
      if (persistRef.current) {
        await hydrateQuery(key);
        if (cancelled) return;
        sync();
      }

      if (!enabled || !revalidateOnMount) return;

      const current = memory.get(key) as QueryState<T> | undefined;
      const isFresh =
        current?.data !== undefined && Date.now() - current.updatedAt < staleRef.current;
      if (isFresh) return;

      try {
        const data = await revalidateQuery<T>(key, (k) => fetcherRef.current(k));
        if (!cancelled && data !== undefined) handlersRef.current.onSuccess?.(data);
      } catch (error) {
        if (!cancelled) handlersRef.current.onError?.(error);
      }
    })();

    return () => {
      cancelled = true;
      listeners.get(key)?.delete(sync);
      if (listeners.get(key)?.size === 0) listeners.delete(key);
    };
    // `enabled` is intentionally part of the deps: going offline → online (or
    // signing back in) should retry a query that previously failed.
  }, [key, enabled, revalidateOnMount]);

  const refresh = useCallback(async () => {
    if (!key) return undefined;
    try {
      return await revalidateQuery<T>(key, (k) => fetcherRef.current(k));
    } catch (error) {
      handlersRef.current.onError?.(error);
      return undefined;
    }
  }, [key]);

  const mutate = useCallback(
    async (
      updater: T | ((current: T | undefined) => T),
      mutateOptions: { revalidate?: boolean } = {}
    ) => {
      if (!key) return undefined;
      return mutateQuery<T>(key, updater, mutateOptions);
    },
    [key]
  );

  const data = (state?.data !== undefined ? state.data : initialData) as T | undefined;

  return {
    data,
    error: state?.error ?? null,
    /** True only when there is nothing to show yet. */
    isLoading: data === undefined && !state?.updatedAt,
    isValidating: Boolean(state?.isValidating),
    updatedAt: state?.updatedAt ?? 0,
    refresh,
    mutate,
  };
}

export default useQuery;
