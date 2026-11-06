import { useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";

export const notifyAuthChange = () => {
  DeviceEventEmitter.emit("AUTH_STATE_CHANGED");
};

const useAuth = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [isLoading, setisLoading] = useState(true);

  const checkLogin = useCallback(async () => {
    try {
      let storedToken: string | null = null;
      try {
        storedToken = await SecureStore.getItemAsync("accessToken");
      } catch (e) {
        console.warn("SecureStore read error, falling back to AsyncStorage:", e);
      }

      if (!storedToken) {
        try {
          storedToken = await AsyncStorage.getItem("accessToken");
        } catch {}
      }

      if (!storedToken) {
        setisLoading(false);
        setIsLoggedIn(false);
        setAccessToken("");
        return;
      }

      let tokenString = "";
      let expiryTime = 0;

      try {
        const parsed = JSON.parse(storedToken);
        if (parsed && typeof parsed === "object") {
          tokenString = parsed.token || "";
          if (parsed.expiry) {
            expiryTime = parseInt(parsed.expiry, 10);
          }
        } else if (typeof parsed === "string") {
          tokenString = parsed;
        }
      } catch {
        tokenString = storedToken;
      }

      if (!tokenString || typeof tokenString !== "string" || !tokenString.trim()) {
        setIsLoggedIn(false);
        setAccessToken("");
        setisLoading(false);
        return;
      }

      const now = Date.now();
      if (expiryTime && !isNaN(expiryTime) && expiryTime > 0 && now > expiryTime) {
        console.log("Token expired, clearing session");
        await SecureStore.deleteItemAsync("accessToken").catch(() => {});
        await AsyncStorage.removeItem("accessToken").catch(() => {});
        setIsLoggedIn(false);
        setAccessToken("");
        setisLoading(false);
        return;
      }

      const cleanToken = tokenString.trim();
      setAccessToken(cleanToken);
      setIsLoggedIn(true);

      // Keep both storages synchronized
      const tokenPayload = JSON.stringify({
        token: cleanToken,
        expiry: expiryTime || now + 1000 * 60 * 60 * 24 * 30,
      });
      AsyncStorage.setItem("accessToken", tokenPayload).catch(() => {});
    } catch (err) {
      console.warn("checkLogin error:", err);
      setIsLoggedIn(false);
      setAccessToken("");
    } finally {
      setisLoading(false);
    }
  }, []);

  useEffect(() => {
    checkLogin();

    const sub = DeviceEventEmitter.addListener("AUTH_STATE_CHANGED", () => {
      checkLogin();
    });

    return () => {
      sub.remove();
    };
  }, [checkLogin]);

  return { accessToken, isLoggedIn, isLoading, checkLogin };
};

export default useAuth;
