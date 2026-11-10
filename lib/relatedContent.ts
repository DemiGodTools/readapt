// File: lib/relatedContent.ts
// Shared resolver for the "Related content" section shown on standalone
// (non-series) readers.
//
// Loading behaviour:
//  - The first time a book is opened we build a pool from the already-cached
//    feed/series and return it immediately (no network wait).
//  - The result is memoised in memory and on disk, so returning to the player
//    (mini player -> full player) paints the same row instantly instead of
//    wiping it and starting over.
//  - A background refresh runs at most once every few minutes and only ever
//    replaces the row when it actually found something.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const FEED_POOL_KEYS = ["available", "trending", "personalized"] as const;
const RELATED_COUNT = 4;
const RELATED_TTL_MS = 10 * 60 * 1000;
const RELATED_STORAGE_PREFIX = "@related_books_";

type RelatedEntry = {
  items: any[];
  at: number;
};

// Per-book cache so a remount (mini player -> player, chapter re-open) is instant.
const relatedMemoryCache = new Map<string, RelatedEntry>();
// Deduplicates concurrent resolutions for the same book.
const relatedInflight = new Map<string, Promise<any[]>>();
const relatedRefreshing = new Set<string>();

// The local pool is the same for every standalone book, so parse it once and
// reuse it instead of hitting AsyncStorage on every screen mount.
let poolCache: { at: number; pool: any[]; excluded: Set<string> } | null = null;

export const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const isStrictlyStandaloneBook = (
  item: any,
  excludedSeriesChapterIds?: Set<string>
): boolean => {
  if (!item) return false;
  const actualItem =
    typeof item.content === "object" && item.content !== null
      ? item.content
      : item;
  const itemId = String(actualItem?._id || item?._id || "").trim();
  if (!itemId) return false;
  if (excludedSeriesChapterIds && excludedSeriesChapterIds.has(itemId))
    return false;
  if (item.contentModel && item.contentModel !== "Chapter") return false;
  if (actualItem.contentModel && actualItem.contentModel !== "Chapter")
    return false;

  const checkSeriesProp = (obj: any) => {
    if (!obj) return false;
    if (Array.isArray(obj.chapters) && obj.chapters.length > 0) return true;
    if (obj.series) {
      if (typeof obj.series === "string" && obj.series.trim() !== "")
        return true;
      if (typeof obj.series === "object") {
        if (obj.series._id) return true;
        if (Object.keys(obj.series).length > 0) return true;
      }
    }
    if (obj.seriesId && String(obj.seriesId).trim() !== "") return true;
    if (obj.parentSeries && String(obj.parentSeries).trim() !== "") return true;
    if (obj.isSeriesContent || obj.isSeriesChapter || obj.isSeries) return true;
    if (obj.seriesType === "framework" || obj.seriesType === "normal")
      return true;
    return false;
  };

  if (checkSeriesProp(item) || checkSeriesProp(actualItem)) return false;
  return true;
};

const getBookCategoryId = (book: any): string => {
  if (!book) return "";
  const raw =
    typeof book.category === "object" && book.category !== null
      ? book.category?._id
      : book.category;
  return raw ? String(raw).trim() : "";
};

const collectSeriesChapterIds = (target: Set<string>, seriesList: any[]) => {
  if (!Array.isArray(seriesList)) return;
  seriesList.forEach((s) => {
    if (!s) return;
    const recId =
      typeof s.recommendationBookId === "object"
        ? s.recommendationBookId?._id
        : s.recommendationBookId;
    if (recId) target.add(String(recId).trim());
    if (Array.isArray(s.chapters)) {
      s.chapters.forEach((ch: any) => {
        const chId =
          (typeof ch?.content === "object" && ch?.content?._id) ||
          (typeof ch?.content === "string" && ch?.content) ||
          ch?._id;
        if (chId) target.add(String(chId).trim());
      });
    }
  });
};

const pickRelated = (
  pool: any[],
  book: any,
  excludedSeriesChapterIds: Set<string>
): any[] => {
  const bookId = String(book?._id || "").trim();
  const catId = getBookCategoryId(book);

  const strictlyStandalone = pool.filter((item: any) => {
    if (!isStrictlyStandaloneBook(item, excludedSeriesChapterIds)) return false;
    const itemId = String(item?.content?._id || item?._id || "").trim();
    return itemId !== bookId;
  });

  const uniqueMap = new Map<string, any>();
  strictlyStandalone.forEach((item) => {
    const actual =
      typeof item.content === "object" && item.content !== null
        ? item.content
        : item;
    if (actual?._id) uniqueMap.set(String(actual._id), actual);
  });
  const deduplicatedPool = Array.from(uniqueMap.values());

  const sameCategoryList = deduplicatedPool.filter((item) => {
    const itemCat =
      typeof item.category === "object" ? item.category?._id : item.category;
    return Boolean(catId) && String(itemCat) === catId;
  });
  const otherCategoryList = deduplicatedPool.filter((item) => {
    const itemCat =
      typeof item.category === "object" ? item.category?._id : item.category;
    return !catId || String(itemCat) !== catId;
  });

  // Shuffle only the pools we actually consume; keeps the row stable between
  // renders that reuse the same cached result.
  const shuffledSame = shuffleArray(sameCategoryList).slice(0, RELATED_COUNT);
  const remaining = Math.max(0, RELATED_COUNT - shuffledSame.length);

  return [
    ...shuffledSame,
    ...(remaining > 0 ? shuffleArray(otherCategoryList).slice(0, remaining) : []),
  ];
};

const buildLocalPool = async (): Promise<{
  pool: any[];
  excluded: Set<string>;
}> => {
  if (poolCache && Date.now() - poolCache.at < 60 * 1000) {
    return poolCache;
  }

  const excluded = new Set<string>();
  const pool: any[] = [];
  const addToPool = (items: any) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      if (item) pool.push(item);
    });
  };

  // 1. Cached feed (what Home already persisted)
  try {
    const cachedFeedRaw = await AsyncStorage.getItem("cached_feed_data");
    if (cachedFeedRaw) {
      const cachedFeed = JSON.parse(cachedFeedRaw);
      collectSeriesChapterIds(excluded, cachedFeed?.series);
      FEED_POOL_KEYS.forEach((key) => addToPool(cachedFeed?.[key]));
    }
  } catch {}

  // 2. Cached series (both key prefixes are in use across the app)
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const seriesKeys = allKeys.filter(
      (k) => k.startsWith("cache_series_") || k.startsWith("cached_series_")
    );
    if (seriesKeys.length > 0) {
      const seriesPairs = await AsyncStorage.multiGet(seriesKeys);
      const parsedSeries = seriesPairs
        .map(([, val]) => {
          try {
            const parsed = val ? JSON.parse(val) : null;
            return parsed?.data?.data ?? parsed?.data ?? parsed;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      collectSeriesChapterIds(excluded, parsedSeries);
    }
  } catch {}

  poolCache = { at: Date.now(), pool, excluded };
  return poolCache;
};

const readStoredRelated = async (bookId: string): Promise<any[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${RELATED_STORAGE_PREFIX}${bookId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const storeRelated = (bookId: string, items: any[]) => {
  relatedMemoryCache.set(bookId, { items, at: Date.now() });
  AsyncStorage.setItem(
    `${RELATED_STORAGE_PREFIX}${bookId}`,
    JSON.stringify(items)
  ).catch(() => {});
};

/** Synchronous peek used to hydrate state before the effect runs. */
export const getCachedRelatedBooks = (bookId?: string | null): any[] | null => {
  const key = String(bookId || "").trim();
  if (!key) return null;
  return relatedMemoryCache.get(key)?.items ?? null;
};

/**
 * Builds the standalone "Related content" list for a chapter.
 *
 * Returns cached results immediately. When a refresh is needed it runs in the
 * background (or while awaiting only on the very first, uncached open) and
 * reports improvements through `onUpdate` so the UI never has to go blank.
 */
export const resolveRelatedStandaloneBooks = async ({
  book,
  accessToken,
  isConnected,
  onUpdate,
}: {
  book: any;
  accessToken?: string | null;
  isConnected: boolean;
  onUpdate?: (items: any[]) => void;
}): Promise<any[]> => {
  const bookId = String(book?._id || "").trim();
  if (!bookId) return [];

  const existing = relatedMemoryCache.get(bookId);
  const isFresh = Boolean(existing && Date.now() - existing.at < RELATED_TTL_MS);

  if (existing && isFresh) {
    return existing.items;
  }

  const inflight = relatedInflight.get(bookId);
  if (inflight) return inflight;

  const run = async (): Promise<any[]> => {
    let items: any[] = existing?.items || [];

    // Fast path: memory miss -> read disk cache, still without touching network.
    if (items.length === 0) {
      const stored = await readStoredRelated(bookId);
      if (stored) {
        items = stored;
        relatedMemoryCache.set(bookId, { items, at: 0 });
      }
    }

    // Only parse the cached feed/series when we still need candidates.
    const localPoolResult =
      items.length < RELATED_COUNT ? await buildLocalPool() : null;
    const excluded = localPoolResult?.excluded ?? new Set<string>();
    const local = localPoolResult
      ? pickRelated(localPoolResult.pool, book, excluded)
      : [];

    // Merge so a refresh can never shrink the row below what is already shown.
    const mergeRelated = (...lists: any[][]): any[] => {
      const merged = new Map<string, any>();
      lists.flat().forEach((item) => {
        const actual =
          typeof item?.content === "object" && item?.content !== null
            ? item.content
            : item;
        const id = String(actual?._id || item?._id || "").trim();
        if (id && !merged.has(id)) merged.set(id, actual);
      });
      return Array.from(merged.values()).slice(0, RELATED_COUNT);
    };

    if (items.length === 0) {
      items = local;
      if (items.length > 0) {
        storeRelated(bookId, items);
        // Local-only results are not a full refresh: allow the next open to
        // try the network again instead of treating them as fresh for 10 min.
        relatedMemoryCache.set(bookId, { items, at: 0 });
      }
    } else if (local.length > 0 && items.length < RELATED_COUNT) {
      // Only re-persist when the local pool actually adds new entries.
      const merged = mergeRelated(items, local);
      if (merged.length > items.length) {
        items = merged;
        storeRelated(bookId, items);
        relatedMemoryCache.set(bookId, { items, at: 0 });
      }
    }

    if (!isConnected) return items;

    const refresh = async () => {
      let next = items;
      const catId = getBookCategoryId(book);

      if (catId) {
        try {
          const catRes = await api.get(`/chapter/by-category/${catId}`, {
            timeout: 8000,
          });
          const payload = catRes?.data?.data;
          const freshList = Array.isArray(payload) ? payload : payload?.chapters;
          if (Array.isArray(freshList) && freshList.length > 0) {
            next = mergeRelated(next, pickRelated(freshList, book, excluded));
          }
        } catch {}
      }

      if (next.length < RELATED_COUNT && accessToken) {
        try {
          const feedRes = await api.get("/feed", { timeout: 8000 });
          const payload = feedRes?.data?.data ?? feedRes?.data;
          if (payload) {
            const feedExcluded = new Set(excluded);
            collectSeriesChapterIds(feedExcluded, payload?.series);
            const feedPool: any[] = [];
            FEED_POOL_KEYS.forEach((key) => {
              const list = payload?.[key];
              if (Array.isArray(list)) feedPool.push(...list);
            });
            next = mergeRelated(next, pickRelated(feedPool, book, feedExcluded));
          }
        } catch {}
      }

      if (next.length > 0) {
        if (!isSameList(items, next)) {
          items = next;
          storeRelated(bookId, items);
          onUpdate?.(items);
        } else {
          relatedMemoryCache.set(bookId, { items, at: Date.now() });
        }
      }

      return items;
    };

    // If we already have something to show, refresh in the background so the
    // caller (and the UI) is never blocked on the network.
    if (items.length > 0) {
      if (!relatedRefreshing.has(bookId)) {
        relatedRefreshing.add(bookId);
        void refresh().finally(() => relatedRefreshing.delete(bookId));
      }
      return items;
    }

    return refresh();
  };

  const promise = run()
    .catch(() => existing?.items || [])
    .finally(() => {
      relatedInflight.delete(bookId);
    });

  relatedInflight.set(bookId, promise);
  return promise;
};

const isSameList = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const aId = String(a[i]?._id || a[i]?.content?._id || "");
    const bId = String(b[i]?._id || b[i]?.content?._id || "");
    if (aId !== bId) return false;
  }
  return true;
};
