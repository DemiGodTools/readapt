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

  private baselineServerLiked = new Map<string, boolean>();
  private desiredServerLiked = new Map<string, boolean>();
  private syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private inFlightSyncs = new Set<string>();

  /**
   * Coalesces rapid Like/Unlike taps per chapter so at most one serialized
   * server toggle fires once user taps settle, preventing optimistic desync.
   */
  public scheduleCoalescedSync(
    chapterId: string,
    prevServerLiked: boolean,
    desiredLiked: boolean,
    toggleRequest: () => Promise<{ liked: boolean; likes: number } | null>,
    onSynced?: (result: { success: boolean; liked: boolean; likes?: number }) => void
  ) {
    const id = String(chapterId || "").trim();
    if (!id) return;

    if (!this.baselineServerLiked.has(id)) {
      this.baselineServerLiked.set(id, prevServerLiked);
    }
    this.desiredServerLiked.set(id, desiredLiked);

    const existingTimer = this.syncTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.syncTimers.delete(id);
      void this.flushCoalescedSync(id, toggleRequest, onSynced);
    }, 350);
    this.syncTimers.set(id, timer);
  }

  private async flushCoalescedSync(
    id: string,
    toggleRequest: () => Promise<{ liked: boolean; likes: number } | null>,
    onSynced?: (result: { success: boolean; liked: boolean; likes?: number }) => void
  ) {
    if (this.inFlightSyncs.has(id)) return;

    const baseline = this.baselineServerLiked.get(id);
    const desired = this.desiredServerLiked.get(id);
    if (baseline === undefined || desired === undefined || desired === baseline) {
      this.baselineServerLiked.delete(id);
      this.desiredServerLiked.delete(id);
      return;
    }

    this.inFlightSyncs.add(id);
    try {
      const res = await toggleRequest();
      if (res) {
        this.baselineServerLiked.set(id, res.liked);
        const latestDesired = this.desiredServerLiked.get(id);
        if (latestDesired !== undefined && latestDesired !== res.liked) {
          this.inFlightSyncs.delete(id);
          await this.flushCoalescedSync(id, toggleRequest, onSynced);
          return;
        }
        this.baselineServerLiked.delete(id);
        this.desiredServerLiked.delete(id);
        this.set(id, res.liked, res.likes);
        onSynced?.({ success: true, liked: res.liked, likes: res.likes });
      } else {
        this.baselineServerLiked.delete(id);
        this.desiredServerLiked.delete(id);
        onSynced?.({ success: false, liked: baseline });
      }
    } catch {
      this.baselineServerLiked.delete(id);
      this.desiredServerLiked.delete(id);
      onSynced?.({ success: false, liked: baseline });
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
