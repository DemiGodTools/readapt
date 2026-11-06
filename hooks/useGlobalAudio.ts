import { useState, useEffect, useCallback, useMemo } from "react";
import { Platform } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  AudioPlayer,
  AudioStatus as ExpoAudioStatus,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AudioCacheManager } from "./AudioCacheManager";
import { IChapter } from "../types/Chapter";

let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch (_) {}

export type StreamProtocol = "hls" | "dash" | "range-chunk" | "local";

export interface AudioStatus {
  isLoaded: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  playbackRate: number;
  volume: number;
  protocol: StreamProtocol;
  bufferedAheadSec: number;
  isCached?: boolean;
  loadTimeMs?: number;
  error?: string | null;
}

interface HotPlayerEntry {
  trackId: string;
  mediaUrl: string;
  resolvedUri: string;
  protocol: StreamProtocol;
  player: AudioPlayer;
  subscription?: { remove: () => void };
  durationSec: number;
  lastUsedAt: number;
}

const MAX_HOT_RAM_PLAYERS = 3;
const FORWARD_BUFFER_HORIZON_SEC = 120;
const DEFAULT_FALLBACK_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
const MEDIA_NOTIFICATION_ID = "readapt-active-media-notification";

const hotPlayerPool: Map<string, HotPlayerEntry> = new Map();
let globalPlayer: AudioPlayer | null = null;
let globalCurrentTrack: IChapter | null = null;

let globalPlayIntent = false;
let globalPlaybackRate = 1.0;
let globalVolume = 1.0;

let currentLoadToken = 0;
let seekLockUntil = 0;
let seekDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let userScrubbing = false; 
let pendingInitialSeekSec = 0;

let globalStatus: AudioStatus = {
  isLoaded: false,
  playing: false,
  currentTime: 0,
  duration: 0,
  isBuffering: false,
  playbackRate: 1.0,
  volume: 1.0,
  protocol: "range-chunk",
  bufferedAheadSec: 0,
  isCached: false,
};

export const getTrackId = (track?: IChapter | null): string => {
  if (!track) return "";
  return String(track._id || (track as any).hlsUrl || track.media || "");
};

export const resolveBestStreamUrl = (track?: IChapter | null): string => {
  if (!track) return DEFAULT_FALLBACK_URL;
  const rawHls = (track as any).hlsUrl || (track as any).hls || (track as any).m3u8Url;
  if (typeof rawHls === "string" && rawHls.trim().length > 0) return rawHls.trim();
  const rawMedia = track.media || DEFAULT_FALLBACK_URL;
  return rawMedia;
};

export const detectStreamProtocol = (uri: string): StreamProtocol => {
  if (!uri) return "range-chunk";
  const clean = uri.split("?")[0].toLowerCase();
  if (clean.startsWith("file://") || !uri.startsWith("http")) return "local";
  if (clean.endsWith(".m3u8") || uri.includes("m3u8") || uri.includes("hls")) return "hls";
  if (clean.endsWith(".mpd") || uri.includes("mpd")) return "dash";
  return "range-chunk";
};

// UI Thread Communication
export const setUserScrubbingActive = (active: boolean) => {
  userScrubbing = active;
  if (active) seekLockUntil = Date.now() + 86400000; 
  else seekLockUntil = Date.now() + 800;
};

export const parseAnyDurationToSec = (val: any): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.max(0, val);
  if (typeof val !== "string") return 0;

  const str = val.trim().replace(/^\[|\]$/g, "");
  if (!str) return 0;

  if (!isNaN(Number(str))) {
    return Math.max(0, Number(str));
  }

  if (str.includes(":")) {
    const parts = str.split(":").map((p) => parseFloat(p) || 0);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 1) {
      return parts[0];
    }
  }

  return 0;
};

const stateListeners: Set<() => void> = new Set();
const timeListeners: Set<(currentTime: number, duration: number) => void> = new Set();
const volumeListeners: Set<(volume: number) => void> = new Set();

const notifyStateListeners = () => stateListeners.forEach((l) => l());
const notifyTimeListeners = (c: number, d: number) => timeListeners.forEach((l) => l(c, d));
const notifyVolumeListeners = (v: number) => volumeListeners.forEach((l) => l(v));

export const subscribeToPlaybackTime = (listener: (c: number, d: number) => void): (() => void) => {
  timeListeners.add(listener);
  listener(globalStatus.currentTime, globalStatus.duration);
  return () => {
    timeListeners.delete(listener);
  };
};

export const subscribeToVolume = (listener: (v: number) => void): (() => void) => {
  volumeListeners.add(listener);
  listener(globalVolume);
  return () => {
    volumeListeners.delete(listener);
  };
};

const ensureAudioSession = async () => {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      interruptionModeAndroid: "doNotMix",
    } as any);
  } catch (_) {}
};
void ensureAudioSession();

const updateGlobalStatus = (patch: Partial<AudioStatus>, forceNotify = false) => {
  const prev = globalStatus;
  globalStatus = { ...globalStatus, ...patch };

  if (patch.currentTime !== undefined || patch.duration !== undefined) {
    notifyTimeListeners(globalStatus.currentTime, globalStatus.duration);
  }
  if (forceNotify || prev.playing !== globalStatus.playing || prev.isLoaded !== globalStatus.isLoaded || prev.error !== globalStatus.error) {
    notifyStateListeners();
  }
};

const applyRateToPlayer = (player: AudioPlayer | null, rate: number) => {
  if (!player) return;
  try {
    if (typeof (player as any).setPlaybackRate === "function") (player as any).setPlaybackRate(rate);
    (player as any).playbackRate = rate;
  } catch (_) {}
};

const applyVolumeToPlayer = (player: AudioPlayer | null, vol: number) => {
  if (!player) return;
  try {
    (player as any).muted = vol <= 0.003;
    (player as any).volume = vol;
  } catch (_) {}
};

const enforceHotPoolLimit = (excludeTrackId?: string) => {
  if (hotPlayerPool.size <= MAX_HOT_RAM_PLAYERS) return;
  const activeId = getTrackId(globalCurrentTrack);
  const sorted = Array.from(hotPlayerPool.values())
    .filter((item) => item.trackId !== excludeTrackId && item.trackId !== activeId)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  while (hotPlayerPool.size > MAX_HOT_RAM_PLAYERS && sorted.length > 0) {
    const oldest = sorted.shift();
    if (oldest) {
      hotPlayerPool.delete(oldest.trackId);
      try {
        oldest.subscription?.remove();
        oldest.player.pause();
        if (typeof (oldest.player as any).release === 'function') (oldest.player as any).release();
        else oldest.player.remove();
      } catch (_) {}
    }
  }
};

const attachStatusListener = (entry: HotPlayerEntry) => {
  entry.subscription?.remove();
  entry.subscription = entry.player.addListener("playbackStatusUpdate", (st: ExpoAudioStatus) => {
    if (!st || getTrackId(globalCurrentTrack) !== entry.trackId) return;

    const isLoadedBool = Boolean(st.isLoaded);
    const nativePlaying = Boolean(st.playing);
    const bufferingBool = Boolean(st.isBuffering);
    const now = Date.now();

    const rawPosSec = typeof st.currentTime === "number" && !isNaN(st.currentTime) ? st.currentTime : 0;
    const rawDurSec = typeof st.duration === "number" && !isNaN(st.duration) && st.duration > 0 ? st.duration : entry.durationSec;

    // ELIMINATE FLICKERING: Trust the globalPlayIntent (user intent) as the source of truth.
    // Only yield to native false if playback naturally finishes.
    if (st.didJustFinish) {
      globalPlayIntent = false;
      updateGlobalStatus({ isLoaded: true, playing: false, isBuffering: false, currentTime: rawDurSec, duration: rawDurSec }, true);
      return;
    }

    // Handle pending initial seek once loaded
    if (isLoadedBool && pendingInitialSeekSec > 0) {
      const seekTarget = pendingInitialSeekSec;
      pendingInitialSeekSec = 0;
      try {
        void entry.player.seekTo(seekTarget);
      } catch (_) {}
    }

    if (globalPlayIntent && isLoadedBool && !nativePlaying && !bufferingBool && !userScrubbing) {
      try { entry.player.play(); } catch (_) {}
    }

    // Ignore native time updates if user is scrubbing or recently triggered a seek
    let resolvedTime = rawPosSec;
    if (now < seekLockUntil || userScrubbing) {
      resolvedTime = globalStatus.currentTime;
    }

    updateGlobalStatus({
      isLoaded: isLoadedBool,
      playing: globalPlayIntent,
      currentTime: resolvedTime,
      duration: rawDurSec,
      isBuffering: bufferingBool,
      playbackRate: globalPlaybackRate,
      bufferedAheadSec: FORWARD_BUFFER_HORIZON_SEC,
    });
  });
};

const createNativeStreamPlayer = (uri: string): AudioPlayer => {
  try {
    return createAudioPlayer({ uri }, { updateInterval: 250, downloadFirst: false });
  } catch (_) {
    return createAudioPlayer(uri, { updateInterval: 250, downloadFirst: false });
  }
};

const playTrackInternal = async (track: IChapter, initialPositionSec = 0) => {
  if (!track) return;
  const trackId = getTrackId(track);
  const remoteUrl = resolveBestStreamUrl(track);
  const protocol = detectStreamProtocol(remoteUrl);

  if (globalPlayer && getTrackId(globalCurrentTrack) === trackId && hotPlayerPool.has(trackId)) {
    globalPlayIntent = true;
    updateGlobalStatus({ playing: true }, true);
    if (initialPositionSec > 0) void seekToInternal(initialPositionSec);
    try { globalPlayer.play(); } catch (_) {}
    return;
  }

  const loadToken = ++currentLoadToken;
  if (globalPlayer) {
    try { globalPlayer.pause(); } catch (_) {}
  }
  void ensureAudioSession();

  globalCurrentTrack = track;
  globalPlayIntent = true;
  
  updateGlobalStatus({
    isLoaded: false,
    playing: true,
    currentTime: initialPositionSec,
    duration: 0,
    isBuffering: true,
    playbackRate: globalPlaybackRate,
    volume: globalVolume,
    protocol,
    error: null,
  }, true);

  // Instant Playback Fast-Track: Check cache instantly, fallback to direct stream
  let playbackUri = remoteUrl;
  let isCached = false;
  try {
    const cacheRes = await AudioCacheManager.getCachedTrackUri(trackId, remoteUrl);
    if (cacheRes?.uri) {
      playbackUri = cacheRes.uri;
      isCached = true;
    }
  } catch (_) {}

  if (loadToken !== currentLoadToken) return;

  try {
    const player = createNativeStreamPlayer(playbackUri);
    globalPlayer = player;
    applyRateToPlayer(player, globalPlaybackRate);
    applyVolumeToPlayer(player, globalVolume);

    const newEntry: HotPlayerEntry = {
      trackId, mediaUrl: remoteUrl, resolvedUri: playbackUri,
      protocol: isCached ? "local" : protocol,
      player, durationSec: 0, lastUsedAt: Date.now(),
    };

    attachStatusListener(newEntry);
    hotPlayerPool.set(trackId, newEntry);
    enforceHotPoolLimit(trackId);

    pendingInitialSeekSec = initialPositionSec;
    player.play();
    
    if (!isCached && protocol === "range-chunk") {
      AudioCacheManager.cacheTrackInBackground(trackId, remoteUrl).catch(()=>{});
    }
  } catch (err: any) {
    globalPlayIntent = false;
    updateGlobalStatus({ isBuffering: false, playing: false, error: err?.message }, true);
  }
};

const togglePlayInternal = () => {
  if (!globalPlayer && globalCurrentTrack) {
    void playTrackInternal(globalCurrentTrack, globalStatus.currentTime);
    return;
  }
  if (!globalPlayer) return;
  globalPlayIntent = !globalStatus.playing;
  updateGlobalStatus({ playing: globalPlayIntent }, true);
  try {
    if (globalPlayIntent) globalPlayer.play();
    else globalPlayer.pause();
  } catch (_) {}
};

const seekToInternal = (seconds: number) => {
  if (typeof seconds !== "number" || isNaN(seconds) || !globalPlayer) return;
  const maxDur = globalStatus.duration > 0 ? globalStatus.duration : Number.MAX_SAFE_INTEGER;
  const clamped = Math.max(0, Math.min(seconds, maxDur));

  // Optimistic UI Update immediately so UI slider moves instantaneously
  seekLockUntil = Date.now() + 600;
  updateGlobalStatus({ currentTime: clamped }, false);

  // Debounce the native seek to bundle rapid clicks/scrubs
  if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(async () => {
    try {
      if (globalPlayer) {
        await (globalPlayer as any).seekTo(clamped);
        if (globalPlayIntent) {
          globalPlayer.play();
        }
      }
    } catch (_) {}
  }, 70);
};

const setPlaybackRateInternal = (rate: number) => {
  globalPlaybackRate = rate;
  if (globalPlayer) applyRateToPlayer(globalPlayer, rate);
  updateGlobalStatus({ playbackRate: rate }, true);
};

export const setVolumeDirect = (vol: number): number => {
  globalVolume = Math.max(0, Math.min(1, vol));
  notifyVolumeListeners(globalVolume);
  if (globalPlayer) applyVolumeToPlayer(globalPlayer, globalVolume);
  return globalVolume;
};

export const getVolumeDirect = (): number => globalVolume;

export const flushVolumeDirect = (): void => {
  if (globalPlayer) applyVolumeToPlayer(globalPlayer, globalVolume);
};

const removeAllTracksInternal = () => {
  currentLoadToken++;
  globalPlayIntent = false;
  const active = globalPlayer;
  globalPlayer = null;
  globalCurrentTrack = null;

  updateGlobalStatus({ isLoaded: false, playing: false, currentTime: 0, duration: 0, isBuffering: false }, true);
  
  if (active) {
    try {
      active.pause();
      if (typeof (active as any).release === 'function') (active as any).release();
      else active.remove();
    } catch (_) {}
  }
  hotPlayerPool.forEach((entry) => {
    try {
      entry.subscription?.remove();
      entry.player.pause();
      if (typeof (entry.player as any).release === 'function') (entry.player as any).release();
      else entry.player.remove();
    } catch (_) {}
  });
  hotPlayerPool.clear();
};

export const updateCurrentTrackMetadata = (track: Partial<IChapter>) => {
  if (globalCurrentTrack && (!track._id || String(track._id) === String(globalCurrentTrack._id))) {
    globalCurrentTrack = { ...globalCurrentTrack, ...track };
    notifyStateListeners();
  }
};

export const useGlobalAudioActions = () => {
  const playTrack = useCallback((t: IChapter, sec?: number) => playTrackInternal(t, sec), []);
  const togglePlay = useCallback(() => togglePlayInternal(), []);
  const pause = useCallback(() => { globalPlayIntent = false; globalPlayer?.pause(); updateGlobalStatus({ playing: false }, true); }, []);
  const seekTo = useCallback((sec: number) => seekToInternal(sec), []);
  const setPlaybackRate = useCallback((rate: number) => setPlaybackRateInternal(rate), []);
  const setVolume = useCallback((vol: number) => setVolumeDirect(vol), []);
  const removeAllTracks = useCallback(() => removeAllTracksInternal(), []);
  const preloadTrack = useCallback((track: IChapter) => AudioCacheManager.warmTrackMetadata(getTrackId(track), resolveBestStreamUrl(track)), []);
  const updateTrackMetadata = useCallback((track: Partial<IChapter>) => updateCurrentTrackMetadata(track), []);

  return useMemo(() => ({ playTrack, togglePlay, pause, seekTo, setPlaybackRate, setVolume, removeAllTracks, preloadTrack, updateTrackMetadata }), [playTrack, togglePlay, pause, seekTo, setPlaybackRate, setVolume, removeAllTracks, preloadTrack, updateTrackMetadata]);
};

export const useGlobalAudio = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    stateListeners.add(listener);
    return () => { stateListeners.delete(listener); };
  }, []);

  const actions = useGlobalAudioActions();
  return { player: globalPlayer, status: globalStatus, currentTrack: globalCurrentTrack, ...actions };
};

export default useGlobalAudio;