import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

export const LOCAL_API_BASE = "http://10.192.52.142:3000/api";
export const PROD_API_BASE = "https://redapt-admin.vercel.app/api";

/**
 * API root used by the app.
 *
 * Defaults to the hosted deployment so a freshly built APK (dev client or
 * EAS internal build) works anywhere, not only on the Wi-Fi where the local
 * admin server happens to be running. Until now every request first burned a
 * 15s timeout on the unreachable LAN IP before falling back.
 *
 * To develop against the local admin server, override it at bundle time:
 *   EXPO_PUBLIC_API_ROOT=http://10.192.52.142:3000/api npx expo start --dev-client
 * or put the same line in `.env` (EAS builds pick it up too).
 */
const configuredApiRoot = process.env.EXPO_PUBLIC_API_ROOT?.trim();

export const ROOT_API_BASE = configuredApiRoot
  ? configuredApiRoot.replace(/\/+$/, "")
  : PROD_API_BASE;
export const USER_API_BASE = `${ROOT_API_BASE}/user`;
export const WEB_PORTAL_BASE = ROOT_API_BASE.replace(/\/api$/, "");

export const getAccountDeletionUrl = (token?: string, email?: string) => {
  const base = `${WEB_PORTAL_BASE}/delete-account`;
  const params: string[] = [];
  if (token) params.push(`token=${encodeURIComponent(token)}`);
  if (email) params.push(`email=${encodeURIComponent(email)}`);
  return params.length > 0 ? `${base}?${params.join("&")}` : base;
};

export const api = axios.create({
  baseURL: USER_API_BASE,
  timeout: 15000,
});

let isConnected = true;
let showToast: ((message: string) => void) | null = null;

export const configureApiInterceptor = (
  networkStatus: boolean,
  toastFn: (message: string) => void
) => {
  isConnected = networkStatus;
  showToast = toastFn;
};

api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase();

  if (!isConnected && method !== "get") {
    if (showToast) {
      showToast("You are offline. Action cannot be completed.");
    }
    return Promise.reject(new axios.Cancel("Offline request blocked."));
  }

  try {
    const existingAuth = config.headers.Authorization || config.headers.authorization;
    const isAuthInvalid =
      !existingAuth ||
      typeof existingAuth !== "string" ||
      !existingAuth.replace("Bearer", "").trim() ||
      existingAuth.includes("undefined") ||
      existingAuth.includes("null");

    if (isAuthInvalid) {
      let rawToken: string | null = null;
      const stored = await SecureStore.getItemAsync("accessToken");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          rawToken = parsed?.token || (typeof parsed === "string" ? parsed : null);
        } catch {
          rawToken = stored;
        }
      }

      if (!rawToken) {
        const asyncStored = await AsyncStorage.getItem("accessToken");
        if (asyncStored) {
          try {
            const parsed = JSON.parse(asyncStored);
            rawToken = parsed?.token || (typeof parsed === "string" ? parsed : null);
          } catch {
            rawToken = asyncStored;
          }
        }
      }

      if (rawToken && typeof rawToken === "string") {
        const cleanToken = rawToken.trim();
        if (cleanToken && cleanToken !== "undefined" && cleanToken !== "null") {
          config.headers.Authorization = `Bearer ${cleanToken}`;
        } else {
          delete config.headers.Authorization;
          delete config.headers.authorization;
        }
      } else {
        delete config.headers.Authorization;
        delete config.headers.authorization;
      }
    }
  } catch (err) {}

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    // Auto-fallback from local dev server to production URL if local server is unreachable
    if (
      originalRequest &&
      !originalRequest._retryWithFallback &&
      (error.message === "Network Error" || error.code === "ERR_NETWORK" || error.code === "ECONNABORTED")
    ) {
      const currentUrl = originalRequest.baseURL || originalRequest.url || "";
      if (currentUrl.includes("10.192.52.142")) {
        originalRequest._retryWithFallback = true;
        originalRequest.baseURL = (originalRequest.baseURL || "").replace(
          LOCAL_API_BASE,
          PROD_API_BASE
        );
        if (originalRequest.url && originalRequest.url.includes("10.192.52.142")) {
          originalRequest.url = originalRequest.url.replace(
            LOCAL_API_BASE,
            PROD_API_BASE
          );
        }
        try {
          return await axios(originalRequest);
        } catch (fallbackError) {
          return Promise.reject(fallbackError);
        }
      }
    }

    if (error?.response?.status === 401) {
      const msg = (error.response?.data?.message || "").toString().toLowerCase();
      const reqUrl = (error.config?.url || "").toString().toLowerCase();
      const isAuthSpecific = reqUrl.includes("/auth/") || reqUrl.includes("/get-self");
      if (isAuthSpecific && (msg.includes("invalid") || msg.includes("expired") || msg.includes("unauthorized"))) {
        try {
          await SecureStore.deleteItemAsync("accessToken").catch(() => {});
          await AsyncStorage.removeItem("accessToken").catch(() => {});
        } catch {}
      }
    }
    return Promise.reject(error);
  }
);