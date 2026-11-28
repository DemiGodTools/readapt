import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter, AppState } from "react-native";
import { IRecentRead } from "../types/Storage";
import { api, getIsNetworkConnected } from "./api";

// ⚡ In-Memory RAM Cache for O(1) instant zero-latency retrieval
const ramRecentReadsCache = new Map<string, IRecentRead[]>();

// In-flight Promise deduplication: prevents multiple components firing identical requests
const inFlightCloudRequests = new Map<string, Promise<IRecentRead[]>>();

// Cloud sync throttling state
interface PendingCloudSync {
  chapterId: string;
  readtill: string;
  total: string;
  timer?: ReturnType<typeof setTimeout>;
  lastSyncedAt: number;
}
const pendingSyncMap = new Map<string, PendingCloudSync>();
const MIN_CLOUD_SYNC_INTERVAL_MS = 15000; // Throttle MongoDB writes to at most once per 15s per chapter

/**
 * Resolves the canonical user ID for persistent storage isolation.
 */
let cachedResolvedUserId: string | null = null;

export const resetUserStorageCache = () => {
  cachedResolvedUserId = null;
  ramRecentReadsCache.clear();
};

const getEntryId = (item: any): string => {
  return String(item?.content?._id || item?.content?.id || item?.chapter?._id || item?.chapter || item?.content || "");
};

const getEntryTimestamp = (item: any): number => {
  const ms = item?.readAt ? Date.parse(String(item.readAt)) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

const readOfflineQueueMap = async (): Promise<Record<string, any>> => {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_PROGRESS_QUEUE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const mergeRecentReadsPreservingNewer = (
  serverList: IRecentRead[],
  localList: IRecentRead[],
  queuedMap: Record<string, any>
): IRecentRead[] => {
  const merged = new Map<string, IRecentRead>();

  for (const sItem of serverList) {
    const id = getEntryId(sItem);
    if (id) merged.set(id, sItem);
  }

  for (const lItem of localList) {
    const id = getEntryId(lItem);
    if (!id) continue;
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, lItem);
      continue;
    }
    const isQueuedOffline = Boolean(queuedMap[id]);
    const localTime = getEntryTimestamp(lItem);
    const serverTime = getEntryTimestamp(existing);
    if (isQueuedOffline || localTime >= serverTime) {
      merged.set(id, lItem);
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => getEntryTimestamp(b) - getEntryTimestamp(a))
    .slice(0, 50);
};

/**
 * Instantly hydrates recent reads into memory and disk from the backend user object,
 * without overwriting fresher local or offline-queued reading progress.
 */
export const hydrateRecentReadsFromUser = async (userId: string, userRecentReads: any[]) => {
  if (!userId || !Array.isArray(userRecentReads) || userRecentReads.length === 0) return;
  const key = getRecentReadsKey(userId);
  const formatted: IRecentRead[] = userRecentReads
    .filter((r) => Boolean(r?.chapter || r?.content))
    .map((r) => ({
      content: r.chapter || r.content,
      readtill: String(r.readtill || "1"),
      total: String(r.total || "1"),
      readAt: r.readAt ? new Date(r.readAt).toISOString() : new Date().toISOString(),
    }));
  if (formatted.length > 0) {
    let existingLocal: IRecentRead[] = ramRecentReadsCache.get(key) || [];
    if (existingLocal.length === 0) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) existingLocal = parsed;
        }
      } catch {}
    }
    const queuedMap = await readOfflineQueueMap();
    const merged = mergeRecentReadsPreservingNewer(formatted, existingLocal, queuedMap);
    ramRecentReadsCache.set(key, merged);
    await AsyncStorage.setItem(key, JSON.stringify(merged)).catch(() => {});
  }
};

export const resolveCanonicalUserId = async (providedUserId?: string): Promise<string> => {
  if (providedUserId && providedUserId !== "guest" && providedUserId !== "undefined") {
    cachedResolvedUserId = providedUserId;
    return providedUserId;
  }
  if (cachedResolvedUserId) return cachedResolvedUserId;

  try {
    const raw = await AsyncStorage.getItem("cached_user_profile");
    if (raw) {
      const u = JSON.parse(raw);
      const id = String(u?._id || u?.id || u?.userId || u?.email || "").trim();
      if (id) {
        cachedResolvedUserId = id;
        return id;
      }
    }
  } catch {}

  return "guest";
};

/**
 * Returns a user-scoped key for recent reads storage.
 */
export const getRecentReadsKey = (userId?: string): string => {
  const cleanId = userId && userId !== "undefined" ? userId : (cachedResolvedUserId || "guest");
  return `recentReads_${cleanId}`;
};

/**
 * Returns user-scoped recent reads.
 * 1. Reads from ultra-fast O(1) RAM cache (0ms).
 * 2. Reads from AsyncStorage if cold.
 * 3. Deduplicates cloud requests and syncs with cloud MongoDB.
 */
export const getRecentReads = async (userId?: string, forceSync = false): Promise<IRecentRead[]> => {
  try {
    const resolvedUid = await resolveCanonicalUserId(userId);
    const key = getRecentReadsKey(resolvedUid);

    // 1. RAM Cache Hit (Instant response, zero AsyncStorage overhead)
    if (!forceSync && ramRecentReadsCache.has(key)) {
      const ramData = ramRecentReadsCache.get(key);
      if (ramData && ramData.length > 0) {
        return ramData;
      }
    }

    // 2. AsyncStorage Local Persistence Hit
    let localReads: IRecentRead[] = [];
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localReads = parsed;
          ramRecentReadsCache.set(key, localReads);
          if (!forceSync) return localReads;
        }
      }
    } catch {}

    // If guest or no network needed, return local reads
    if (resolvedUid === "guest") {
      return localReads;
    }

    // 3. Deduplicated Cloud Sync from MongoDB
    if (inFlightCloudRequests.has(key)) {
      return inFlightCloudRequests.get(key)!;
    }

    const cloudFetchPromise = (async () => {
      try {
        const res = await api.get("/recent-reads", { timeout: 7000 });
        if (res.data?.success && Array.isArray(res.data?.data)) {
          const serverReads: IRecentRead[] = res.data.data;
          if (serverReads.length > 0) {
            const queuedMap = await readOfflineQueueMap();
            const mergedList = mergeRecentReadsPreservingNewer(serverReads, localReads, queuedMap);
            ramRecentReadsCache.set(key, mergedList);
            await AsyncStorage.setItem(key, JSON.stringify(mergedList)).catch(() => {});
            return mergedList;
          }
        }
      } catch {}

      ramRecentReadsCache.set(key, localReads);
      return localReads;
    })().finally(() => {
      inFlightCloudRequests.delete(key);
    });

    inFlightCloudRequests.set(key, cloudFetchPromise);
    return cloudFetchPromise;
  } catch (error) {
    console.warn("Failed to load user recent reads:", error);
    return [];
  }
};

const OFFLINE_PROGRESS_QUEUE_KEY = "@readapt_offline_progress_queue_v1";

const queueFailedCloudSync = async (chapterId: string, readtill: string, total: string) => {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_PROGRESS_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const queue = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    queue[chapterId] = { chapterId, readtill, total, updatedAt: Date.now() };
    await AsyncStorage.setItem(OFFLINE_PROGRESS_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
};

let inFlightQueueFlush: Promise<void> | null = null;

/**
 * Flushes any progress writes that failed while offline once connectivity returns.
 */
export const flushOfflineProgressQueue = async (): Promise<void> => {
  if (inFlightQueueFlush) return inFlightQueueFlush;
  inFlightQueueFlush = (async () => {
    try {
      const queue = await readOfflineQueueMap();
      const entries = Object.values(queue) as Array<{
        chapterId: string;
        readtill: string;
        total: string;
        updatedAt?: number;
      }>;
      if (entries.length === 0) return;

      // Oldest first so server recentReads order puts the most recently read book on top
      entries.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));

      const remaining: Record<string, any> = {};
      for (const item of entries) {
        if (!item?.chapterId) continue;
        try {
          await api.post(
            "/recent-reads",
            {
              chapterId: String(item.chapterId),
              readtill: String(item.readtill || "1"),
              total: String(item.total || "1"),
            },
            { headers: { "x-silent-offline": "1" } }
          );
        } catch {
          remaining[item.chapterId] = item;
        }
      }

      if (Object.keys(remaining).length > 0) {
        await AsyncStorage.setItem(OFFLINE_PROGRESS_QUEUE_KEY, JSON.stringify(remaining));
      } else {
        await AsyncStorage.removeItem(OFFLINE_PROGRESS_QUEUE_KEY);
      }
    } catch {}
  })().finally(() => {
    inFlightQueueFlush = null;
  });
  return inFlightQueueFlush;
};

/**
 * Dispatches the throttled background network write to MongoDB.
 * Persists failed writes to the offline retry queue so progress is never lost.
 */
const executeCloudProgressSync = (chapterId: string, readtill: string, total: string) => {
  if (!chapterId) return;
  if (!getIsNetworkConnected()) {
    void queueFailedCloudSync(String(chapterId), String(readtill || "1"), String(total || "1"));
    return;
  }
  api
    .post(
      "/recent-reads",
      {
        chapterId: String(chapterId),
        readtill: String(readtill || "1"),
        total: String(total || "1"),
      },
      { headers: { "x-silent-offline": "1" } }
    )
    .catch(() => {
      void queueFailedCloudSync(String(chapterId), String(readtill || "1"), String(total || "1"));
    });
};

/**
 * Flush any pending cloud sync writes immediately (e.g. before app backgrounding or screen exit).
 */
export const flushPendingRecentReadsSync = () => {
  pendingSyncMap.forEach((entry, chapterId) => {
    if (entry.timer) clearTimeout(entry.timer);
    executeCloudProgressSync(chapterId, entry.readtill, entry.total);
  });
  pendingSyncMap.clear();
};

// Auto-flush pending progress when app transitions to background
try {
  AppState.addEventListener("change", (state) => {
    if (state.match(/inactive|background/)) {
      flushPendingRecentReadsSync();
    }
  });
} catch (_) {}

/**
 * Saves recent reads scoped to a user and syncs with cloud MongoDB.
 * Uses smart throttling: local state updates in 0ms, server writes are batched.
 */
export const saveRecentReads = async (
  userId: string | undefined,
  reads: IRecentRead[],
  options?: { immediateSync?: boolean }
): Promise<void> => {
  try {
    const resolvedUid = await resolveCanonicalUserId(userId);
    const key = getRecentReadsKey(resolvedUid);

    // 1. Instant RAM Cache Update
    ramRecentReadsCache.set(key, reads);

    // 2. Fast Asynchronous Storage Persistence
    AsyncStorage.setItem(key, JSON.stringify(reads)).catch(() => {});

    // 3. Emit local real-time event for UI listeners
    DeviceEventEmitter.emit("RECENT_READS_UPDATED", reads);

    // 4. Smart Throttled Cross-Device Cloud Sync
    if (resolvedUid !== "guest" && reads.length > 0) {
      const latest = reads[0];
      const rawCId = latest?.content?._id || (latest?.content as any)?.id || latest?.content;
      const chapterId = rawCId ? String(rawCId) : "";

      if (chapterId) {
        const readtill = String(latest.readtill || "1");
        const total = String(latest.total || "1");
        const now = Date.now();

        if (options?.immediateSync || !getIsNetworkConnected()) {
          const pending = pendingSyncMap.get(chapterId);
          if (pending?.timer) clearTimeout(pending.timer);
          pendingSyncMap.delete(chapterId);
          executeCloudProgressSync(chapterId, readtill, total);
          return;
        }

        const existing = pendingSyncMap.get(chapterId);
        const timeSinceLastSync = existing ? now - existing.lastSyncedAt : Number.MAX_SAFE_INTEGER;

        if (!existing || timeSinceLastSync >= MIN_CLOUD_SYNC_INTERVAL_MS) {
          // Time window satisfied: send write now
          if (existing?.timer) clearTimeout(existing.timer);
          pendingSyncMap.set(chapterId, {
            chapterId,
            readtill,
            total,
            lastSyncedAt: now,
          });
          executeCloudProgressSync(chapterId, readtill, total);
        } else {
          // Inside throttle window: schedule trailing-edge debounced update
          if (existing.timer) clearTimeout(existing.timer);
          existing.readtill = readtill;
          existing.total = total;
          existing.timer = setTimeout(() => {
            const current = pendingSyncMap.get(chapterId);
            if (current) {
              pendingSyncMap.delete(chapterId);
              executeCloudProgressSync(chapterId, current.readtill, current.total);
            }
          }, 3500); // 3.5s trailing edge
        }
      }
    }
  } catch (error) {
    console.warn("Failed to save user recent reads:", error);
  }
};
