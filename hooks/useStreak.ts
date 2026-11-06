import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useUser } from "./useUser";

export const getStreakKey = (userId?: string): string => {
  return userId ? `streak_${userId}` : "streak_guest";
};

export const updateStreak = async (userId?: string) => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const key = getStreakKey(userId);

  const rawData = await AsyncStorage.getItem(key);

  if (!rawData) {
    const newStreakData = { streak: 1, lastDate: todayStr };
    await AsyncStorage.setItem(key, JSON.stringify(newStreakData));
    return { isUpdated: true, update: newStreakData };
  }

  try {
    const { streak, lastDate } = JSON.parse(rawData);

    const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const [year, month, day] = lastDate.split("-").map(Number);
    const lastMs = Date.UTC(year, month - 1, day);

    const diffInDays = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return { streak, lastDate, update: { streak, lastDate } };
    }

    const newStreak: number = diffInDays === 1 ? streak + 1 : 1;
    const updatedData: { streak: number; lastDate: string } = {
      streak: newStreak,
      lastDate: todayStr,
    };

    await AsyncStorage.setItem(key, JSON.stringify(updatedData));
    return { isUpdated: diffInDays === 1, update: updatedData };
  } catch (err) {
    const fallback = { streak: 1, lastDate: todayStr };
    await AsyncStorage.setItem(key, JSON.stringify(fallback));
    return { isUpdated: true, update: fallback };
  }
};

export const useStreak = (explicitUserId?: string) => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  let contextUser: any = null;
  try {
    const ctx = useUser();
    contextUser = ctx?.user;
  } catch {}

  const activeUserId = explicitUserId || contextUser?._id || contextUser?.userId;

  const [streakData, setStreakData] = useState({
    streak: contextUser?.correctAnsStreak || 0,
    lastDate: todayStr,
  });
  const [loading, setLoading] = useState(true);

  const refreshStreak = useCallback(async () => {
    setLoading(true);
    try {
      const key = getStreakKey(activeUserId);
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setStreakData(parsed);
      } else if (contextUser?.correctAnsStreak) {
        setStreakData({
          streak: contextUser.correctAnsStreak,
          lastDate: todayStr,
        });
      } else {
        setStreakData({ streak: 0, lastDate: todayStr });
      }
    } catch (error) {
      console.error("Failed to update streak:", error);
    } finally {
      setLoading(false);
    }
  }, [activeUserId, contextUser?.correctAnsStreak, todayStr]);

  useEffect(() => {
    refreshStreak();
  }, [refreshStreak]);

  return {
    streak: streakData.streak,
    lastDate: streakData.lastDate,
    loading,
    refreshStreak,
  };
};

export default useStreak;
