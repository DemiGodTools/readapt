import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  Animated,
  StyleSheet,
  PanResponder,
} from "react-native";
import Svg, { Path, Line } from "react-native-svg";
import { useGlobalAudio } from "../../hooks/useGlobalAudio";
import { navigationRef } from "../nav/MainNavigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SmoothAudioSlider from "./SmoothAudioSlider";

const colors = {
  bg: "rgba(15, 12, 25, 0.95)",
  accent: "#01796F",
  accentSoft: "#D0F2EE",
  accentDark: "#004D46",
  text: "#ffffff",
  textMuted: "#9ca3af",
  border: "rgba(255, 255, 255, 0.1)",
  glow: "rgba(1, 121, 111, 0.45)",
};

const TAB_ROUTES = ["Home", "Downloads", "Profile"];

export default function AudioControls() {
  const { status, player, currentTrack, togglePlay, seekTo, removeAllTracks } =
    useGlobalAudio();
  const insets = useSafeAreaInsets();
  const [currentScreen, setCurrentScreen] = useState("");

  // Dismiss animation & Pan Responder for swipe-to-dismiss
  const panY = useRef(new Animated.Value(0)).current;
  const isDismissingRef = useRef(false);

  useEffect(() => {
    if (!navigationRef.isReady()) {
      return;
    }

    const updateRoute = () => {
      const route = navigationRef.getCurrentRoute();
      setCurrentScreen((route as any)?.name ?? "");
    };

    updateRoute();
    const unsubscribe = navigationRef.addListener?.("state", updateRoute);
    return unsubscribe;
  }, []);

  const isTabScreen = TAB_ROUTES.includes(currentScreen);

  const dismissPlayer = useCallback(() => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    Animated.timing(panY, {
      toValue: 200,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      removeAllTracks();
      panY.setValue(0);
      isDismissingRef.current = false;
    });
  }, [panY, removeAllTracks]);

  // Swipe-down pan responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only claim if downward swipe and vertical movement dominates
        return (
          gestureState.dy > 8 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.3
        );
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 55 || gestureState.vy > 0.45) {
          dismissPlayer();
        } else {
          Animated.spring(panY, {
            toValue: 0,
            tension: 140,
            friction: 8,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, {
          toValue: 0,
          tension: 140,
          friction: 8,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // Scale animation for button presses
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animatePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start();
  };

  const animatePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start();
  };

  const seekRelative = useCallback(
    (delta: number) => {
      if (!status?.isLoaded || !status.duration) return;
      const next = Math.max(
        0,
        Math.min(status.duration, (status.currentTime || 0) + delta)
      );
      seekTo(next);
    },
    [status?.isLoaded, status?.duration, status?.currentTime, seekTo]
  );

  const handleOpenFullPlayer = useCallback(() => {
    if (!currentTrack || !navigationRef.isReady()) return;
    (navigationRef as any).navigate("AudioRdr", { bookId: currentTrack._id });
  }, [currentTrack]);

  // NEVER show mini-player on AudioRdr, Splash, or when no track is loaded
  if (!currentTrack || currentScreen === "Splash" || currentScreen === "AudioRdr") {
    return null;
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.wrapper,
        {
          bottom: isTabScreen ? insets.bottom + 75 : insets.bottom + 12,
          transform: [{ translateY: panY }, { scale: scaleAnim }],
        },
      ]}>
      {/* Swipe handle indicator */}
      <View style={styles.handleContainer}>
        <View style={styles.swipeHandle} />
      </View>

      <View style={styles.innerContent}>
        {/* Left cover image & title (tap to open AudioRdr) */}
        <Pressable
          style={styles.trackInfoPressable}
          onPress={handleOpenFullPlayer}
          onPressIn={animatePressIn}
          onPressOut={animatePressOut}>
          <View style={styles.coverWrap}>
            {currentTrack.cover ? (
              <Image source={{ uri: currentTrack.cover }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]} />
            )}
            <View style={styles.coverGlow} />
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

        {/* Media Controls */}
        <View style={styles.controlsRow}>
          {/* -10s */}
          <Pressable
            onPress={() => seekRelative(-10)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.controlBtn,
              pressed && styles.controlBtnPressed,
            ]}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"
                fill={colors.accentSoft}
              />
            </Svg>
          </Pressable>

          {/* Play / Pause Toggle */}
          <Pressable
            onPress={togglePlay}
            hitSlop={6}
            style={({ pressed }) => [
              styles.playBtn,
              status?.playing && styles.playBtnActive,
              pressed && styles.playBtnPressed,
            ]}>
            {status?.playing ? (
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill={colors.accentDark} />
              </Svg>
            ) : (
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M8 5v14l11-7z" fill={colors.accentDark} />
              </Svg>
            )}
          </Pressable>

          {/* +10s */}
          <Pressable
            onPress={() => seekRelative(10)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.controlBtn,
              pressed && styles.controlBtnPressed,
            ]}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                d="M13 6v12l8.5-6L13 6zM4 18l8.5-6L4 6v12z"
                fill={colors.accentSoft}
              />
            </Svg>
          </Pressable>

          {/* Close / Dismiss "X" Button */}
          <Pressable
            onPress={dismissPlayer}
            hitSlop={10}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && styles.closeBtnPressed,
            ]}>
            <Svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.textMuted}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round">
              <Line x1="18" y1="6" x2="6" y2="18" />
              <Line x1="6" y1="6" x2="18" y2="18" />
            </Svg>
          </Pressable>
        </View>
      </View>

      {/* Progress Slider at bottom */}
      <View style={styles.sliderWrapper}>
        <SmoothAudioSlider
          currentTime={status?.currentTime || 0}
          duration={status?.duration || 0}
          onSeek={seekTo}
          showTimeLabels={false}
          sliderStyle={styles.miniSlider}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor="rgba(255, 255, 255, 0.15)"
          thumbTintColor={colors.accentSoft}
          disabled={!status?.isLoaded}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bg,
    position: "absolute",
    left: 14,
    right: 14,
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: colors.border,
    shadowColor: colors.glow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
    overflow: "hidden",
    zIndex: 1500,
    paddingTop: 6,
  },
  handleContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 4,
  },
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
    paddingBottom: 8,
  },
  trackInfoPressable: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  coverWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  cover: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  coverPlaceholder: {
    backgroundColor: "#1e1a30",
  },
  coverGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(1, 121, 111, 0.15)",
  },
  trackDetails: {
    flex: 1,
    marginLeft: 10,
    justifyContent: "center",
  },
  trackTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  trackAuthor: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  controlBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnPressed: {
    backgroundColor: "rgba(1, 121, 111, 0.25)",
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnActive: {
    backgroundColor: "#B9D7D4",
  },
  playBtnPressed: {
    transform: [{ scale: 0.94 }],
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  closeBtnPressed: {
    backgroundColor: "rgba(235, 64, 64, 0.2)",
  },
  sliderWrapper: {
    height: 18,
    marginTop: -8,
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  miniSlider: {
    width: "100%",
    height: 18,
  },
});
