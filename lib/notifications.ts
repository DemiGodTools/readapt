import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import notifee, {
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
  EventType,
  Event,
} from "@notifee/react-native";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { navigationRef } from "../components/nav/MainNavigation";
import { api, LOCAL_API_BASE } from "./api";

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND_NOTIFICATION_TASK";

// Configure how notifications appear when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // On Android, Notifee handles rich presentation (ongoing, countdown chronometer, big picture)
    if (Platform.OS === "android") {
      return {
        shouldShowAlert: false, // Suppress default expo banner so Notifee displays the rich notification
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

/**
 * Initializes Android notification channels in Notifee and Expo
 */
export async function setupNotifeeChannels() {
  if (Platform.OS !== "android") return;
  try {
    await notifee.createChannel({
      id: "default",
      name: "General Notifications",
      importance: AndroidImportance.HIGH,
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
      lights: true,
      lightColor: "#00D2B4",
      sound: "default",
    });

    await notifee.createChannel({
      id: "sticky_alerts",
      name: "Urgent & Ongoing Alerts",
      importance: AndroidImportance.HIGH,
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
      lights: true,
      lightColor: "#FF5252",
      sound: "default",
      visibility: AndroidVisibility.PUBLIC,
    });

    await notifee.createChannel({
      id: "countdown_channel",
      name: "Countdowns & Launches",
      importance: AndroidImportance.HIGH,
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
      lights: true,
      lightColor: "#6366F1",
      sound: "default",
      visibility: AndroidVisibility.PUBLIC,
    });
  } catch (err) {
    console.warn("[Notifee] Channel creation error:", err);
  }
}

/**
 * Displays a native notification using Notifee with support for:
 * - Real ticking countdown chronometers (`chronometerDirection: 'down'`)
 * - Non-dismissable / ongoing notifications (`ongoing: true`)
 * - Rich BigPicture imagery
 */
export async function displayNotifeeNotification({
  title,
  body,
  imageUrl,
  countdownTarget,
  isSticky = false,
  targetScreen = "Tabs",
  data = {},
  id,
}: {
  title: string;
  body: string;
  imageUrl?: string;
  countdownTarget?: string | number;
  isSticky?: boolean;
  targetScreen?: string;
  data?: Record<string, any>;
  id?: string;
}): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      await setupNotifeeChannels();
    }

    const hasCountdown = Boolean(
      countdownTarget && Number(countdownTarget) > Date.now()
    );
    const targetTimestamp = hasCountdown ? Number(countdownTarget) : undefined;

    const channelId = hasCountdown
      ? "countdown_channel"
      : isSticky
      ? "sticky_alerts"
      : "default";

    const notificationId = id || `notif_${Date.now()}`;

    const mergedData: Record<string, string> = {
      ...(typeof data === "object" && data !== null ? data : {}),
      targetScreen,
      countdownTarget: countdownTarget ? String(countdownTarget) : "",
      isSticky: isSticky ? "true" : "false",
      imageUrl: imageUrl || "",
    };

    if (Platform.OS === "android") {
      await notifee.displayNotification({
        id: notificationId,
        title,
        body,
        data: mergedData,
        android: {
          channelId,
          importance: AndroidImportance.HIGH,
          ongoing: isSticky,
          autoCancel: !isSticky,
          showChronometer: hasCountdown,
          chronometerDirection: hasCountdown ? "down" : undefined,
          timestamp: targetTimestamp,
          showTimestamp: !hasCountdown,
          color: "#00D2B4",
          style: imageUrl
            ? {
                type: AndroidStyle.BIGPICTURE,
                picture: imageUrl,
              }
            : undefined,
          pressAction: {
            id: "default",
          },
        },
      });
      return notificationId;
    } else {
      // iOS / other fallback via Expo Notifications
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: mergedData,
          sound: "default",
        },
        trigger: null,
      });
      return notificationId;
    }
  } catch (err) {
    console.error("[Notifee] displayNotification error:", err);
    return null;
  }
}

/**
 * Initializes push notification channels (Android), requests user permission,
 * obtains the device or Expo push token, and registers it with the backend server.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  try {
    // 1. Android Notification Channel setup
    if (Platform.OS === "android") {
      await setupNotifeeChannels();

      await Notifications.setNotificationChannelAsync("default", {
        name: "General Notifications",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#00D2B4",
        sound: "default",
      });

      await Notifications.setNotificationChannelAsync("sticky_alerts", {
        name: "Urgent & Ongoing Alerts",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF5252",
        sound: "default",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
 * Triggers an immediate local test notification on the device with Notifee.
 */
export async function triggerLocalTestNotification(
  title = "⚡ READAPT Live Notification Test",
  body = "Push notifications are working smoothly on your device!",
  targetScreen = "Tabs"
) {
  try {
    await displayNotifeeNotification({
      title,
      body,
      targetScreen,
    });
    return true;
  } catch (err) {
    console.error("Failed to trigger local notification:", err);
    return false;
  }
}

/**
 * Handles navigation to specific screen/content from notification data.
 */
export function handleNotificationNavigation(data?: Record<string, any>) {
  try {
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
    } else if (target === "AudioRdr" && data.bookId) {
      nav.navigate("AudioRdr", { bookId: data.bookId });
    } else if (data.seriesId) {
      nav.navigate("SeriesOverview", { seriesId: data.seriesId });
    } else if (data.bookId) {
      nav.navigate("ReadBook", { bookId: data.bookId });
    } else {
      nav.navigate("Tabs");
    }
  } catch (err) {
    console.warn("Failed to handle notification navigation:", err);
  }
}

/**
 * Handles incoming notification response from Expo Notifications.
 */
export function handleNotificationTap(response: Notifications.NotificationResponse) {
  const data = response?.notification?.request?.content?.data;
  handleNotificationNavigation(data);
}

/**
 * Handles incoming Notifee foreground events (e.g. user pressed a notification).
 */
export function handleNotifeeEvent(event: Event) {
  const { type, detail } = event;
  if (type === EventType.PRESS && detail.notification) {
    handleNotificationNavigation(detail.notification.data);
  }
}

/**
 * Subscribes to notification listeners and returns cleanup function.
 */
export function setupNotificationListeners(): () => void {
  // 1. Notifee foreground events (notification pressed / dismissed)
  const unsubscribeNotifee = notifee.onForegroundEvent(handleNotifeeEvent);

  // 2. Expo notification response listener
  const responseListener =
    Notifications.addNotificationResponseReceivedListener(handleNotificationTap);

  // 3. Expo notification received listener (display via Notifee on Android)
  const receivedListener = Notifications.addNotificationReceivedListener(
    async (notification) => {
      if (Platform.OS === "android") {
        const content = notification.request.content;
        const data = (content.data || {}) as Record<string, any>;
        const title = content.title || data.title || "READAPT";
        const body = content.body || data.body || "";
        const imageUrl = (data.image || data.imageUrl) as string | undefined;
        const countdownTarget = data.countdownTarget as string | undefined;
        const isSticky = data.isSticky === "true" || data.isSticky === true;
        const targetScreen = (data.targetScreen || "Tabs") as string;

        await displayNotifeeNotification({
          title,
          body,
          imageUrl,
          countdownTarget,
          isSticky,
          targetScreen,
          data,
        });
      }
    }
  );

  return () => {
    unsubscribeNotifee();
    responseListener.remove();
    receivedListener.remove();
  };
}

// Background notification task definition
TaskManager.defineTask(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn("[BackgroundNotification] Task error:", error);
      return;
    }
    if (data && Platform.OS === "android") {
      try {
        const notifData = (data as any)?.notification?.data || {};
        const notifContent = (data as any)?.notification?.request?.content || {};
        const title = notifContent.title || notifData.title || "READAPT";
        const body = notifContent.body || notifData.body || "";
        const imageUrl = notifData.image || notifData.imageUrl;
        const countdownTarget = notifData.countdownTarget;
        const isSticky =
          notifData.isSticky === "true" || notifData.isSticky === true;
        const targetScreen = notifData.targetScreen || "Tabs";

        if (isSticky || countdownTarget || imageUrl) {
          await displayNotifeeNotification({
            title,
            body,
            imageUrl,
            countdownTarget,
            isSticky,
            targetScreen,
            data: notifData,
          });
        }
      } catch (err) {
        console.warn("[BackgroundNotification] Handler error:", err);
      }
    }
  }
);

try {
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});
} catch {
  // Ignore in environments where background tasks aren't supported
}
