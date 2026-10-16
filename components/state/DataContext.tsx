import {
  createContext,
  useRef,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IUser } from "../../types/User";
import useAuth from "../../hooks/useAuth";
import { api } from "../../lib/api";
import TrackPlayer, {
  Capability,
  Event,
  State,
  useProgress,
  useTrackPlayerEvents,
} from "react-native-track-player";
import { useNetworkStatus } from "../../hooks/useNetwork";

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
  player: any;
  status: any;
  currentTrack: any;
  playTrack: (track: any) => void;
  togglePlay: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  removeAllTracks: () => void;
};

export const AudioContext = createContext<AudioContextType | null>(null);
export const ToastContext = createContext<ToastContextType | null>(null);
export const ModalContext = createContext<ModalContextType | null>(null);
export const UserContext = createContext<{
  user: IUser | null;
  loadingUser: boolean;
  reload: () => Promise<void>;
  updateUser: (patch: Partial<IUser>) => void;
} | null>(null);

const DEMO_AUDIO_URL =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
const USER_CACHE_KEY = "cached_user_profile";

let setupPromise: Promise<void> | null = null;

const ensurePlayerSetup = async () => {
  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
        });
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.Stop,
            Capability.SeekTo,
            Capability.JumpForward,
            Capability.JumpBackward,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SeekTo,
          ],
          progressUpdateEventInterval: 0.25,
        } as any);
      } catch (error: any) {
        if (
          error?.message?.includes("already") ||
          error?.code === "player_already_initialized"
        ) {
          return;
        }
        console.log("Audio setup error:", error);
        setupPromise = null;
        throw error;
      }
    })();
  }
  return setupPromise;
};

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [toast, setToast] = useState<ToastData | null>(null);
  const [modal, setModal] = useState<ModalData | null>(null);
  const [user, setUser] = useState<IUser | null>(null);
  const updateUser = useCallback((patch: Partial<IUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const { accessToken } = useAuth();
  const { isConnected } = useNetworkStatus();
  const [loadingUser, setLoadingUser] = useState(true);

  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // App launch par disk se instant hydrate
  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(USER_CACHE_KEY)
      .then((cached) => {
        if (cached && isMounted) {
          setUser(JSON.parse(cached));
          setLoadingUser(false);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const hideToast = () => {
    if (toastTimeout.current) {
      clearTimeout(toastTimeout.current);
      toastTimeout.current = null;
    }
    setToast(null);
  };

  const showToast = (toastData: ToastData) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(toastData);
    toastTimeout.current = setTimeout(() => {
      setToast(null);
      toastTimeout.current = null;
    }, toastData.time ?? 3000);
  };

  const showModal = (modalData: ModalData) => setModal(modalData);
  const hideModal = () => setModal(null);

  const getUser = useCallback(async () => {
    if (!accessToken) {
      try {
        const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
        setUser(cached ? JSON.parse(cached) : null);
      } catch {
        setUser(null);
      }
      setLoadingUser(false);
      return;
    }

    try {
      const { data } = await api.get(`/get-self`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (data?.data) {
        setUser(data.data);
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.data)).catch(
          () => {}
        );
      }
    } catch {
      try {
        const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
        if (cached) setUser(JSON.parse(cached));
      } catch {}
    } finally {
      setLoadingUser(false);
    }
  }, [accessToken]);

  useEffect(() => {
    getUser();
  }, [getUser, isConnected]);

  useEffect(() => {
    ensurePlayerSetup().catch(() => {});
  }, []);

  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [playerState, setPlayerState] = useState<State>(State.None);
  const { position, duration } = useProgress(250);

  useTrackPlayerEvents(
    [Event.PlaybackState, Event.PlaybackError, Event.PlaybackQueueEnded],
    (event) => {
      if (event.type === Event.PlaybackState) {
        setPlayerState(event.state);
      } else if (event.type === Event.PlaybackError) {
        console.log("TrackPlayer playback error:", event);
      }
    }
  );

  const isPlayingNow = playerState === State.Playing;
  const isBuffering =
    playerState === State.Buffering || playerState === State.Loading;
  const isLoaded =
    !!currentTrack &&
    playerState !== State.None &&
    playerState !== State.Error;

  const status = useMemo(
    () => ({
      playing: isPlayingNow,
      isLoaded,
      isBuffering,
      duration: duration || 0,
      currentTime: position || 0,
      playbackState: playerState,
    }),
    [isPlayingNow, isLoaded, isBuffering, duration, position, playerState]
  );

  const player = useMemo(
    () => ({
      play: () => TrackPlayer.play().catch(() => {}),
      pause: () => TrackPlayer.pause().catch(() => {}),
      seekTo: (sec: number) => TrackPlayer.seekTo(sec).catch(() => {}),
      setPlaybackRate: (rate: number) =>
        TrackPlayer.setRate(rate).catch(() => {}),
      replace: async (source: { uri: string } | string) => {
        try {
          await ensurePlayerSetup();
          await TrackPlayer.reset();
          const uri = typeof source === "string" ? source : source.uri;
          await TrackPlayer.add({
            id: uri,
            url: uri,
            media: uri,
          });
          await TrackPlayer.play();
        } catch (_) {}
      },
      raw: TrackPlayer,
    }),
    []
  );

  const playTrack = useCallback(
    async (track: any) => {
      if (!track) return;
      const isLocalFile =
        typeof track.media === "string" && track.media.startsWith("file://");
      if (!isConnected && !isLocalFile) {
        showToast({ title: "Please connect to internet to play audio" });
        return;
      }
      const targetUrl = track.media || DEMO_AUDIO_URL;

      // If the exact same track is already loaded, don't restart it!
      if (currentTrack?._id === track._id && isLoaded) {
        if (!isPlayingNow) {
          try {
            await TrackPlayer.play();
          } catch (_) {}
        }
        return;
      }

      try {
        await ensurePlayerSetup();
        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: track._id ?? targetUrl,
          url: targetUrl,
          media: targetUrl,
          title: track.title ?? "Audio",
          artist: track.author ?? "Readapt",
          artwork: track.cover,
        });
        await TrackPlayer.play();
        setCurrentTrack(track);
      } catch (error) {
        console.log("Error playing track:", error);
      }
    },
    [isConnected, currentTrack?._id, isLoaded, isPlayingNow, showToast]
  );

  const removeAllTracks = useCallback(async () => {
    try {
      await TrackPlayer.reset();
      setCurrentTrack(null);
    } catch (error) {
      console.log("Error clearing tracks:", error);
    }
  }, []);

  const togglePlay = useCallback(async () => {
    if (!isLoaded) return;
    try {
      if (isPlayingNow) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch (_) {}
  }, [isLoaded, isPlayingNow]);

  const pause = useCallback(() => {
    TrackPlayer.pause().catch(() => {});
  }, []);

  const seekTo = useCallback((sec: number) => {
    TrackPlayer.seekTo(sec).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      player,
      status,
      currentTrack,
      playTrack,
      togglePlay,
      pause,
      seekTo,
      removeAllTracks,
    }),
    [
      player,
      status,
      currentTrack,
      playTrack,
      togglePlay,
      pause,
      seekTo,
      removeAllTracks,
    ]
  );

  return (
    <AudioContext.Provider value={value}>
      <ToastContext.Provider value={{ toast, showToast, hideToast }}>
        <ModalContext.Provider value={{ modal, showModal, hideModal }}>
          <UserContext.Provider
            value={{ user, loadingUser, reload: getUser, updateUser }}>
            {children}
          </UserContext.Provider>
        </ModalContext.Provider>
      </ToastContext.Provider>
    </AudioContext.Provider>
  );
};