import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

export const api = axios.create({
  baseURL: "https://redapt-admin-sand.vercel.app/api/user",
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

// Request Interceptor: SecureStore se token uthayega
api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase();

  if (!isConnected && method !== "get") {
    if (showToast) {
      showToast("You are offline. Action cannot be completed.");
    }
    return Promise.reject(new axios.Cancel("Offline request blocked."));
  }

  try {
    const stored = await SecureStore.getItemAsync("accessToken");
    if (stored) {
      const parsed = JSON.parse(stored);
      const realJwt = parsed?.token || parsed;
      if (realJwt && typeof realJwt === "string") {
        config.headers.Authorization = `Bearer ${realJwt}`;
      }
    }
  } catch (err) {}

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);
