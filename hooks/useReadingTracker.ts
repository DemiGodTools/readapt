import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useStreak } from "./useStreak";

const BATCH_FLUSH_INTERVAL_MS = 10000; // Flush to streak tracker every 10 seconds
const MIN_VALID_FLUSH_SECONDS = 3; // Minimum 3 seconds before dispatching batch (1 when forced)

interface ReadingTrackerOptions {
  isActive: boolean;
  isAudio?: boolean;
  isPlayingAudio?: boolean;
}

/**
 * useReadingTracker
 * Continuously tracks time spent inside a reader session (PDF reader or Audio reader).
 * - No AFK timeouts or touch/swipe restrictions: as long as the reader is open, time accumulates into today's bucket.
 * - For PDF reader: counts continuously while the reader is active and app is in foreground.
 * - For Audio reader: counts continuously while the player is active in foreground, and credits background playback if audio is playing.
 */
export const useReadingTracker = ({
  isActive,
  isAudio = false,
  isPlayingAudio = false,
}: ReadingTrackerOptions) => {
  const { recordReadingSeconds } = useStreak();

  const pendingSecondsRef = useRef(0);
  const lastAudioWallTimeRef = useRef(Date.now());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isAudioPlayingRef = useRef(isPlayingAudio);
  isAudioPlayingRef.current = isPlayingAudio;

  // Sync accumulated seconds to streak state
  const flushSeconds = useCallback(
    async (force = false) => {
      const toFlush = pendingSecondsRef.current;
      if (toFlush >= (force ? 1 : MIN_VALID_FLUSH_SECONDS)) {
        pendingSecondsRef.current = 0;
        await recordReadingSeconds(toFlush, { inReader: true });
      }
    },
    [recordReadingSeconds]
  );

  // Backward-compatible user activity callbacks (no AFK check, so no-op)
  const onUserActivity = useCallback(() => {}, []);

  // Handle page turn or scroll progression -> flush accumulated progress
  const onPageChange = useCallback(
    (_newPage?: number) => {
      flushSeconds(true);
    },
    [flushSeconds]
  );

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
        flushSeconds(true);
      }
    });

    return () => {
      sub.remove();
    };
  }, [flushSeconds, isAudio]);

  // Periodic heartbeat / 1-second counting loop:
  // As long as reader is open, time increments without requiring any touch or swipe
  useEffect(() => {
    if (!isActive) {
      flushSeconds(true);
      return;
    }

    lastAudioWallTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const isForeground = appStateRef.current === "active";

      if (isAudio) {
        // Audio reader: counts if reader screen is active in foreground OR audio is playing
        if (isForeground || isPlayingAudio) {
          pendingSecondsRef.current += 1;
          lastAudioWallTimeRef.current = Date.now();
        }
      } else {
        // PDF / Book reader: counts continuously while reader screen is open in foreground (NO AFK)
        if (isForeground) {
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
