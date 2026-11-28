import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";

export interface LikeEntry {
  liked: boolean;
  count: number;
  timestamp: number;
}

const STORAGE_KEY = "@readapt_like_state_cache";

class LikeManagerClass {
  private cache: Map<string, LikeEntry> = new Map();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private persistTimer: any = null;

  constructor() {
    this.init();
  }

  public async init(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            Object.entries(parsed).forEach(([key, val]: [string, any]) => {
              if (val && typeof val === "object") {
                this.cache.set(key, {
                  liked: Boolean(val.liked),
                  count: Math.max(0, Number(val.count) || 0),
                  timestamp: Number(val.timestamp) || Date.now(),
                });
              }
            });
          }
        }
      } catch (e) {
        console.warn("LikeManager init error:", e);
      } finally {
        this.isLoaded = true;
      }
    })();

    return this.loadPromise;
  }

  public get(chapterId: string | undefined | null): LikeEntry | undefined {
    if (!chapterId) return undefined;
    return this.cache.get(String(chapterId));
  }

  public getCount(chapterId: string | undefined | null, fallbackCount = 0): number {
    const entry = this.get(chapterId);
    return entry !== undefined ? entry.count : Math.max(0, fallbackCount);
  }

  public isLiked(chapterId: string | undefined | null, fallbackLiked = false): boolean {
    const entry = this.get(chapterId);
    return entry !== undefined ? entry.liked : Boolean(fallbackLiked);
  }

  public set(
    chapterId: string | undefined | null,
    liked: boolean,
    count: number,
    broadcast = true
  ): void {
    if (!chapterId) return;
    const strId = String(chapterId);
    const safeCount = Math.max(0, count);
    const entry: LikeEntry = {
      liked,
      count: safeCount,
      timestamp: Date.now(),
    };
    this.cache.set(strId, entry);

    if (broadcast) {
      try {
        DeviceEventEmitter.emit("like-updated", {
          chapterId: strId,
          liked: entry.liked,
          count: entry.count,
        });
      } catch {}
    }

    this.persistDebounced();
  }

  private baselineServer = new Map<string, { liked: boolean; count: number }>();
  private desiredServerLiked = new Map<string, boolean>();
  private syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private inFlightSyncs = new Set<string>();

  /**
   * Handles an optimistic like tap with deterministic baseline counting and
   * coalesced idempotent server sync. Rapid tapping oscillates cleanly around
   * the confirmed baseline count without ever drifting upward.
   */
  public applyOptimisticTap(
    chapterId: string,
    fallbackLiked: boolean,
    fallbackCount: number,
    syncRequest: (desiredLiked: boolean) => Promise<{ liked: boolean; likes: number } | null>,
    onSynced?: (result: { success: boolean; liked: boolean; likes: number }) => void
  ): { nextLiked: boolean; nextCount: number } {
    const id = String(chapterId || "").trim();
    if (!id) {
      return { nextLiked: fallbackLiked, nextCount: Math.max(0, fallbackCount) };
    }

    if (!this.baselineServer.has(id)) {
      this.baselineServer.set(id, {
        liked: Boolean(fallbackLiked),
        count: Math.max(0, Number(fallbackCount) || 0),
      });
    }

    const base = this.baselineServer.get(id)!;
    const currentEntry = this.get(id);
    const currentLiked = currentEntry ? currentEntry.liked : Boolean(fallbackLiked);
    const nextLiked = !currentLiked;

    const delta = nextLiked === base.liked ? 0 : nextLiked ? 1 : -1;
    const nextCount = Math.max(0, base.count + delta);

    this.desiredServerLiked.set(id, nextLiked);
    this.set(id, nextLiked, nextCount);

    const existingTimer = this.syncTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.syncTimers.delete(id);
      void this.flushCoalescedSync(id, syncRequest, onSynced);
    }, 650);
    this.syncTimers.set(id, timer);

    return { nextLiked, nextCount };
  }

  private async flushCoalescedSync(
    id: string,
    syncRequest: (desiredLiked: boolean) => Promise<{ liked: boolean; likes: number } | null>,
    onSynced?: (result: { success: boolean; liked: boolean; likes: number }) => void
  ) {
    if (this.inFlightSyncs.has(id)) return;

    const base = this.baselineServer.get(id);
    const desired = this.desiredServerLiked.get(id);
    if (!base || desired === undefined || desired === base.liked) {
      this.baselineServer.delete(id);
      this.desiredServerLiked.delete(id);
      return;
    }

    this.inFlightSyncs.add(id);
    try {
      const res = await syncRequest(desired);
      if (res) {
        const confirmedLikes = Math.max(0, Number(res.likes) || 0);
        this.baselineServer.set(id, { liked: res.liked, count: confirmedLikes });

        const latestDesired = this.desiredServerLiked.get(id);
        if (latestDesired !== undefined && latestDesired !== res.liked) {
          this.inFlightSyncs.delete(id);
          await this.flushCoalescedSync(id, syncRequest, onSynced);
          return;
        }

        this.baselineServer.delete(id);
        this.desiredServerLiked.delete(id);
        this.set(id, res.liked, confirmedLikes);
        onSynced?.({ success: true, liked: res.liked, likes: confirmedLikes });
      } else {
        this.baselineServer.delete(id);
        this.desiredServerLiked.delete(id);
        this.set(id, base.liked, base.count);
        onSynced?.({ success: false, liked: base.liked, likes: base.count });
      }
    } catch {
      this.baselineServer.delete(id);
      this.desiredServerLiked.delete(id);
      this.set(id, base.liked, base.count);
      onSynced?.({ success: false, liked: base.liked, likes: base.count });
    } finally {
      this.inFlightSyncs.delete(id);
    }
  }

  private persistDebounced() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(async () => {
      try {
        const obj: Record<string, LikeEntry> = {};
        this.cache.forEach((val, key) => {
          obj[key] = val;
        });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      } catch (e) {
        console.warn("LikeManager persist error:", e);
      }
    }, 400);
  }
}

export const LikeManager = new LikeManagerClass();
