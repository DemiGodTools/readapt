import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { IRecentRead } from "../types/Storage";
import { api } from "./api";

/**
 * Returns a user-scoped key for recent reads storage.
 * If userId is not provided, falls back to "recentReads_guest".
 */
export const getRecentReadsKey = (userId?: string): string => {
  return userId ? `recentReads_${userId}` : "recentReads_guest";
};

/**
 * Returns user-scoped recent reads.
 * 1. Reads from fast local cache (scoped to userId).
 * 2. If empty and userId is present, fetches from MongoDB cloud sync (/api/user/recent-reads).
 */
export const getRecentReads = async (userId?: string): Promise<IRecentRead[]> => {
  try {
    if (!userId) {
      const guestRaw = await AsyncStorage.getItem("recentReads_guest");
      return guestRaw ? JSON.parse(guestRaw) : [];
    }

    const key = getRecentReadsKey(userId);
    const raw = await AsyncStorage.getItem(key);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }

    // If local cache is empty for this user, fetch from cloud MongoDB
    try {
      const res = await api.get("/recent-reads");
      if (res.data?.success && Array.isArray(res.data?.data)) {
        const serverReads: IRecentRead[] = res.data.data;
        if (serverReads.length > 0) {
          await AsyncStorage.setItem(key, JSON.stringify(serverReads)).catch(() => {});
          return serverReads;
        }
      }
    } catch {}

    return [];
  } catch (error) {
    console.warn("Failed to load user recent reads:", error);
    return [];
  }
};

/**
 * Saves recent reads scoped to a user and syncs with cloud MongoDB.
 */
export const saveRecentReads = async (
  userId: string | undefined,
  reads: IRecentRead[]
): Promise<void> => {
  try {
    const key = getRecentReadsKey(userId);
    const serialized = JSON.stringify(reads);
    await AsyncStorage.setItem(key, serialized);

    DeviceEventEmitter.emit("RECENT_READS_UPDATED", reads);

    // Cross-device sync to MongoDB in background
    if (userId && reads.length > 0) {
      const latest = reads[0];
      const chapterId = latest?.content?._id || (latest?.content as any)?.id;
      if (chapterId) {
        api.post("/recent-reads", {
          chapterId: String(chapterId),
          readtill: String(latest.readtill || "1"),
          total: String(latest.total || "1"),
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.warn("Failed to save user recent reads:", error);
  }
};
