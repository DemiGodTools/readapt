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

// ⚡ Request Interceptor: SecureStore se token nikal kar real JWT attach karein
api.interceptors.request.use(async (config) => {
  if (!isConnected) {
    if (showToast) {
      showToast("You are offline. Request cannot be completed.");
    }
    return Promise.reject(new axios.Cancel("Offline request blocked."));
  }

  try {
    // 1. Pehle SecureStore check karein (jahan Login.tsx token save karta hai)
    const stored = await SecureStore.getItemAsync("accessToken");
    if (stored) {
      const parsed = JSON.parse(stored);
      const realJwt = parsed?.token || parsed;
      if (realJwt && typeof realJwt === "string") {
        config.headers.Authorization = `Bearer ${realJwt}`;
      }
    } else {
      // 2. Fallback AsyncStorage
      const asyncToken = await AsyncStorage.getItem("accessToken");
      if (asyncToken) {
        config.headers.Authorization = `Bearer ${asyncToken}`;
      }
    }
  } catch (err) {
    // Token extraction failure par continue
  }

  return config;
});

// Response Interceptor: Pure errors pass karein taaki retry ho sake
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);