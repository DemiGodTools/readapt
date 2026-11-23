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
