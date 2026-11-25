import {
  getAnalytics,
  logEvent,
  logScreenView,
  setUserId,
  setUserProperties,
} from "@react-native-firebase/analytics";
import {
  getCrashlytics,
  log as crashlyticsLog,
  recordError as crashlyticsRecordError,
  setUserId as crashlyticsSetUserId,
} from "@react-native-firebase/crashlytics";

/**
 * Safe wrapper around Firebase Analytics screen view tracking.
 * Never throws if native module is unavailable (e.g. Expo Go).
 */
export async function trackScreenView(screenName: string, screenClass?: string) {
  try {
    if (!screenName) return;
    const analyticsInstance = getAnalytics();
    await logScreenView(analyticsInstance, {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  } catch {
    // Non-fatal in dev/Expo Go
  }
}

/**
 * Logs a custom event to Google Analytics / Firebase Analytics.
 */
export async function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  try {
    if (!eventName) return;
    // Firebase event names must be <= 40 chars, alphanumeric + underscore
    const safeName = eventName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
    const analyticsInstance = getAnalytics();
    await logEvent(analyticsInstance, safeName as any, params);
  } catch {
    // Non-fatal
  }
}

/**
 * Identifies the logged-in user in Analytics & Crashlytics.
 */
export async function setAnalyticsUser(
  user: {
    _id?: string;
    userId?: string;
    subscription?: { plan?: number };
    profileLevel?: number;
  } | null
) {
  try {
    const analyticsInstance = getAnalytics();
    const crashlyticsInstance = getCrashlytics();

    if (!user?._id) {
      await setUserId(analyticsInstance, null);
      return;
    }

    const uid = String(user._id);
    await Promise.all([
      setUserId(analyticsInstance, uid),
      setUserProperties(analyticsInstance, {
        plan_tier: String(user.subscription?.plan ?? 0),
        profile_level: String(user.profileLevel ?? 1),
      }),
      crashlyticsSetUserId(crashlyticsInstance, uid),
    ]);
  } catch {
    // Non-fatal
  }
}

/**
 * Records a non-fatal error to Firebase Crashlytics for remote debugging.
 */
export function recordCrashlyticsError(error: unknown, context?: string) {
  try {
    const crashlyticsInstance = getCrashlytics();
    if (context) {
      crashlyticsLog(crashlyticsInstance, context);
    }
    if (error instanceof Error) {
      crashlyticsRecordError(crashlyticsInstance, error);
    } else {
      crashlyticsRecordError(crashlyticsInstance, new Error(String(error)));
    }
  } catch {
    // Non-fatal
  }
}
