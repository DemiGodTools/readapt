import { AppState, DeviceEventEmitter } from "react-native";
import {
  createContext,
  useRef,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IUser } from "../../types/User";
import { notifyAuthChange } from "../../hooks/useAuth";
import { api, setApiUserEmail } from "../../lib/api";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { useGlobalAudioActions } from "../../hooks/useGlobalAudio";

type ToastData = {
  title: string;
  time?: number;
};

type ModalData = {
  title: string;
  onCancel?: () => void;
  onConfirm: () => void;
};

type ToastContextType = {
  toast: ToastData | null;
  showToast: (toast: ToastData) => void;
  hideToast: () => void;
};

type ModalContextType = {
  modal: ModalData | null;
  showModal: (modal: ModalData) => void;
  hideModal: () => void;
};

type AudioContextType = {
  playTrack: (track: any, initialPositionSec?: number) => void;
  togglePlay: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (vol: number) => number;
  preloadTrack: (track: any) => void;
  removeAllTracks: () => void;
};

export const AudioContext = createContext<AudioContextType | null>(null);
export const ToastContext = createContext<ToastContextType | null>(null);
export const ModalContext = createContext<ModalContextType | null>(null);
export const UserContext = createContext<{
  user: IUser | null;
  loadingUser: boolean;
  reload: (tokenOverride?: string) => Promise<void>;
  updateUser: (patch: Partial<IUser>) => void;
  logout: () => Promise<void>;
  setAuthSession: (token: string, user?: IUser) => Promise<void>;
} | null>(null);

const USER_CACHE_KEY = "cached_user_profile";

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [toast, setToast] = useState<ToastData | null>(null);
  const [modal, setModal] = useState<ModalData | null>(null);
  const [user, setUser] = useState<IUser | null>(null);
  const [token, setToken] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(true);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedCacheRef = useRef(false);
  const { isConnected } = useNetworkStatus();
  const wasConnectedRef = useRef(isConnected);

  // Static actions reference — prevents audio state updates from re-rendering the entire app!
  const audioActions = useGlobalAudioActions();

  const showToast = useCallback((data: ToastData) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(data);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, data.time || 3000);
  }, []);

  const hideToast = useCallback(() => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(null);
  }, []);

  const showModal = useCallback((data: ModalData) => {
    setModal(data);
  }, []);

  const hideModal = useCallback(() => {
    setModal(null);
  }, []);

  const updateUser = useCallback((patch: Partial<IUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(updated)).catch(
        () => {}
      );
      return updated;
    });
  }, []);

  const resolveToken = useCallback(async (): Promise<string | null> => {
    let raw: string | null = null;
    try {
      raw = await SecureStore.getItemAsync("accessToken");
    } catch {}

    if (!raw) {
      try {
        raw = await AsyncStorage.getItem("accessToken");
      } catch {}
    }

    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed.token || null;
      }
      return typeof parsed === "string" ? parsed : raw;
    } catch {
      return raw;
    }
  }, []);

  const getUser = useCallback(
    async (tokenOverride?: string) => {
      // Paint the last known profile immediately on cold start instead of
      // leaving the avatar/name blank until /get-self answers.
      if (!hasHydratedCacheRef.current) {
        hasHydratedCacheRef.current = true;
        try {
          const cachedProfile = await AsyncStorage.getItem(USER_CACHE_KEY);
          if (cachedProfile) {
            const parsed = JSON.parse(cachedProfile);
            if (parsed) {
              setUser((prev) => prev ?? parsed);
              if (parsed.email) setApiUserEmail(parsed.email);
              setLoadingUser(false);
            }
          }
        } catch {}
      }

      try {
        const activeToken = tokenOverride || (await resolveToken());

        if (!activeToken) {
          setUser(null);
          setToken("");
          setLoadingUser(false);
          return;
        }

        setToken(activeToken);

        const { data } = await api.get(`/get-self`, {
          headers: { Authorization: `Bearer ${activeToken}` },
        });

        if (data?.data) {
          setUser(data.data);
          setApiUserEmail(data.data.email);
          AsyncStorage.setItem(
            USER_CACHE_KEY,
            JSON.stringify(data.data)
          ).catch(() => {});
          AsyncStorage.setItem(
            "recent_session_account",
            JSON.stringify({
              name: data.data.name,
              email: data.data.email,
              image: data.data.image,
            })
          ).catch(() => {});
        }
      } catch {
        try {
          const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            setUser(parsed);
            if (parsed?.email) setApiUserEmail(parsed.email);
          }
        } catch {}
      } finally {
        setLoadingUser(false);
      }
    },
    [resolveToken]
  );

  const setAuthSession = useCallback(
    async (newToken: string, newUser?: IUser) => {
      setToken(newToken);
      if (newUser) {
        setUser(newUser);
        if (newUser.email) setApiUserEmail(newUser.email);
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(newUser)).catch(
          () => {}
        );
        AsyncStorage.setItem(
          "recent_session_account",
          JSON.stringify({
            name: newUser.name,
            email: newUser.email,
            image: newUser.image,
          })
        ).catch(() => {});
      }
      notifyAuthChange();
      await getUser(newToken);
    },
    [getUser]
  );

  const logout = useCallback(async () => {
    try {
      const currentToken = token || (await resolveToken());
      const headers = currentToken
        ? { Authorization: `Bearer ${currentToken}` }
        : {};
      await api.post("/auth/logout", { email: user?.email }, { headers }).catch(
        () => {}
      );
    } catch {}

    // Preserve the user's name, email, and avatar in recent_session_account so Login screen displays the recent session button
    try {
      if (user) {
        await AsyncStorage.setItem(
          "recent_session_account",
          JSON.stringify({
            name: user.name,
            email: user.email,
            image: user.image,
          })
        ).catch(() => {});
      }
    } catch {}

    try {
      await SecureStore.deleteItemAsync("accessToken").catch(() => {});
      await AsyncStorage.removeItem("accessToken").catch(() => {});
      await AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
      await AsyncStorage.removeItem("cached_feed_data").catch(() => {});
      await AsyncStorage.removeItem("recentReads").catch(() => {});
    } catch {}

    setUser(null);
    setToken("");
    setApiUserEmail(null);
    try {
      audioActions.removeAllTracks();
    } catch {}

    notifyAuthChange();
  }, [token, user, resolveToken, audioActions]);

  useEffect(() => {
    getUser();
  }, [getUser]);

  // Only refresh when connectivity actually comes back, not on every toggle
  // (the old effect fired /get-self twice during a normal cold start).
  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    wasConnectedRef.current = isConnected;
    if (isConnected && !wasConnected) getUser();
  }, [isConnected, getUser]);

  // Presence Heartbeat & AppState Listener (Instant logged in detection)
  useEffect(() => {
    if (!token) return;

    // 1. Send heartbeat every 3 minutes while app is in foreground
    const interval = setInterval(() => {
      api
        .post(
          "/heartbeat",
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        .catch(() => {});
    }, 3 * 60 * 1000);

    // 2. Refresh on app foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        getUser();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [token, getUser]);

  const toastContextValue = useMemo(
    () => ({ toast, showToast, hideToast }),
    [toast, showToast, hideToast]
  );

  const modalContextValue = useMemo(
    () => ({ modal, showModal, hideModal }),
    [modal, showModal, hideModal]
  );

  const userContextValue = useMemo(
    () => ({
      user,
      loadingUser,
      reload: getUser,
      updateUser,
      logout,
      setAuthSession,
    }),
    [user, loadingUser, getUser, updateUser, logout, setAuthSession]
  );

  return (
    <AudioContext.Provider value={audioActions}>
      <ToastContext.Provider value={toastContextValue}>
        <ModalContext.Provider value={modalContextValue}>
          <UserContext.Provider value={userContextValue}>
            {children}
          </UserContext.Provider>
        </ModalContext.Provider>
      </ToastContext.Provider>
    </AudioContext.Provider>
  );
};
