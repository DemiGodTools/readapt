import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter, AppState, AppStateStatus } from "react-native";
import { api } from "../lib/api";
import { useUser } from "./useUser";

export const STREAK_STORAGE_KEY = "readapt_user_streak_data";
export const STREAK_UNLOCKED_EVENT = "READAPT_STREAK_UNLOCKED";
export const PENDING_STREAK_KEY = "readapt_pending_streak_celebration";
export const LAST_CELEBRATED_DATE_KEY = "readapt_last_celebrated_streak_date";
export const OFFLINE_PENDING_SECONDS_KEY = "readapt_offline_pending_streak_seconds";
export const DAILY_TARGET_SECONDS = 240; // 4 minutes quality reading / listening time

let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
  if (Notifications && typeof Notifications.setNotificationHandler === "function") {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
} catch (_) {}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  todayReadingSeconds: number;
  targetSeconds: number;
  isCompletedToday: boolean;
  lastCompletedDate: string; // YYYY-MM-DD
  lastActiveDate: string;    // YYYY-MM-DD
}

export interface PendingStreakCelebration {
  streak: number;
  date: string;
  unlockedAt: number;
  notified: boolean;
}

const defaultState: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  todayReadingSeconds: 0,
  targetSeconds: DAILY_TARGET_SECONDS,
  isCompletedToday: false,
  lastCompletedDate: "",
  lastActiveDate: "",
};

// Global in-memory cache shared across hook instances
let globalStreakState: StreakState = { ...defaultState };
let inFlightStreakPromise: Promise<StreakState> | null = null;

export const getTodayDateKey = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Calculates exact calendar day difference between today and a past YYYY-MM-DD date.
 *  0: same day
 *  1: yesterday
 *  >1: missed 1 or more days (streak broken)
 *  Infinity: missing/invalid
 */
export const getCalendarDayDifference = (todayStr: string, pastDateStr?: string | null): number => {
  if (!pastDateStr || typeof pastDateStr !== "string") return Infinity;
  const cleanPast = pastDateStr.split("T")[0].trim();
  const cleanToday = todayStr.split("T")[0].trim();
  const parts1 = cleanToday.split("-").map(Number);
  const parts2 = cleanPast.split("-").map(Number);
  if (parts1.length !== 3 || parts2.length !== 3) return Infinity;
  const [y1, m1, d1] = parts1;
  const [y2, m2, d2] = parts2;
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2 || isNaN(y1) || isNaN(m1) || isNaN(d1) || isNaN(y2) || isNaN(m2) || isNaN(d2)) {
    return Infinity;
  }

  const utcToday = Date.UTC(y1, m1 - 1, d1);
  const utcPast = Date.UTC(y2, m2 - 1, d2);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((utcToday - utcPast) / msPerDay);
};

/**
 * Normalizes streak state against the current calendar date.
 * - Handles both lastCompletedDate and legacy lastDate formats, including ISO strings.
 * - If user already has an active streak, NEVER wipes it to 0 unless there is definitive proof of a 2+ day gap.
 * - Preserves todayReadingSeconds on the same calendar day.
 */
export const normalizeStreakState = (rawState?: Partial<StreakState> | null): StreakState => {
  const today = getTodayDateKey();
  const rawStreak = Math.max(0, Number(rawState?.currentStreak) || 0);
  const rawCompletedDate = typeof rawState?.lastCompletedDate === "string"
    ? rawState.lastCompletedDate
    : typeof (rawState as any)?.lastDate === "string"
    ? (rawState as any).lastDate
    : "";
  const completedDate = rawCompletedDate.split("T")[0].trim();

  const base: StreakState = {
    currentStreak: rawStreak,
    longestStreak: Math.max(rawStreak, Number(rawState?.longestStreak) || 0),
    todayReadingSeconds: Math.max(0, Number(rawState?.todayReadingSeconds) || 0),
    targetSeconds: Number(rawState?.targetSeconds) || DAILY_TARGET_SECONDS,
    isCompletedToday: Boolean(rawState?.isCompletedToday),
    lastCompletedDate: completedDate,
    lastActiveDate: today,
  };

  if (completedDate) {
    const diffFromCompleted = getCalendarDayDifference(today, completedDate);
    if (diffFromCompleted === 0) {
      // Completed today!
      base.isCompletedToday = true;
      base.currentStreak = Math.max(base.currentStreak, 1);
    } else if (diffFromCompleted === 1) {
      // Completed yesterday! Streak is alive and healthy, waiting for today's reading
      base.isCompletedToday = false;
      // base.currentStreak stays intact!
    } else if (diffFromCompleted >= 2) {
      // Missed 1 or more full days without completing -> degraded to 0
      base.currentStreak = 0;
      base.isCompletedToday = false;
    }
  } else {
    // If completedDate is missing or unrecorded but currentStreak was > 0, PRESERVE IT!
    if (base.currentStreak > 0) {
      base.lastCompletedDate = today;
      base.isCompletedToday = true;
    }
  }

  // If reading seconds reached target today, goal is achieved
  if (base.todayReadingSeconds >= base.targetSeconds) {
    base.isCompletedToday = true;
    base.currentStreak = Math.max(base.currentStreak, 1);
    base.lastCompletedDate = today;
  }

  base.longestStreak = Math.max(base.longestStreak, base.currentStreak);
  return base;
};

export const getStreakKey = (userId?: string): string => {
  return userId ? `streak_${userId}` : STREAK_STORAGE_KEY;
};

/**
 * Sends a local push notification when streak is unlocked and user exits
 */
export const sendStreakUnlockedNotification = async (streakCount: number) => {
  if (!Notifications) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    let finalStatus = status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      finalStatus = req?.status;
    }
    if (finalStatus !== "granted") return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔥 Daily Streak Locked In!",
        body: `Incredible job! You achieved today's goal and locked in your ${streakCount} ${streakCount === 1 ? "day" : "days"} streak! Keep the flame burning bright.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { type: "STREAK_UNLOCKED", streak: streakCount },
      },
      trigger: null,
    });
  } catch (_) {}
};

/**
 * Saves a pending streak celebration to be displayed when the user returns to Home
 */
export const setPendingStreakCelebration = async (streak: number) => {
  const today = getTodayDateKey();
  const data: PendingStreakCelebration = {
    streak: Math.max(streak, 1),
    date: today,
    unlockedAt: Date.now(),
    notified: false,
  };
  await AsyncStorage.setItem(PENDING_STREAK_KEY, JSON.stringify(data));
};

/**
 * Consumes and clears any pending celebration for today.
 */
export const consumePendingStreakCelebration = async (
  forceCheckCompletedToday = false
): Promise<{ shouldShow: boolean; streak: number }> => {
  try {
    const today = getTodayDateKey();
    const lastCelebrated = await AsyncStorage.getItem(LAST_CELEBRATED_DATE_KEY);

    // 1. Check if there's a stored pending streak for today
    const rawPending = await AsyncStorage.getItem(PENDING_STREAK_KEY);
    if (rawPending) {
      const parsed: PendingStreakCelebration = JSON.parse(rawPending);
      if (parsed.date === today && lastCelebrated !== today) {
        await AsyncStorage.setItem(LAST_CELEBRATED_DATE_KEY, today);
        await AsyncStorage.removeItem(PENDING_STREAK_KEY);
        return { shouldShow: true, streak: parsed.streak > 0 ? parsed.streak : 1 };
      }
    }

    // 2. Fallback: If streak completed today on server/local state but never celebrated today
    if (forceCheckCompletedToday && lastCelebrated !== today) {
      const normalized = normalizeStreakState(globalStreakState);
      if (
        normalized.isCompletedToday &&
        normalized.currentStreak > 0 &&
        normalized.lastCompletedDate === today
      ) {
        await AsyncStorage.setItem(LAST_CELEBRATED_DATE_KEY, today);
        await AsyncStorage.removeItem(PENDING_STREAK_KEY);
        return { shouldShow: true, streak: normalized.currentStreak };
      }
    }
  } catch (_) {}
  return { shouldShow: false, streak: 0 };
};

// Global AppState listener to send notification if user exits without seeing celebration modal
AppState.addEventListener("change", async (nextState: AppStateStatus) => {
  if (nextState.match(/inactive|background/)) {
    try {
      const today = getTodayDateKey();
      const rawPending = await AsyncStorage.getItem(PENDING_STREAK_KEY);
      if (rawPending) {
        const parsed: PendingStreakCelebration = JSON.parse(rawPending);
        if (parsed.date === today && !parsed.notified) {
          parsed.notified = true;
          await AsyncStorage.setItem(PENDING_STREAK_KEY, JSON.stringify(parsed));
          await sendStreakUnlockedNotification(parsed.streak);
        }
      }
    } catch (_) {}
  }
});

// Backward-compatible updateStreak
export const updateStreak = async (userId?: string) => {
  const key = getStreakKey(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : { streak: 1, lastDate: getTodayDateKey() };
    return { isUpdated: true, update: parsed };
  } catch {
    return { isUpdated: false };
  }
};

export const useStreak = (explicitUserId?: string) => {
  let contextUser: any = null;
  try {
    const ctx = useUser();
    contextUser = ctx?.user;
  } catch {}

  const activeUserId = explicitUserId || contextUser?._id || contextUser?.userId;

  const [state, setState] = useState<StreakState>(() => {
    if (globalStreakState.currentStreak > 0) {
      return normalizeStreakState(globalStreakState);
    }
    const userStreak = contextUser?.streakData?.currentStreak ?? (contextUser as any)?.streak;
    if (typeof userStreak === "number" && userStreak > 0) {
      const init = normalizeStreakState({
        ...globalStreakState,
        currentStreak: userStreak,
        lastCompletedDate: contextUser?.streakData?.lastDate || contextUser?.streakData?.lastCompletedDate,
      });
      globalStreakState = init;
      return init;
    }
    return normalizeStreakState(globalStreakState);
  });
  const [loading, setLoading] = useState(true);
  const [celebrationVisible, setCelebrationVisible] = useState(false);

  // Sync state whenever global state changes across the app
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("STREAK_STATE_CHANGED", (newState: StreakState) => {
      setState(normalizeStreakState(newState));
    });
    const unlockSub = DeviceEventEmitter.addListener(STREAK_UNLOCKED_EVENT, (unlockedData: any) => {
      // If deferred (i.e. unlocked while active in reader/player), do not interrupt inline
      if (unlockedData?.currentStreak !== undefined && !unlockedData?.deferred) {
        setCelebrationVisible(true);
      }
    });

    return () => {
      sub.remove();
      unlockSub.remove();
    };
  }, []);

  const refreshStreak = useCallback(async (): Promise<StreakState> => {
    if (inFlightStreakPromise) {
      const existing = await inFlightStreakPromise;
      if (existing) return existing;
    }

    inFlightStreakPromise = (async () => {
      try {
        const key = getStreakKey(activeUserId);

        // 1. Load local cache first and normalize against today's date
        let cached = await AsyncStorage.getItem(key);
        if (!cached && key !== STREAK_STORAGE_KEY) {
          cached = await AsyncStorage.getItem(STREAK_STORAGE_KEY);
        }
        let localState: StreakState = globalStreakState;
        if (cached) {
          const parsed = JSON.parse(cached);
          localState = normalizeStreakState(parsed);
          globalStreakState = localState;
          setState(localState);
        } else if (contextUser?.streakData) {
          localState = normalizeStreakState(contextUser.streakData);
          globalStreakState = localState;
          setState(localState);
        }

        // 2. If we accumulated pending offline seconds, attempt to flush them to the server
        try {
          const pendingRaw = await AsyncStorage.getItem(OFFLINE_PENDING_SECONDS_KEY);
          const pendingSec = Number(pendingRaw) || 0;
          if (pendingSec > 0) {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
            const syncRes = await api.post(
              "/streak",
              { secondsAdded: pendingSec, timezone: tz },
              { timeout: 6000 }
            );
            if (syncRes?.data?.success) {
              await AsyncStorage.removeItem(OFFLINE_PENDING_SECONDS_KEY);
            }
          }
        } catch {}

        // 3. Fetch fresh status from server (works when online, gracefully falls back when offline)
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
        const res = await api.get(`/streak?timezone=${encodeURIComponent(tz)}`, { timeout: 6000 });

        if (res?.data?.success && res.data.streak) {
          const s = res.data.streak;
          // Reconcile: Server data must never downgrade verified local progress!
          const reconciled: StreakState = normalizeStreakState({
            currentStreak: Math.max(localState.currentStreak, s.currentStreak ?? 0, globalStreakState.currentStreak),
            longestStreak: Math.max(localState.longestStreak, s.longestStreak ?? 0, localState.currentStreak, globalStreakState.longestStreak),
            todayReadingSeconds: Math.max(localState.todayReadingSeconds, s.todayReadingSeconds ?? 0, globalStreakState.todayReadingSeconds),
            targetSeconds: DAILY_TARGET_SECONDS,
            isCompletedToday: localState.isCompletedToday || Boolean(s.isCompletedToday) || globalStreakState.isCompletedToday,
            lastCompletedDate: (localState.isCompletedToday || globalStreakState.isCompletedToday)
              ? getTodayDateKey()
              : (s.lastCompletedDate || localState.lastCompletedDate || globalStreakState.lastCompletedDate),
            lastActiveDate: getTodayDateKey(),
          });

          globalStreakState = reconciled;
          setState(reconciled);
          await AsyncStorage.setItem(key, JSON.stringify(reconciled));
          DeviceEventEmitter.emit("STREAK_STATE_CHANGED", reconciled);
          return reconciled;
        }
      } catch (error) {
        // Offline / network failure -> local state remains source of truth
      } finally {
        inFlightStreakPromise = null;
        setLoading(false);
      }
      return globalStreakState;
    })();

    return inFlightStreakPromise;
  }, [activeUserId, contextUser?.streakData]);

  /**
   * Called by Reader or Audio Player to record verified reading seconds
   */
  const recordReadingSeconds = useCallback(
    async (
      seconds: number,
      options?: { inReader?: boolean }
    ): Promise<boolean> => {
      if (seconds <= 0) return false;

      const today = getTodayDateKey();
      // 1. Normalize baseline without wiping today's reading
      const normalizedBase = normalizeStreakState(globalStreakState);

      const updatedSeconds = normalizedBase.todayReadingSeconds + seconds;
      const willComplete =
        updatedSeconds >= normalizedBase.targetSeconds && !normalizedBase.isCompletedToday;

      let newStreak = normalizedBase.currentStreak;
      let newCompletedDate = normalizedBase.lastCompletedDate;

      if (willComplete) {
        const diffDays = getCalendarDayDifference(today, normalizedBase.lastCompletedDate);
        if (diffDays === 1) {
          // Completed yesterday -> increment streak!
          newStreak = (normalizedBase.currentStreak || 0) + 1;
        } else if (diffDays === 0) {
          // Already completed today -> keep streak at least 1
          newStreak = Math.max(normalizedBase.currentStreak, 1);
        } else {
          // Starting fresh or after break -> Day 1!
          newStreak = 1;
        }
        newCompletedDate = today;
      }

      const optimisticState: StreakState = {
        currentStreak: newStreak,
        longestStreak: Math.max(normalizedBase.longestStreak, newStreak),
        todayReadingSeconds: updatedSeconds,
        targetSeconds: DAILY_TARGET_SECONDS,
        isCompletedToday: willComplete ? true : normalizedBase.isCompletedToday,
        lastCompletedDate: willComplete ? newCompletedDate : normalizedBase.lastCompletedDate,
        lastActiveDate: today,
      };

      globalStreakState = optimisticState;
      setState(optimisticState);
      const key = getStreakKey(activeUserId);
      await AsyncStorage.setItem(key, JSON.stringify(optimisticState));
      DeviceEventEmitter.emit("STREAK_STATE_CHANGED", optimisticState);

      if (willComplete) {
        await setPendingStreakCelebration(optimisticState.currentStreak);
        if (!options?.inReader) {
          setCelebrationVisible(true);
        }
        DeviceEventEmitter.emit(STREAK_UNLOCKED_EVENT, {
          currentStreak: optimisticState.currentStreak,
          deferred: !!options?.inReader,
        });
      }

      // Offline-resilient sync: include any accumulated pending offline seconds
      let pendingToSync = seconds;
      try {
        const storedPending = await AsyncStorage.getItem(OFFLINE_PENDING_SECONDS_KEY);
        if (storedPending) {
          pendingToSync += Number(storedPending) || 0;
        }
      } catch {}

      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
        const res = await api.post(
          "/streak",
          { secondsAdded: pendingToSync, timezone: tz },
          { timeout: 6000 }
        );

        if (res?.data?.success) {
          // Sync succeeded -> clear pending queue
          await AsyncStorage.removeItem(OFFLINE_PENDING_SECONDS_KEY);

          if (res.data.streak) {
            const serverStreak = res.data.streak;
            const mergedState: StreakState = normalizeStreakState({
              currentStreak: Math.max(optimisticState.currentStreak, serverStreak.currentStreak ?? 0),
              longestStreak: Math.max(optimisticState.longestStreak, serverStreak.longestStreak ?? 0),
              todayReadingSeconds: Math.max(optimisticState.todayReadingSeconds, serverStreak.todayReadingSeconds ?? 0),
              targetSeconds: DAILY_TARGET_SECONDS,
              isCompletedToday: optimisticState.isCompletedToday || Boolean(serverStreak.isCompletedToday),
              lastCompletedDate: optimisticState.isCompletedToday
                ? today
                : (serverStreak.lastCompletedDate || optimisticState.lastCompletedDate),
              lastActiveDate: today,
            });

            globalStreakState = mergedState;
            setState(mergedState);
            await AsyncStorage.setItem(key, JSON.stringify(mergedState));
            DeviceEventEmitter.emit("STREAK_STATE_CHANGED", mergedState);
          }
        } else {
          // Server returned failure: preserve seconds in offline queue
          await AsyncStorage.setItem(OFFLINE_PENDING_SECONDS_KEY, String(pendingToSync));
        }
      } catch (err) {
        // Offline / network failure: safely queue seconds to sync on next connection
        await AsyncStorage.setItem(OFFLINE_PENDING_SECONDS_KEY, String(pendingToSync)).catch(() => {});
      }

      return willComplete;
    },
    [activeUserId]
  );

  useEffect(() => {
    refreshStreak();
  }, [refreshStreak]);

  const dismissCelebration = useCallback(() => {
    setCelebrationVisible(false);
  }, []);

  return {
    streak: state.currentStreak,
    longestStreak: state.longestStreak,
    todayReadingSeconds: state.todayReadingSeconds,
    targetSeconds: state.targetSeconds,
    isCompletedToday: state.isCompletedToday,
    loading,
    refreshStreak,
    recordReadingSeconds,
    celebrationVisible,
    dismissCelebration,
  };
};

export default useStreak;
