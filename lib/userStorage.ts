import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter, AppState } from "react-native";
import { IRecentRead } from "../types/Storage";
import { api } from "./api";

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

/**
 * Instantly hydrates recent reads into memory and disk from the backend user object
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
    ramRecentReadsCache.set(key, formatted);
    await AsyncStorage.setItem(key, JSON.stringify(formatted)).catch(() => {});
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
            // Merge gracefully with any fresher local reads
            const mergedMap = new Map<string, IRecentRead>();
            serverReads.forEach((item) => {
              const cId = String(item?.content?._id || (item?.content as any)?.id || item?.content || "");
              if (cId) mergedMap.set(cId, item);
            });
            localReads.forEach((item) => {
              const cId = String(item?.content?._id || (item?.content as any)?.id || item?.content || "");
              if (cId) mergedMap.set(cId, item); // Local takes precedence if recent
            });

            const mergedList = Array.from(mergedMap.values());
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

/**
 * Dispatches the throttled background network write to MongoDB.
 */
const executeCloudProgressSync = (chapterId: string, readtill: string, total: string) => {
  if (!chapterId) return;
  api
    .post("/recent-reads", {
      chapterId: String(chapterId),
      readtill: String(readtill || "1"),
      total: String(total || "1"),
    })
    .catch(() => {});
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

        if (options?.immediateSync) {
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
