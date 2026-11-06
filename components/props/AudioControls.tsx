import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from "react";
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from "react-native";
import Svg, { Polygon, Rect, Polyline } from "react-native-svg";
import {
  useGlobalAudio,
  parseAnyDurationToSec,
  subscribeToPlaybackTime,
} from "../../hooks/useGlobalAudio";
import { navigationRef } from "../nav/MainNavigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SmoothAudioSlider, { triggerTactileHaptic } from "./SmoothAudioSlider";
import CachedImage from "./CachedImage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const colors = {
  bg: "rgba(15, 18, 22, 0.96)",
  pillWhite: "#F4F6F6",
  pillDark: "#0D1313",
  skipBg: "#1E2626",
  text: "#ffffff",
  textMuted: "#9ca3af",
  border: "rgba(255, 255, 255, 0.1)",
};

const TAB_ROUTES = ["Home", "Categories", "Search", "Downloads", "Profile"];

const MiniPlayButton = memo(
  ({ playing, onToggle }: { playing: boolean; onToggle: () => void }) => {
    return (
      <Pressable
        onPress={() => {
          triggerTactileHaptic("medium");
          onToggle();
        }}
        style={styles.playBtn}
        hitSlop={6}
      >
        {playing ? (
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Rect x="6" y="5" width="4" height="14" rx="1" stroke={colors.pillDark} strokeWidth="2.2" />
            <Rect x="14" y="5" width="4" height="14" rx="1" stroke={colors.pillDark} strokeWidth="2.2" />
          </Svg>
        ) : (
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Polygon points="7,5 19,12 7,19" stroke={colors.pillDark} strokeWidth="2.2" fill="none" />
          </Svg>
        )}
      </Pressable>
    );
  }
);

export default memo(function AudioControls() {
  const { status, currentTrack, togglePlay, seekTo, removeAllTracks } = useGlobalAudio();
  const insets = useSafeAreaInsets();
  const [currentScreen, setCurrentScreen] = useState("");

  const panY = useSharedValue(0);
  const hasTriggeredOpen = useSharedValue(false);
  const isDismissingRef = useRef(false);
  const currentTimeRef = useRef(status?.currentTime || 0);

  useEffect(() => {
    const unsub = subscribeToPlaybackTime((liveTime: number) => {
      currentTimeRef.current = liveTime;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const updateRoute = () => {
      try {
        if (navigationRef?.isReady?.()) {
          const route = navigationRef.getCurrentRoute();
          const name = (route as any)?.name ?? "";
          setCurrentScreen((prev) => (prev !== name ? name : prev));
        }
      } catch (_) {}
    };

    updateRoute();
    const unsub = navigationRef?.addListener?.("state", updateRoute);
    return () => { unsub?.(); };
  }, []);

  const isTabScreen = TAB_ROUTES.includes(currentScreen);
  const effectiveDuration =
    status?.duration && status.duration > 0
      ? status.duration
      : parseAnyDurationToSec((currentTrack as any)?.duration) ||
        parseAnyDurationToSec((currentTrack as any)?.total);

  const handleOpenFullPlayer = useCallback(() => {
    if (!currentTrack || !navigationRef?.isReady?.()) return;
    triggerTactileHaptic("light");
    (navigationRef as any).navigate("AudioRdr", { bookId: currentTrack._id });
  }, [currentTrack]);

  const dismissPlayer = useCallback(() => {
    triggerTactileHaptic("medium");

    panY.value = withTiming(300, { duration: 150 }, (finished) => {
      if (finished) {
        runOnJS(removeAllTracks)();
      }
    });

    setTimeout(() => {
      removeAllTracks();
      panY.value = 0;
    }, 180);
  }, [panY, removeAllTracks]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetY([-12, 12])
      .failOffsetX([-24, 24])
      .onBegin(() => {
        "worklet";
        hasTriggeredOpen.value = false;
      })
      .onUpdate((e) => {
        "worklet";
        if (e.translationY > 0) {
          panY.value = e.translationY;
        } else if (e.translationY < 0) {
          panY.value = Math.max(-100, e.translationY);
          if (e.translationY < -24 && !hasTriggeredOpen.value) {
            hasTriggeredOpen.value = true;
            runOnJS(handleOpenFullPlayer)();
          }
        }
      })
      .onFinalize((e) => {
        "worklet";
        if (e.translationY > 30 || e.velocityY > 240) {
          runOnJS(dismissPlayer)();
        } else if (!hasTriggeredOpen.value && (e.translationY < -18 || e.velocityY < -250)) {
          hasTriggeredOpen.value = true;
          runOnJS(handleOpenFullPlayer)();
          panY.value = withTiming(0, { duration: 80 });
        } else {
          panY.value = withTiming(0, { duration: 140 });
        }
      });
  }, [panY, hasTriggeredOpen, dismissPlayer, handleOpenFullPlayer]);

  const seekRelative = useCallback(
    (delta: number) => {
      const maxDur = effectiveDuration > 0 ? effectiveDuration : Number.MAX_SAFE_INTEGER;
      triggerTactileHaptic("light");
      const next = Math.max(0, Math.min(maxDur, currentTimeRef.current + delta));
      seekTo(next);
    },
    [effectiveDuration, seekTo]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panY.value }],
  }));

  if (!currentTrack || currentScreen === "Splash" || currentScreen === "AudioRdr") {
    return null;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Reanimated.View
        style={[
          styles.wrapper,
          { bottom: isTabScreen ? insets.bottom + 75 : insets.bottom + 12 },
          animatedStyle,
        ]}
      >
        <View style={styles.handleContainer}>
          <View style={styles.swipeHandle} />
        </View>
        <View style={styles.innerContent}>
          <Pressable style={styles.trackInfoPressable} onPress={handleOpenFullPlayer}>
            <View style={styles.coverWrap}>
              {currentTrack.cover ? (
                <CachedImage
                  uri={currentTrack.cover}
                  label={currentTrack.title}
                  style={styles.cover}
                  transition={0}
                  letterSize={14}
                />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]} />
              )}
            </View>
            <View style={styles.trackDetails}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {currentTrack.title || "Audio"}
              </Text>
              <Text style={styles.trackAuthor} numberOfLines={1}>
                {currentTrack.author || "Readapt"}
              </Text>
            </View>
          </Pressable>

          <View style={styles.controlsRow}>
            <Pressable onPress={() => seekRelative(-10)} style={styles.controlBtn} hitSlop={6}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Polygon points="11,19 2,12 11,5" stroke="#E2E8E8" strokeWidth="2" strokeLinejoin="round" fill="none" />
                <Polygon points="22,19 13,12 22,5" stroke="#E2E8E8" strokeWidth="2" strokeLinejoin="round" fill="none" />
              </Svg>
            </Pressable>

            <MiniPlayButton playing={Boolean(status?.playing)} onToggle={togglePlay} />

            <Pressable onPress={() => seekRelative(10)} style={styles.controlBtn} hitSlop={6}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Polygon points="2,19 11,12 2,5" stroke="#E2E8E8" strokeWidth="2" strokeLinejoin="round" fill="none" />
                <Polygon points="13,19 22,12 13,5" stroke="#E2E8E8" strokeWidth="2" strokeLinejoin="round" fill="none" />
              </Svg>
            </Pressable>

            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                dismissPlayer();
              }}
              style={styles.closeBtn}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="6 9 12 15 18 9" />
              </Svg>
            </Pressable>
          </View>
        </View>

        <View style={styles.sliderWrapper}>
          <SmoothAudioSlider
            currentTime={status?.currentTime || 0}
            duration={effectiveDuration}
            onSeek={seekTo}
            showTimeLabels={false}
            mini
            minimumTrackTintColor="#FFFFFF"
            maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
            thumbTintColor="#FFFFFF"
            disabled={effectiveDuration <= 0 && !status?.isLoaded}
            toc={currentTrack?.toc}
          />
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bg,
    position: "absolute",
    left: 14,
    right: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    zIndex: 1500,
    paddingTop: 6,
    paddingBottom: 6,
  },
  handleContainer: { alignItems: "center", paddingBottom: 4 },
  swipeHandle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  innerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  trackInfoPressable: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  coverWrap: { width: 44, height: 44, borderRadius: 12, overflow: "hidden" },
  cover: { width: "100%", height: "100%" },
  coverPlaceholder: { backgroundColor: "#1e1a30" },
  trackDetails: { flex: 1, marginLeft: 10 },
  trackTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  trackAuthor: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  controlBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.skipBg,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 48,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.pillWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  sliderWrapper: { paddingHorizontal: 12 },
});