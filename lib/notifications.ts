import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { navigationRef } from "../components/nav/MainNavigation";
import { api, LOCAL_API_BASE } from "./api";

// Configure how notifications appear when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Initializes push notification channels (Android), requests user permission,
 * obtains the device or Expo push token, and registers it with the backend server.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  try {
    // 1. Android Notification Channel setup
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "General Notifications",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#00D2B4",
        sound: "default",
      });
    }

    // 2. Permission check
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[Push Notification] Permission not granted:", finalStatus);
      return null;
    }

    // 3. Obtain push token
    // A. First try device token (Native FCM on custom/standalone Android builds)
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      if (tokenData && tokenData.data) {
        token = tokenData.data;
      }
    } catch {
      // Ignore and fall back to Expo push token
    }

    // B. If no device token, get Expo Push Token with EAS Project ID
    if (!token) {
      try {
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          (Constants as any)?.easConfig?.projectId ??
          "f2458f02-daa4-4530-b07f-f50ded63331a";

        const expoTokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        if (expoTokenData && expoTokenData.data) {
          token = expoTokenData.data;
        }
      } catch (expoErr) {
        console.warn("[Push Notification] Failed to get Expo push token:", expoErr);
      }
    }

    if (token) {
      console.log("[Push Notification] Push Token obtained:", token);

      // 4. Register token with backend:
      // Try production API first, and if that fails (e.g. not yet deployed), try local LAN API
      let registered = false;
      try {
        await api.post("/push-token", {
          token,
          platform: Platform.OS,
        });
        registered = true;
        console.log("[Push Notification] Registered with primary backend");
      } catch (primErr) {
        console.warn("[Push Notification] Primary registration error, trying local LAN fallback...");
      }

      if (!registered) {
        try {
          const localUrl = `${LOCAL_API_BASE}/user/push-token`;
          await fetch(localUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, platform: Platform.OS }),
          });
          console.log("[Push Notification] Successfully registered with local LAN server");
        } catch (localErr) {
          console.warn("[Push Notification] Could not register with local LAN server either:", localErr);
        }
      }
    }
  } catch (err) {
    console.warn("[Push Notification] Registration skipped:", err);
  }

  return token;
}

/**
 * Triggers an immediate local test notification on the device.
 * Useful to verify sound, vibration, banner, and tap navigation instantly on phone.
 */
export async function triggerLocalTestNotification(
  title = "⚡ READAPT Live Notification Test",
  body = "Push notifications are working smoothly on your device!",
  targetScreen = "Tabs"
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { targetScreen },
        sound: "default",
      },
      trigger: null, // triggers immediately
    });
    return true;
  } catch (err) {
    console.error("Failed to trigger local notification:", err);
    return false;
  }
}

/**
 * Handles incoming notification response (when user taps on notification in notification bar).
 */
export function handleNotificationTap(response: Notifications.NotificationResponse) {
  try {
    const data = response?.notification?.request?.content?.data;
    if (!data || !navigationRef.isReady()) return;

    const nav = navigationRef as any;
    const target = data.targetScreen || data.screen;

    if (target === "DailyRewards") {
      nav.navigate("DailyRewards");
    } else if (target === "Subscription") {
      nav.navigate("Subscription");
    } else if (target === "Series" || target === "AllSeries") {
      nav.navigate("AllSeries");
    } else if (target === "Profile") {
      nav.navigate("Tabs");
    } else if (data.seriesId) {
      nav.navigate("SeriesOverview", { seriesId: data.seriesId });
    } else if (data.bookId) {
      nav.navigate("ReadBook", { bookId: data.bookId });
    } else {
      nav.navigate("Tabs");
    }
  } catch (err) {
    console.warn("Failed to handle notification tap:", err);
  }
}

/**
 * Subscribes to notification listeners and returns cleanup function.
 */
export function setupNotificationListeners(): () => void {
  const responseListener =
    Notifications.addNotificationResponseReceivedListener(handleNotificationTap);

  return () => {
    responseListener.remove();
  };
}
