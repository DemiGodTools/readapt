import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter, AppState, AppStateStatus } from "react-native";
import { api } from "../lib/api";
import { useUser } from "./useUser";

export const STREAK_STORAGE_KEY = "readapt_user_streak_data";
export const STREAK_UNLOCKED_EVENT = "READAPT_STREAK_UNLOCKED";
export const PENDING_STREAK_KEY = "readapt_pending_streak_celebration";
export const LAST_CELEBRATED_DATE_KEY = "readapt_last_celebrated_streak_date";
export const OFFLINE_PENDING_SECONDS_KEY = "readapt_offline_pending_streak_seconds";
export const DAILY_TARGET_SECONDS = 240; // 4 minutes daily reading / listening bucket

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
 * Normalizes streak state against the current calendar date:
 * 1. Resets todayReadingSeconds to 0 whenever a new calendar day begins.
 * 2. Degrades streak to 0 if the user missed yesterday (gap >= 2 days or no previous completion).
 * 3. Keeps streak alive if yesterday was completed (gap === 1).
 * 4. Preserves active streak if today is already completed (gap === 0).
 * 5. If today's reading bucket reaches target (>= 240s), marks today as completed and updates streak.
 */
export const normalizeStreakState = (rawState?: Partial<StreakState> | null): StreakState => {
  const today = getTodayDateKey();
  const rawCompletedDate = typeof rawState?.lastCompletedDate === "string"
    ? rawState.lastCompletedDate
    : typeof (rawState as any)?.lastDate === "string"
    ? (rawState as any).lastDate
    : "";
  const lastCompletedDate = rawCompletedDate.split("T")[0].trim();

  const recordedDate = (
    rawState?.lastActiveDate ||
    (rawState as any)?.todayDate ||
    ""
  ).split("T")[0].trim();

  const isSameCalendarDay = recordedDate === today;

  // Reading bucket resets to 0 on a new calendar day
  let todayReadingSeconds = isSameCalendarDay
    ? Math.max(0, Number(rawState?.todayReadingSeconds) || 0)
    : 0;

  const targetSeconds = DAILY_TARGET_SECONDS;
  const rawStreak = Math.max(0, Number(rawState?.currentStreak) || 0);
  let longestStreak = Math.max(rawStreak, Number(rawState?.longestStreak) || 0);

  let currentStreak = 0;
  let isCompletedToday = false;
  let activeCompletedDate = lastCompletedDate;

  if (lastCompletedDate) {
    const diff = getCalendarDayDifference(today, lastCompletedDate);
    if (diff === 0) {
      // Completed today!
      isCompletedToday = true;
      currentStreak = Math.max(rawStreak, 1);
    } else if (diff === 1) {
      // Completed yesterday! Streak is healthy and waiting for today's 4 minutes
      isCompletedToday = false;
      currentStreak = rawStreak;
    } else {
      // Gap >= 2 days: Missed yesterday! Streak degrades to 0
      currentStreak = 0;
      isCompletedToday = false;
    }
  } else {
    currentStreak = 0;
    isCompletedToday = false;
  }

  // Check if today's bucket reaches the 4-minute target
  if (todayReadingSeconds >= targetSeconds) {
    if (!isCompletedToday) {
      isCompletedToday = true;
      activeCompletedDate = today;
      const diff = lastCompletedDate ? getCalendarDayDifference(today, lastCompletedDate) : Infinity;
      currentStreak = diff === 1 ? currentStreak + 1 : 1;
    }
  }

  longestStreak = Math.max(longestStreak, currentStreak);

  return {
    currentStreak,
    longestStreak,
    todayReadingSeconds,
    targetSeconds,
    isCompletedToday,
    lastCompletedDate: activeCompletedDate,
    lastActiveDate: today,
  };
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

/**
 * Temporary testing utility: toggles streak between 0 (inactive/degraded) and active (3-day completed)
 */
export const toggleTestStreak = async (userId?: string) => {
  const today = getTodayDateKey();
  const current = normalizeStreakState(globalStreakState);
  const key = getStreakKey(userId);

  if (current.currentStreak > 0 || current.isCompletedToday) {
    // Toggle OFF -> Degraded to 0
    const offState: StreakState = {
      currentStreak: 0,
      longestStreak: current.longestStreak,
      todayReadingSeconds: 0,
      targetSeconds: DAILY_TARGET_SECONDS,
      isCompletedToday: false,
      lastCompletedDate: "",
      lastActiveDate: today,
    };
    globalStreakState = offState;
    await AsyncStorage.setItem(key, JSON.stringify(offState));
    await AsyncStorage.removeItem(PENDING_STREAK_KEY);
    await AsyncStorage.removeItem(LAST_CELEBRATED_DATE_KEY);
    DeviceEventEmitter.emit("STREAK_STATE_CHANGED", offState);
    return offState;
  } else {
    // Toggle ON -> Completed today (3 days streak)
    const newStreak = 3;
    const onState: StreakState = {
      currentStreak: newStreak,
      longestStreak: Math.max(current.longestStreak, newStreak),
      todayReadingSeconds: DAILY_TARGET_SECONDS,
      targetSeconds: DAILY_TARGET_SECONDS,
      isCompletedToday: true,
      lastCompletedDate: today,
      lastActiveDate: today,
    };
    globalStreakState = onState;
    await AsyncStorage.setItem(key, JSON.stringify(onState));
    await setPendingStreakCelebration(newStreak);
    DeviceEventEmitter.emit("STREAK_STATE_CHANGED", onState);
    DeviceEventEmitter.emit(STREAK_UNLOCKED_EVENT, {
      currentStreak: newStreak,
      deferred: false,
    });
    return onState;
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
    if (globalStreakState.lastActiveDate === getTodayDateKey()) {
      return normalizeStreakState(globalStreakState);
    }
    const userStreak = contextUser?.streakData?.currentStreak ?? (contextUser as any)?.streak;
    if (typeof userStreak === "number") {
      const init = normalizeStreakState({
        ...globalStreakState,
        currentStreak: userStreak,
        lastCompletedDate: contextUser?.streakData?.lastDate || contextUser?.streakData?.lastCompletedDate,
        lastActiveDate: contextUser?.streakData?.lastActiveDate,
        todayReadingSeconds: contextUser?.streakData?.todayReadingSeconds,
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
      if (unlockedData?.currentStreak !== undefined && !unlockedData?.deferred) {
        setCelebrationVisible(true);
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  const refreshStreak = useCallback(async (): Promise<StreakState> => {
    if (inFlightStreakPromise) {
      const existing = await inFlightStreakPromise;
      if (existing) return existing;
    }

    inFlightStreakPromise = (async () => {
      const today = getTodayDateKey();
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
        } else {
          localState = normalizeStreakState(globalStreakState);
          globalStreakState = localState;
          setState(localState);
        }

        // 2. Flush pending offline seconds if any
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

        // 3. Fetch fresh status from server
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
        const res = await api.get(`/streak?timezone=${encodeURIComponent(tz)}`, { timeout: 6000 });

        if (res?.data?.success && res.data.streak) {
          const s = res.data.streak;
          const serverNormalized = normalizeStreakState({
            currentStreak: s.currentStreak,
            longestStreak: s.longestStreak,
            todayReadingSeconds: s.todayReadingSeconds,
            lastCompletedDate: s.lastCompletedDate || s.lastDate,
            lastActiveDate: s.lastActiveDate,
            isCompletedToday: s.isCompletedToday,
          });

          // Reconcile server and local:
          let reconciledStreak = 0;
          let reconciledCompletedToday = false;
          let reconciledLastCompleted = "";

          if (localState.isCompletedToday || serverNormalized.isCompletedToday) {
            reconciledCompletedToday = true;
            reconciledLastCompleted = today;
            reconciledStreak = Math.max(localState.currentStreak, serverNormalized.currentStreak, 1);
          } else {
            // Neither completed today yet. Check if yesterday was completed:
            const diffLocal = localState.lastCompletedDate
              ? getCalendarDayDifference(today, localState.lastCompletedDate)
              : Infinity;
            const diffServer = serverNormalized.lastCompletedDate
              ? getCalendarDayDifference(today, serverNormalized.lastCompletedDate)
              : Infinity;

            if (diffLocal === 1 || diffServer === 1) {
              // Yesterday was completed -> streak is alive and waiting for today's 4 minutes
              reconciledStreak = Math.max(
                diffLocal === 1 ? localState.currentStreak : 0,
                diffServer === 1 ? serverNormalized.currentStreak : 0
              );
              reconciledLastCompleted = diffLocal === 1 ? localState.lastCompletedDate : serverNormalized.lastCompletedDate;
            } else {
              // Missed yesterday (diff >= 2) -> STREAK IS ZERO!
              reconciledStreak = 0;
              reconciledLastCompleted = localState.lastCompletedDate || serverNormalized.lastCompletedDate;
            }
            reconciledCompletedToday = false;
          }

          const reconciledSeconds = Math.max(
            localState.todayReadingSeconds,
            serverNormalized.todayReadingSeconds
          );

          // Check if today's reading already finished target
          if (reconciledSeconds >= DAILY_TARGET_SECONDS && !reconciledCompletedToday) {
            reconciledCompletedToday = true;
            reconciledLastCompleted = today;
            reconciledStreak = reconciledStreak > 0 ? reconciledStreak + 1 : 1;
          }

          const reconciled: StreakState = {
            currentStreak: reconciledStreak,
            longestStreak: Math.max(
              localState.longestStreak,
              serverNormalized.longestStreak,
              reconciledStreak
            ),
            todayReadingSeconds: reconciledSeconds,
            targetSeconds: DAILY_TARGET_SECONDS,
            isCompletedToday: reconciledCompletedToday,
            lastCompletedDate: reconciledLastCompleted,
            lastActiveDate: today,
          };

          globalStreakState = reconciled;
          setState(reconciled);
          await AsyncStorage.setItem(key, JSON.stringify(reconciled));
          DeviceEventEmitter.emit("STREAK_STATE_CHANGED", reconciled);
          return reconciled;
        }
      } catch (error) {
        // Offline / network failure -> local normalized state remains source of truth
      } finally {
        inFlightStreakPromise = null;
        setLoading(false);
      }
      return globalStreakState;
    })();

    return inFlightStreakPromise;
  }, [activeUserId, contextUser?.streakData]);

  /**
   * Called by Reader (PDF or Audio) to record reading seconds into today's bucket.
   * Completes streak when bucket reaches 4 minutes (240s).
   */
  const recordReadingSeconds = useCallback(
    async (
      seconds: number,
      options?: { inReader?: boolean }
    ): Promise<boolean> => {
      if (seconds <= 0) return false;

      const today = getTodayDateKey();
      const normalizedBase = normalizeStreakState(globalStreakState);

      const updatedSeconds = normalizedBase.todayReadingSeconds + seconds;
      const willComplete =
        updatedSeconds >= DAILY_TARGET_SECONDS && !normalizedBase.isCompletedToday;

      let newStreak = normalizedBase.currentStreak;
      let newCompletedDate = normalizedBase.lastCompletedDate;

      if (willComplete) {
        const diffDays = normalizedBase.lastCompletedDate
          ? getCalendarDayDifference(today, normalizedBase.lastCompletedDate)
          : Infinity;

        if (diffDays === 1) {
          // Completed yesterday -> increment streak!
          newStreak = (normalizedBase.currentStreak || 0) + 1;
        } else {
          // Fresh streak or recovering after missed day -> start at 1
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

      // Offline-resilient sync: include pending offline seconds
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
          await AsyncStorage.removeItem(OFFLINE_PENDING_SECONDS_KEY);

          if (res.data.streak) {
            const serverStreak = res.data.streak;
            const serverNormalized = normalizeStreakState(serverStreak);

            const mergedState: StreakState = {
              currentStreak: optimisticState.isCompletedToday
                ? optimisticState.currentStreak
                : serverNormalized.currentStreak,
              longestStreak: Math.max(optimisticState.longestStreak, serverNormalized.longestStreak),
              todayReadingSeconds: Math.max(optimisticState.todayReadingSeconds, serverNormalized.todayReadingSeconds),
              targetSeconds: DAILY_TARGET_SECONDS,
              isCompletedToday: optimisticState.isCompletedToday || serverNormalized.isCompletedToday,
              lastCompletedDate: optimisticState.isCompletedToday
                ? today
                : (serverNormalized.lastCompletedDate || optimisticState.lastCompletedDate),
              lastActiveDate: today,
            };

            globalStreakState = mergedState;
            setState(mergedState);
            await AsyncStorage.setItem(key, JSON.stringify(mergedState));
            DeviceEventEmitter.emit("STREAK_STATE_CHANGED", mergedState);
          }
        } else {
          await AsyncStorage.setItem(OFFLINE_PENDING_SECONDS_KEY, String(pendingToSync));
        }
      } catch (err) {
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

  const toggleStreak = useCallback(async () => {
    return await toggleTestStreak(activeUserId);
  }, [activeUserId]);

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
    toggleStreak,
  };
};

export default useStreak;
