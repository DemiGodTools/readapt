import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useStreak } from "./useStreak";

const AFK_TIMEOUT_MS = 180000; // 3 minutes without touch before AFK pause (comfortable for reading full pages)
const BATCH_FLUSH_INTERVAL_MS = 15000; // Flush to streak tracker every 15 seconds
const MIN_VALID_FLUSH_SECONDS = 5; // Minimum 5 seconds before dispatching batch

interface ReadingTrackerOptions {
  isActive: boolean;
  isAudio?: boolean;
  isPlayingAudio?: boolean;
}

export const useReadingTracker = ({
  isActive,
  isAudio = false,
  isPlayingAudio = false,
}: ReadingTrackerOptions) => {
  const { recordReadingSeconds } = useStreak();

  const pendingSecondsRef = useRef(0);
  const lastInteractionTimeRef = useRef(Date.now());
  const lastAudioWallTimeRef = useRef(Date.now());
  const hasInteractedRef = useRef(!isAudio); // default true on entry
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isAudioPlayingRef = useRef(isPlayingAudio);
  isAudioPlayingRef.current = isPlayingAudio;

  // Sync accumulated seconds
  const flushSeconds = useCallback(async (force = false) => {
    const toFlush = pendingSecondsRef.current;
    if (toFlush >= (force ? 1 : MIN_VALID_FLUSH_SECONDS)) {
      pendingSecondsRef.current = 0;
      await recordReadingSeconds(toFlush, { inReader: true });
    }
  }, [recordReadingSeconds]);

  // Handle touch, scroll, drag, zoom
  const onUserActivity = useCallback(() => {
    lastInteractionTimeRef.current = Date.now();
    hasInteractedRef.current = true;
  }, []);

  // Handle page turn or scroll progression
  const onPageChange = useCallback((_newPage?: number) => {
    lastInteractionTimeRef.current = Date.now();
    hasInteractedRef.current = true;
    flushSeconds(true);
  }, [flushSeconds]);

  // Listen for App Background / Foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev === "active" && nextState.match(/inactive|background/)) {
        // App is minimizing / locking -> flush immediately
        lastAudioWallTimeRef.current = Date.now();
        flushSeconds(true);
      } else if (prev.match(/inactive|background/) && nextState === "active") {
        // App returned to foreground
        if (isAudio && isAudioPlayingRef.current) {
          const now = Date.now();
          const elapsed = Math.floor((now - lastAudioWallTimeRef.current) / 1000);
          // Credit background listening time if within reasonable bounds (1s to 2 hours)
          if (elapsed > 0 && elapsed <= 7200) {
            pendingSecondsRef.current += elapsed;
          }
        }
        lastAudioWallTimeRef.current = Date.now();
        lastInteractionTimeRef.current = Date.now();
        flushSeconds(true);
      }
    });

    return () => {
      sub.remove();
    };
  }, [flushSeconds, isAudio]);

  // Periodic heartbeat / 1-second counting loop
  useEffect(() => {
    if (!isActive) {
      flushSeconds(true);
      return;
    }

    lastAudioWallTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const isForeground = appStateRef.current === "active";

      if (isAudio) {
        // Audiobook: counts as long as audio is playing
        if (isPlayingAudio) {
          pendingSecondsRef.current += 1;
          lastAudioWallTimeRef.current = Date.now();
        }
      } else {
        // Reader: only counts in foreground and if user is actively reading
        if (!isForeground) return;

        const timeSinceLastTouch = Date.now() - lastInteractionTimeRef.current;
        const isNotAFK = timeSinceLastTouch <= AFK_TIMEOUT_MS;

        if (isNotAFK && hasInteractedRef.current) {
          pendingSecondsRef.current += 1;
        }
      }
    }, 1000);

    // Periodic flush to streak state
    const flushInterval = setInterval(() => {
      flushSeconds();
    }, BATCH_FLUSH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      clearInterval(flushInterval);
      flushSeconds(true);
    };
  }, [isActive, isAudio, isPlayingAudio, flushSeconds]);

  return {
    onUserActivity,
    onPageChange,
    flushSeconds,
  };
};

export default useReadingTracker;
