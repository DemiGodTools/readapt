import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

export const api = axios.create({
  baseURL: "https://redapt-admin-sand.vercel.app/api/user",
  timeout: 10000, // 10 seconds hard timeout to eliminate infinite hangs
});

// State variables to hold injected values from React
let isConnected = true;
let showToast: ((message: string) => void) | null = null;

export const configureApiInterceptor = (
  networkStatus: boolean,
  toastFn: (message: string) => void
) => {
  isConnected = networkStatus;
  showToast = toastFn;
};

// Request Interceptor: Block mutating requests when completely offline
api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase();

  if (!isConnected && method !== "get") {
    if (showToast) {
      showToast("You are offline. Action cannot be completed.");
    }
    return Promise.reject(new axios.Cancel("Offline request blocked."));
  }

  // Auto-inject token if missing in headers
  if (!config.headers.Authorization) {
    const token = await AsyncStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

// Response Interceptor
api.interceptors.response.use(
  (response) => {
    // Non-blocking async cache write (JS thread block nahi karega)
    if (response.config.method?.toLowerCase() === "get" && response.data) {
      const key = `api_cache:${response.config.url}`;
      AsyncStorage.setItem(key, JSON.stringify(response.data)).catch(() => {});
    }
    return response;
  },
  async (error) => {
    // Agar user ne request cancel ki ya component unmount hua
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const config = error.config;

    // Fallback cache logic sirf GET requests ke liye
    if (config?.method?.toLowerCase() === "get") {
      try {
        const key = `api_cache:${config.url}`;
        const cached = await AsyncStorage.getItem(key);

        if (cached) {
          return {
            ...error.response,
            data: JSON.parse(cached),
            status: 200,
            statusText: "OK (Cached)",
            headers: error.response?.headers || {},
            config,
          };
        }
      } catch (cacheErr) {
        // Cache read fail hone par silent ignore
      }

      if (!isConnected && showToast) {
        showToast("You are not connected to internet");
      }
    }

    // ALWAYS reject the promise so React components trigger catch & finally blocks!
    return Promise.reject(error);
  }
);