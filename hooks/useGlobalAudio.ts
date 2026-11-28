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
import { WEB_PORTAL_BASE } from "../lib/api";

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
  lockScreenMetadataSynced?: boolean;
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
let targetSeekPosition: number | null = null;
let targetSeekTimestamp = 0;

// Lock-screen / notification-center (system transport controls)
const LOCK_SCREEN_OPTIONS = { showSeekForward: true, showSeekBackward: true };
let lockScreenTrackId = "";
let lockScreenOwnerPlayer: AudioPlayer | null = null;

// Window during which a play() we just issued is trusted over the native state.
// Outside it, play/pause coming from the lock screen or notification must win.
let playIntentLockUntil = 0;

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
  const id = track._id || (track as any).id;
  if (id && String(id).trim() && String(id) !== "undefined" && String(id) !== "null") {
    return String(id).trim();
  }
  const media = (track as any).hlsUrl || track.media;
  if (media && typeof media === "string" && media.trim()) {
    return media.trim();
  }
  return "";
};

export const resolveBestStreamUrl = (track?: IChapter | null): string => {
  if (!track) return "";
  const rawHls = (track as any).hlsUrl || (track as any).hls || (track as any).m3u8Url;
  if (typeof rawHls === "string" && rawHls.trim().length > 0) return rawHls.trim();
  const rawMedia = track.media;
  if (rawMedia && typeof rawMedia === "string" && rawMedia.trim().length > 0) return rawMedia.trim();
  return "";
};

interface LockScreenMetadata {
  title: string;
  artist: string;
  albumTitle: string;
  artworkUrl?: string;
}

const buildLockScreenMetadata = (track?: IChapter | null): LockScreenMetadata | null => {
  if (!track) return null;

  // Unpack nested track wrappers (e.g. content, book, data, item)
  const raw: any =
    (track as any).content && typeof (track as any).content === "object"
      ? (track as any).content
      : (track as any).book && typeof (track as any).book === "object"
      ? (track as any).book
      : track;

  const rawSeries = (track as any).series || raw.series;
  const seriesObj = rawSeries && typeof rawSeries === "object" ? rawSeries : null;
  const seriesTitle = seriesObj ? String(seriesObj.title || seriesObj.name || "").trim() : "";
  const seriesAuthor = seriesObj ? String(seriesObj.author || seriesObj.creator || "").trim() : "";

  const ownCover =
    (typeof raw.cover === "string" ? raw.cover : null) ||
    (typeof (track as any).cover === "string" ? (track as any).cover : null) ||
    (typeof raw.image === "string" ? raw.image : null) ||
    (typeof (track as any).image === "string" ? (track as any).image : null) ||
    (typeof raw.thumbnail === "string" ? raw.thumbnail : null) ||
    "";

  const seriesCover =
    seriesObj && typeof seriesObj.cover === "string"
      ? seriesObj.cover
      : seriesObj && typeof seriesObj.image === "string"
      ? seriesObj.image
      : "";

  const tocTitle = Array.isArray(raw.toc || (track as any).toc)
    ? String((raw.toc || (track as any).toc)[0]?.title || "").trim()
    : "";

  const candidateTitle =
    String(raw.title || (track as any).title || raw.name || (track as any).name || raw.chapterTitle || tocTitle || seriesTitle || "").trim();
  const title = candidateTitle || "Readapt Audio";

  const candidateAuthor =
    String(raw.author || (track as any).author || raw.creator || (track as any).creator || seriesAuthor || "").trim();
  const artist = candidateAuthor || (seriesTitle ? seriesTitle : "Readapt");

  const albumTitle = seriesTitle || String(raw.category?.name || raw.category || "Readapt Audio").trim();

  const metadata: LockScreenMetadata = {
    title,
    artist,
    albumTitle,
  };

  // Resolve cover artwork to a valid absolute HTTP/HTTPS URL
  const rawCoverCandidate = [ownCover, seriesCover]
    .find((c) => Boolean(c && typeof c === "string" && c.trim().length > 0))
    ?.trim() || "";
  let resolvedArtworkUrl: string | undefined = undefined;

  if (rawCoverCandidate) {
    if (/^https?:\/\//i.test(rawCoverCandidate)) {
      resolvedArtworkUrl = rawCoverCandidate;
    } else if (rawCoverCandidate.startsWith("//")) {
      resolvedArtworkUrl = `https:${rawCoverCandidate}`;
    } else if (rawCoverCandidate.startsWith("/")) {
      resolvedArtworkUrl = `${WEB_PORTAL_BASE}${rawCoverCandidate}`;
    } else if (rawCoverCandidate.startsWith("file://")) {
      resolvedArtworkUrl = rawCoverCandidate;
    }
  }

  if (resolvedArtworkUrl) {
    metadata.artworkUrl = resolvedArtworkUrl;
  }

  return metadata;
};

/**
 * Publishes the current track to the OS media session so Android shows its stock
 * MediaStyle playback notification and iOS fills the lock screen / control center
 * with the default system transport controls (play/pause + skip).
 */
const syncLockScreenControls = (
  player: AudioPlayer | null,
  track: IChapter | null,
  force = false
) => {
  if (!player || !track) return;
  const trackId = getTrackId(track);
  if (!trackId) return;

  const metadata = buildLockScreenMetadata(track);
  if (!metadata) return;

  const isAlreadyActiveOwner = lockScreenOwnerPlayer === player && lockScreenTrackId === trackId;

  if (!isAlreadyActiveOwner) {
    try {
      if (typeof (player as any).setActiveForLockScreen === "function") {
        (player as any).setActiveForLockScreen(true, metadata, LOCK_SCREEN_OPTIONS);
        lockScreenTrackId = trackId;
        lockScreenOwnerPlayer = player;
      }
    } catch (_) {}
  }

  try {
    if (typeof (player as any).updateLockScreenMetadata === "function") {
      (player as any).updateLockScreenMetadata(metadata);
    }
  } catch (_) {}
};

const refreshLockScreenMetadata = (track?: IChapter | null) => {
  const owner = lockScreenOwnerPlayer || globalPlayer;
  if (!track || !owner) return;
  const targetId = getTrackId(track);
  if (lockScreenTrackId && lockScreenTrackId !== targetId) return;

  const metadata = buildLockScreenMetadata(track);
  if (!metadata) return;

  try {
    if (typeof (owner as any).updateLockScreenMetadata === "function") {
      (owner as any).updateLockScreenMetadata(metadata);
    } else if (typeof (owner as any).setActiveForLockScreen === "function") {
      (owner as any).setActiveForLockScreen(true, metadata, LOCK_SCREEN_OPTIONS);
      lockScreenTrackId = targetId;
      lockScreenOwnerPlayer = owner;
    }
  } catch (_) {}
};

const clearLockScreenControls = (player?: AudioPlayer | null) => {
  const target = player || globalPlayer;
  const isOwner = !target || target === lockScreenOwnerPlayer;
  lockScreenTrackId = "";
  lockScreenOwnerPlayer = null;
  if (!target || !isOwner) return;
  try {
    if (typeof (target as any).clearLockScreenControls === "function") {
      (target as any).clearLockScreenControls();
    }
  } catch (_) {}
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
  if (active) {
    seekLockUntil = Date.now() + 86400000;
  } else {
    seekLockUntil = Date.now() + 2500;
  }
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
        if (lockScreenTrackId === oldest.trackId) clearLockScreenControls(oldest.player);
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

    // Keep the system media session attached to the active player/track so the
    // notification center + lock screen controls stay available while playing.
    if (isLoadedBool && !entry.lockScreenMetadataSynced) {
      entry.lockScreenMetadataSynced = true;
      syncLockScreenControls(entry.player, globalCurrentTrack, true);
    }

    // Once native playback actually started, stop treating our play() request as fresh.
    if (isLoadedBool && nativePlaying && now < playIntentLockUntil) {
      playIntentLockUntil = Math.min(playIntentLockUntil, now + 1200);
    }
    const intentIsFresh = now < playIntentLockUntil;

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
      targetSeekPosition = seekTarget;
      targetSeekTimestamp = now;
      seekLockUntil = now + 4000;
      playIntentLockUntil = now + 6000;
      try {
        void entry.player.seekTo(seekTarget);
        if (globalPlayIntent) {
          void entry.player.play();
        }
      } catch (_) {}
    }

    // Check if target seek has arrived at destination
    if (targetSeekPosition !== null) {
      const timeDiff = Math.abs(rawPosSec - targetSeekPosition);
      if (timeDiff < 1.5 || (now - targetSeekTimestamp > 4500)) {
        targetSeekPosition = null;
        seekLockUntil = now + 400;
        if (globalPlayIntent && isLoadedBool && !nativePlaying) {
          try { entry.player.play(); } catch (_) {}
        }
      }
    }

    const isSeekingInProgress = targetSeekPosition !== null || userScrubbing || now < seekLockUntil;

    // Play/pause that did not come from the app (notification, lock screen, headset
    // button) owns the state now; adopt it instead of resuming against the user.
    // ONLY adopt when seek/scrub is not in progress!
    if (
      isLoadedBool &&
      !bufferingBool &&
      !intentIsFresh &&
      !isSeekingInProgress &&
      globalPlayIntent !== nativePlaying
    ) {
      globalPlayIntent = nativePlaying;
    }

    if (
      globalPlayIntent &&
      isLoadedBool &&
      !nativePlaying &&
      !bufferingBool &&
      !userScrubbing &&
      (intentIsFresh || isSeekingInProgress)
    ) {
      try { entry.player.play(); } catch (_) {}
    }

    // Ignore native time updates if user is scrubbing or recently triggered a seek
    let resolvedTime = rawPosSec;
    if (targetSeekPosition !== null) {
      resolvedTime = targetSeekPosition;
    } else if (now < seekLockUntil || userScrubbing) {
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

  // If already playing this track on globalPlayer, just resume or seek
  if (globalPlayer && getTrackId(globalCurrentTrack) === trackId && hotPlayerPool.has(trackId)) {
    globalPlayIntent = true;
    playIntentLockUntil = Date.now() + 2000;
    updateGlobalStatus({ playing: true }, true);
    if (initialPositionSec > 0) void seekToInternal(initialPositionSec);
    try { globalPlayer.play(); } catch (_) {}
    syncLockScreenControls(globalPlayer, globalCurrentTrack);
    return;
  }

  // ⚡ Complete isolation: pause the old player and clear previous lock-screen controls immediately
  if (globalPlayer) {
    try {
      clearLockScreenControls(globalPlayer);
      globalPlayer.pause();
    } catch (_) {}
  }

  if (!remoteUrl) {
    console.warn("No audio media URL found for track:", trackId);
    updateGlobalStatus({
      isLoaded: false,
      playing: false,
      isBuffering: false,
      error: "Audio file unavailable",
    }, true);
    return;
  }

  // ⚡ Warm Player Reuse: If track already has an active player in pool with matching URL, activate it instantly
  const existingWarmEntry = hotPlayerPool.get(trackId);
  if (existingWarmEntry && existingWarmEntry.player) {
    if (existingWarmEntry.mediaUrl === remoteUrl) {
      globalPlayer = existingWarmEntry.player;
      globalCurrentTrack = track;
      globalPlayIntent = true;
      playIntentLockUntil = Date.now() + 6000;
      existingWarmEntry.lastUsedAt = Date.now();
      applyRateToPlayer(globalPlayer, globalPlaybackRate);
      applyVolumeToPlayer(globalPlayer, globalVolume);
      attachStatusListener(existingWarmEntry);

      updateGlobalStatus({
        isLoaded: true,
        playing: true,
        currentTime: initialPositionSec,
        duration: existingWarmEntry.durationSec || 0,
        isBuffering: false,
        playbackRate: globalPlaybackRate,
        volume: globalVolume,
        protocol: existingWarmEntry.protocol,
        error: null,
      }, true);

      if (initialPositionSec > 0) {
        pendingInitialSeekSec = initialPositionSec;
        void seekToInternal(initialPositionSec);
      }
      try { globalPlayer.play(); } catch (_) {}
      syncLockScreenControls(globalPlayer, globalCurrentTrack, true);
      return;
    } else {
      // Audio URL changed! Purge old warm player
      try {
        existingWarmEntry.subscription?.remove();
        existingWarmEntry.player.pause();
        if (typeof (existingWarmEntry.player as any).release === "function") (existingWarmEntry.player as any).release();
        else existingWarmEntry.player.remove();
      } catch (_) {}
      hotPlayerPool.delete(trackId);
    }
  }

  // Clean up any stale unlinked player entry for this trackId
  if (hotPlayerPool.has(trackId)) {
    const oldEntry = hotPlayerPool.get(trackId);
    try {
      oldEntry?.subscription?.remove();
      oldEntry?.player.pause();
      if (typeof (oldEntry?.player as any).release === "function") (oldEntry?.player as any).release();
      else oldEntry?.player.remove();
    } catch (_) {}
    hotPlayerPool.delete(trackId);
  }

  const loadToken = ++currentLoadToken;
  void ensureAudioSession();

  globalCurrentTrack = track;
  globalPlayIntent = true;
  playIntentLockUntil = Date.now() + 8000;
  
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

    const initialDurationSec = parseAnyDurationToSec(
      (track as any)?.duration || (track as any)?.audioDuration
    );

    const newEntry: HotPlayerEntry = {
      trackId, mediaUrl: remoteUrl, resolvedUri: playbackUri,
      protocol: isCached ? "local" : protocol,
      player, durationSec: initialDurationSec, lastUsedAt: Date.now(),
    };

    attachStatusListener(newEntry);
    hotPlayerPool.set(trackId, newEntry);
    enforceHotPoolLimit(trackId);

    pendingInitialSeekSec = initialPositionSec;
    player.play();

    // Hand the track to the OS so the system notification / lock screen controls appear
    syncLockScreenControls(player, track, true);
    
    // Delay background full-file caching by 6s so ExoPlayer's initial buffering & seeking
    // get 100% of the network bandwidth without competing against a parallel download.
    if (!isCached && protocol === "range-chunk") {
      setTimeout(() => {
        if (
          loadToken === currentLoadToken &&
          globalCurrentTrack &&
          getTrackId(globalCurrentTrack) === trackId
        ) {
          AudioCacheManager.cacheTrackInBackground(trackId, remoteUrl)
            .then(() => {
              if (globalCurrentTrack && getTrackId(globalCurrentTrack) === trackId) {
                updateGlobalStatus({ isCached: true }, true);
              }
            })
            .catch(() => {});
        }
      }, 6000);
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
  playIntentLockUntil = Date.now() + (globalPlayIntent ? 2000 : 600);
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

  targetSeekPosition = clamped;
  targetSeekTimestamp = Date.now();
  seekLockUntil = Date.now() + 5000;
  playIntentLockUntil = Date.now() + 8000;

  // Optimistic UI Update immediately so UI slider moves instantaneously
  updateGlobalStatus({ currentTime: clamped, isBuffering: true }, false);

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
  }, 50);
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
      clearLockScreenControls(active);
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
  if (!globalCurrentTrack) return;
  const curId = getTrackId(globalCurrentTrack);
  const newId = getTrackId(track as IChapter);
  if (!newId || !curId || curId === newId) {
    globalCurrentTrack = { ...globalCurrentTrack, ...track };
    refreshLockScreenMetadata(globalCurrentTrack);
    notifyStateListeners();
  }
};

export const useGlobalAudioActions = () => {
  const playTrack = useCallback((t: IChapter, sec?: number) => playTrackInternal(t, sec), []);
  const togglePlay = useCallback(() => togglePlayInternal(), []);
  const pause = useCallback(() => {
    globalPlayIntent = false;
    playIntentLockUntil = Date.now() + 600;
    globalPlayer?.pause();
    updateGlobalStatus({ playing: false }, true);
  }, []);
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