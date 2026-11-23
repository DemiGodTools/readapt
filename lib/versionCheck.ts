import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { ROOT_API_BASE, LOCAL_API_BASE } from "./api";

export interface VersionInfo {
  forceUpdate: boolean;
  minVersion: string;
  latestVersion: string;
  storeUrl: string;
  title: string;
  message: string;
  releaseNotes?: string[];
}

export const APP_CURRENT_VERSION = Constants.expoConfig?.version || "1.0.0";

// Smart client-side throttle interval: 4 hours (in ms)
export const VERSION_CHECK_THROTTLE_MS = 4 * 60 * 60 * 1000;

const STORAGE_KEY_LAST_CHECK = "@readapt_last_version_check_time";
const STORAGE_KEY_CACHED_RESULT = "@readapt_last_version_check_result";

/**
 * Returns true if current is strictly older than target.
 * e.g. isVersionOlder("1.0.0", "1.1.0") -> true
 *      isVersionOlder("1.1.0", "1.0.0") -> false
 *      isVersionOlder("1.0.0", "1.0.0") -> false
 */
export function isVersionOlder(current: string, target: string): boolean {
  try {
    const parse = (v: string) =>
      v
        .replace(/[^0-9.]/g, "")
        .split(".")
        .map((p) => parseInt(p, 10) || 0);

    const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
    const [tMaj = 0, tMin = 0, tPat = 0] = parse(target);

    if (cMaj !== tMaj) return cMaj < tMaj;
    if (cMin !== tMin) return cMin < tMin;
    return cPat < tPat;
  } catch {
    return false;
  }
}

/**
 * Checks server for minimum supported app version.
 * - Client-side throttled to 1 network request every 4 hours.
 * - Pass forceRefresh = true to bypass the cache/throttle (e.g. pull-to-refresh or explicit user action).
 * - Fast, stateless, 6-second timeout (never hangs if network is slow).
 */
export async function checkAppVersion(forceRefresh: boolean = false): Promise<{
  shouldForceUpdate: boolean;
  versionInfo: VersionInfo | null;
}> {
  try {
    const now = Date.now();

    // 1. If not forcing refresh and in production, check local throttled timestamp
    // In __DEV__ mode, throttle is bypassed so testing is instant on reload
    if (!forceRefresh && !__DEV__) {
      try {
        const lastCheckRaw = await AsyncStorage.getItem(STORAGE_KEY_LAST_CHECK);
        if (lastCheckRaw) {
          const lastCheckTime = parseInt(lastCheckRaw, 10);
          if (Number.isFinite(lastCheckTime) && now - lastCheckTime < VERSION_CHECK_THROTTLE_MS) {
            // Within throttle window: return cached result if exists
            const cachedResultRaw = await AsyncStorage.getItem(STORAGE_KEY_CACHED_RESULT);
            if (cachedResultRaw) {
              const parsed = JSON.parse(cachedResultRaw);
              return {
                shouldForceUpdate: Boolean(parsed.shouldForceUpdate),
                versionInfo: parsed.versionInfo || null,
              };
            }
            // If cached check was clean and no update was needed:
            return {
              shouldForceUpdate: false,
              versionInfo: null,
            };
          }
        }
      } catch (storageErr) {
        // Continue to network fetch if local storage read fails
      }
    }

    // 2. Fetch fresh version info from server
    // In DEV, if ROOT_API_BASE (e.g. un-deployed Vercel) fails, fallback to LOCAL_API_BASE
    let res: any = null;
    try {
      const endpoint = `${ROOT_API_BASE}/system/version?_t=${now}`;
      res = await axios.get<VersionInfo>(endpoint, { timeout: 4000 });
    } catch (primaryErr) {
      if (__DEV__ && LOCAL_API_BASE) {
        try {
          const localEndpoint = `${LOCAL_API_BASE}/system/version?_t=${now}`;
          res = await axios.get<VersionInfo>(localEndpoint, { timeout: 4000 });
        } catch (_) {}
      }
      if (!res) throw primaryErr;
    }

    if (res.data) {
      const data = res.data;
      const isOlder = isVersionOlder(APP_CURRENT_VERSION, data.minVersion || "1.0.0");
      const shouldForce = Boolean(data.forceUpdate || isOlder);

      const result = {
        shouldForceUpdate: shouldForce,
        versionInfo: data,
      };

      // 3. Persist check time & result to AsyncStorage for throttling
      try {
        await AsyncStorage.setItem(STORAGE_KEY_LAST_CHECK, String(now));
        await AsyncStorage.setItem(STORAGE_KEY_CACHED_RESULT, JSON.stringify(result));
      } catch (_) {}

      return result;
    }
  } catch {
    // Network offline or error: check if we had a previously detected force update
    try {
      const cachedResultRaw = await AsyncStorage.getItem(STORAGE_KEY_CACHED_RESULT);
      if (cachedResultRaw) {
        const parsed = JSON.parse(cachedResultRaw);
        if (parsed.shouldForceUpdate) {
          return {
            shouldForceUpdate: true,
            versionInfo: parsed.versionInfo || null,
          };
        }
      }
    } catch (_) {}
  }

  return {
    shouldForceUpdate: false,
    versionInfo: null,
  };
}

/**
 * Resets local version check throttle (useful for testing or developer settings).
 */
export async function clearVersionCheckThrottle(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([STORAGE_KEY_LAST_CHECK, STORAGE_KEY_CACHED_RESULT]);
  } catch (_) {}
}
