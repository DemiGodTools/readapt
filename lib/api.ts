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
  timeout: 25000,
});

let isConnected = true;
let showToast: ((message: string) => void) | null = null;
let cachedUserEmail: string | null = null;

export const setApiUserEmail = (email?: string | null) => {
  if (email && typeof email === "string" && email.trim()) {
    cachedUserEmail = email.trim();
  } else {
    cachedUserEmail = null;
  }
};

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
    const existingAuth = config.headers?.Authorization || config.headers?.authorization;
    const isAuthInvalid =
      !existingAuth ||
      typeof existingAuth !== "string" ||
      !existingAuth.replace("Bearer", "").trim() ||
      existingAuth.includes("undefined") ||
      existingAuth.includes("null");

    let cleanToken: string | null = null;

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
        cleanToken = rawToken.trim();
        if (cleanToken && cleanToken !== "undefined" && cleanToken !== "null") {
          if (config.headers?.set) {
            config.headers.set("Authorization", `Bearer ${cleanToken}`);
          } else if (config.headers) {
            config.headers.Authorization = `Bearer ${cleanToken}`;
          }
        } else {
          if (config.headers?.delete) {
            config.headers.delete("Authorization");
            config.headers.delete("authorization");
          } else if (config.headers) {
            delete config.headers.Authorization;
            delete config.headers.authorization;
          }
        }
      } else {
        if (config.headers?.delete) {
          config.headers.delete("Authorization");
          config.headers.delete("authorization");
        } else if (config.headers) {
          delete config.headers.Authorization;
          delete config.headers.authorization;
        }
      }
    } else {
      cleanToken = typeof existingAuth === "string" ? existingAuth.replace(/^Bearer\s+/i, "").trim() : null;
    }

    // Attach x-user-email header if missing so both legacy and modern backend endpoints authenticate
    const existingEmailHeader =
      (config.headers?.get && config.headers.get("x-user-email")) ||
      (config.headers && (config.headers["x-user-email"] || config.headers["X-User-Email"]));

    if (!existingEmailHeader) {
      if (!cachedUserEmail && cleanToken && cleanToken.includes(".")) {
        try {
          const payloadPart = cleanToken.split(".")[1];
          if (payloadPart) {
            const b64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
            const decoded = atob(b64);
            const parsedJwt = JSON.parse(decoded);
            if (parsedJwt?.email) cachedUserEmail = String(parsedJwt.email).trim();
            else if (parsedJwt?.user?.email) cachedUserEmail = String(parsedJwt.user.email).trim();
          }
        } catch {}
      }

      if (!cachedUserEmail) {
        try {
          const rawUser = await AsyncStorage.getItem("cached_user_profile");
          if (rawUser) {
            const parsed = JSON.parse(rawUser);
            if (parsed?.email) cachedUserEmail = String(parsed.email).trim();
          }
        } catch {}
      }

      if (cachedUserEmail) {
        if (config.headers?.set) {
          config.headers.set("x-user-email", cachedUserEmail);
        } else if (config.headers) {
          config.headers["x-user-email"] = cachedUserEmail;
        }
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
      if (
        currentUrl.includes("10.192.52.142") ||
        currentUrl.includes("localhost") ||
        currentUrl.includes("127.0.0.1") ||
        currentUrl.includes("10.0.2.2")
      ) {
        originalRequest._retryWithFallback = true;
        originalRequest.baseURL = PROD_API_BASE + (originalRequest.baseURL?.endsWith("/user") ? "/user" : "");
        if (originalRequest.url && (originalRequest.url.startsWith("http://") || originalRequest.url.startsWith("https://"))) {
          originalRequest.url = originalRequest.url
            .replace(LOCAL_API_BASE, PROD_API_BASE)
            .replace("http://localhost:3000/api", PROD_API_BASE)
            .replace("http://127.0.0.1:3000/api", PROD_API_BASE)
            .replace("http://10.0.2.2:3000/api", PROD_API_BASE);
        }
        try {
          return await api(originalRequest);
        } catch (fallbackError) {
          return Promise.reject(fallbackError);
        }
      }
    }

    // Auto-retry once for GET requests on transient network drops
    if (
      originalRequest &&
      !originalRequest._hasRetried &&
      originalRequest.method?.toLowerCase() === "get" &&
      (error.message === "Network Error" || error.code === "ERR_NETWORK" || error.code === "ECONNABORTED")
    ) {
      originalRequest._hasRetried = true;
      try {
        await new Promise((r) => setTimeout(r, 600));
        return await api(originalRequest);
      } catch (retryErr) {
        return Promise.reject(retryErr);
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