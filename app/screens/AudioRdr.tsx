import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Dimensions,
  StatusBar,
  Modal,
  Share,
  ActivityIndicator,
  DeviceEventEmitter,
  TouchableOpacity,
  FlatList,
  TextInput,
  BackHandler,
} from "react-native";
import Feather from "react-native-vector-icons/Feather";
import Svg, {
  Path,
  Line,
  Circle,
  Polyline,
  Polygon,
  Rect,
} from "react-native-svg";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import useAuth from "../../hooks/useAuth";
import { IS_EARLY_ACCESS_FREE, canUserAccessChapter } from "../../lib/entitlements";
import ContentCard from "../../components/props/ContentCard";
import CachedImage from "../../components/props/CachedImage";
import { IChapter } from "../../types/Chapter";
import PopButton from "../../components/props/PopButton";
import {
  useGlobalAudio,
  getTrackId,
  parseAnyDurationToSec,
  subscribeToPlaybackTime,
} from "../../hooks/useGlobalAudio";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Easing,
} from "react-native-reanimated";
import NextChapter from "../../components/props/NextChapter";
import FrameworkLevelProgress from "../../components/props/FrameworkLevelProgress";
import LevelCompletionModal from "../../components/props/LevelCompletionModal";
import { api } from "../../lib/api";
import {
  getCachedRelatedBooks,
  resolveRelatedStandaloneBooks,
} from "../../lib/relatedContent";
import RelatedContentSkelly from "../../components/props/RelatedContentSkelly";
import { getRecentReads, saveRecentReads } from "../../lib/userStorage";
import { useToast } from "../../hooks/useToast";
import { useUser } from "../../hooks/useUser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDownloads } from "../../hooks/useDownloads";
import CommentsDrawer from "../../components/props/Comments";
import Offline from "../../components/state/Offline";
import { useNetworkStatus } from "../../hooks/useNetwork";
import {
  checkIsDownloaded,
  getSingleDownloaded,
} from "../../lib/downloadManager";
import Carousel from "react-native-reanimated-carousel";
import { ISeries, ISeriesContent } from "../../types/Series";
import QuestionCard from "../../components/props/QuestionCard";
import { IQuestion } from "../../types/Question";
import SmoothAudioSlider, {
  triggerTactileHaptic,
} from "../../components/props/SmoothAudioSlider";

const colors = {
  bgMain: "#090314",
  bgCard: "rgba(20, 20, 20, 0.6)",
  accent: "#01796F",
  ctlPillBg: "#F4F6F6",
  ctlPillIcon: "#0D1313",
  ctlSkipBg: "#1E2626",
  ctlSkipIcon: "#E2E8E8",
  textGray: "#9ca3af",
  textWhite: "#ffffff",
  surfaceVariant: "rgba(255, 255, 255, 0.08)",
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DETAILS_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.58, 480);
const TOC_WIDTH = Math.min(SCREEN_WIDTH * 0.84, 340);
const SPEED_SHEET_HEIGHT = 400;

const DEMO_AUDIO_URL =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

type Props = {
  route: { params: { bookId: string } };
  navigation: any;
};

type LyricLine = { time: number; text: string };

const parseLyricTimestamp = (ts: string): number => {
  if (!ts) return -1;
  const clean = ts.trim().replace(/^\[|\]$/g, "");
  if (!clean.includes(":")) return -1;
  const parts = clean.split(":").map((p) => parseFloat(p.replace(",", ".")) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return -1;
};

const parseLyrics = (raw?: string | any): LyricLine[] => {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        let time = -1;
        if (typeof item.time === "number") time = item.time;
        else if (typeof item.start === "number") time = item.start;
        else if (typeof item.cut === "string") time = parseLyricTimestamp(item.cut);
        else if (typeof item.timestamp === "string") time = parseLyricTimestamp(item.timestamp);
        const text = (item.text || item.title || item.line || "").trim();
        if (!text) return null;
        return { time, text };
      })
      .filter((x): x is LyricLine => x !== null)
      .sort((a, b) => (a.time >= 0 && b.time >= 0 ? a.time - b.time : 0));
  }

  if (typeof raw !== "string") return [];

  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parseLyrics(parsed);
      }
    } catch (_) {}
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const timedLines: LyricLine[] = [];
  const untimedLines: string[] = [];

  // 1. WebVTT / SRT Detection & Parser
  const isVttOrSrt = lines.slice(0, 10).some((l) => l.toUpperCase().includes("WEBVTT") || /-->/.test(l));
  if (isVttOrSrt) {
    let currentStart = -1;
    for (const line of lines) {
      if (/^WEBVTT/i.test(line) || /^\d+$/.test(line) || /^NOTE/i.test(line)) continue;
      const arrowMatch = line.match(/((?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d+)?)\s*-->/);
      if (arrowMatch) {
        currentStart = parseLyricTimestamp(arrowMatch[1]);
        continue;
      }
      if (currentStart >= 0 && line.length > 0) {
        timedLines.push({ time: currentStart, text: line });
        currentStart = -1;
      }
    }
    if (timedLines.length > 0) {
      return timedLines.sort((a, b) => a.time - b.time);
    }
  }

  // 2. Standard LRC: Supports [00:00.000], [00:04.00], [01:02:03.450], [00:00:08], multi-timestamp lines
  const lrcHeaderRegex = /^(?:\[(?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d+)?\])+/;
  const tagRegex = /^\[([a-zA-Z]+):.*\]$/; // Skip [ar:Singer], [ti:Title] metadata

  for (const line of lines) {
    if (tagRegex.test(line)) continue;

    const headerMatch = line.match(lrcHeaderRegex);
    if (headerMatch) {
      const fullHeader = headerMatch[0];
      const restOfLine = line.slice(fullHeader.length).replace(/^[-–—:\s]+/, "").trim();
      const text = restOfLine || "";
      if (!text) continue;

      const singleTagRegex = /\[((?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d+)?)\]/g;
      let m;
      while ((m = singleTagRegex.exec(fullHeader)) !== null) {
        const time = parseLyricTimestamp(m[1]);
        if (time >= 0) {
          timedLines.push({ time, text });
        }
      }
      continue;
    }

    // Try unbracketed timestamp e.g. "00:15 - Intro" or "01:23 Intro"
    const noBracketMatch = line.match(/^((?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d+)?)\s*[-–—:]\s*(.*)$/);
    if (noBracketMatch) {
      const time = parseLyricTimestamp(noBracketMatch[1]);
      const text = noBracketMatch[2].trim();
      if (time >= 0 && text) {
        timedLines.push({ time, text });
        continue;
      }
    }

    untimedLines.push(line);
  }

  if (timedLines.length > 0) {
    return timedLines.sort((a, b) => a.time - b.time);
  }

  return untimedLines.map((text) => ({ time: -1, text }));
};

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
const formatSpeedLabel = (rate: number): string =>
  rate % 1 === 0 ? `${rate.toFixed(1)}x` : `${rate}x`;

const formatDurationStats = (totalSec: number): string => {
  if (!totalSec || isNaN(totalSec) || totalSec <= 0) return "--:--";
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

// ==========================================
// 3D COVER CARD (UI THREAD 120 FPS REANIMATED)
// ==========================================
const Interactive3DCoverCard = memo(
  ({
    coverUri,
    isLoading,
    style,
  }: {
    coverUri?: string;
    isLoading?: boolean;
    style?: any;
  }) => {
    const tiltX = useSharedValue(0);
    const tiltY = useSharedValue(0);
    const cardScale = useSharedValue(1);
    const glareOpacity = useSharedValue(0);

    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .onBegin(() => {
            "worklet";
            cardScale.value = withTiming(1.03, { duration: 120 });
            runOnJS(triggerTactileHaptic)("light");
          })
          .onUpdate((e) => {
            "worklet";
            const normY = Math.max(-1, Math.min(1, e.translationX / 120));
            const normX = Math.max(-1, Math.min(1, -e.translationY / 120));
            tiltX.value = normX;
            tiltY.value = normY;
            glareOpacity.value = Math.min(1, Math.hypot(normX, normY) * 0.35);
          })
          .onFinalize(() => {
            "worklet";
            tiltX.value = withTiming(0, { duration: 180 });
            tiltY.value = withTiming(0, { duration: 180 });
            cardScale.value = withTiming(1, { duration: 180 });
            glareOpacity.value = withTiming(0, { duration: 180 });
            runOnJS(triggerTactileHaptic)("light");
          }),
      [tiltX, tiltY, cardScale, glareOpacity]
    );

    const animatedCardStyle = useAnimatedStyle(() => {
      return {
        transform: [
          { perspective: 900 },
          { rotateX: `${tiltX.value * 24}deg` },
          { rotateY: `${tiltY.value * 24}deg` },
          { scale: cardScale.value },
        ],
      };
    });

    const animatedGlareStyle = useAnimatedStyle(() => ({
      opacity: glareOpacity.value,
    }));

    return (
      <View style={styles.fs3DCardStage}>
        <GestureDetector gesture={panGesture}>
          <Reanimated.View
            style={[style, styles.fs3DCardInner, animatedCardStyle]}
          >
            {coverUri ? (
              <CachedImage
                uri={coverUri}
                style={styles.fsCoverImg}
                transition={0}
                showInitial={false}
              />
            ) : (
              <View style={[styles.fsCoverImg, styles.coverPlaceholder]}>
                {isLoading && <ActivityIndicator color={colors.accent} />}
              </View>
            )}
            <Reanimated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                styles.card3DGlare,
                animatedGlareStyle,
              ]}
            />
          </Reanimated.View>
        </GestureDetector>
      </View>
    );
  }
);

// ==========================================
// PLAYBACK BUTTONS (ISOLATED GESTURES)
// ==========================================
// ==========================================
const PlaybackButtons = memo(
  ({
    skipBy,
    canSeek,
    currentTrack,
    source,
    playTrack,
    togglePlay,
    isPlaying,
  }: {
    skipBy: (amount: number) => void;
    canSeek: boolean;
    source: IChapter | null;
    playTrack: (source: IChapter) => void;
    currentTrack: any;
    togglePlay: () => void;
    isPlaying: boolean;
  }) => {
    const playPressAnim = useRef(new Animated.Value(0)).current;
    const leftSkipAnim = useRef(new Animated.Value(0)).current;
    const rightSkipAnim = useRef(new Animated.Value(0)).current;
    const playRippleScale = useRef(new Animated.Value(0.2)).current;
    const playRippleOpacity = useRef(new Animated.Value(0)).current;

    const triggerRipple = useCallback(
      (scaleVal: Animated.Value, opacityVal: Animated.Value) => {
        scaleVal.setValue(0.2);
        opacityVal.setValue(0.24);
        Animated.parallel([
          Animated.timing(scaleVal, {
            toValue: 2.3,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(opacityVal, {
            toValue: 0,
            duration: 320,
            useNativeDriver: true,
          }),
        ]).start();
      },
      []
    );

    const handlePlayAction = useCallback(() => {
      if (!source) return;
      triggerTactileHaptic("medium");
      triggerRipple(playRippleScale, playRippleOpacity);
      const isSameTrack =
        getTrackId(currentTrack) !== "" &&
        getTrackId(currentTrack) === getTrackId(source);
      if (isSameTrack) {
        togglePlay();
      } else {
        playTrack(source);
      }
    }, [
      source,
      currentTrack,
      togglePlay,
      playTrack,
      triggerRipple,
      playRippleScale,
      playRippleOpacity,
    ]);

    const onPlayPressIn = useCallback(
      () =>
        Animated.spring(playPressAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 7,
          tension: 240,
        }).start(),
      [playPressAnim]
    );
    const onPlayPressOut = useCallback(
      () =>
        Animated.spring(playPressAnim, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
          tension: 200,
        }).start(),
      [playPressAnim]
    );
    const onLeftPressIn = useCallback(() => {
      triggerTactileHaptic("light");
      Animated.spring(leftSkipAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 220,
      }).start();
    }, [leftSkipAnim]);
    const onLeftPressOut = useCallback(
      () =>
        Animated.spring(leftSkipAnim, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
          tension: 190,
        }).start(),
      [leftSkipAnim]
    );
    const onRightPressIn = useCallback(() => {
      triggerTactileHaptic("light");
      Animated.spring(rightSkipAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 220,
      }).start();
    }, [rightSkipAnim]);
    const onRightPressOut = useCallback(
      () =>
        Animated.spring(rightSkipAnim, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
          tension: 190,
        }).start(),
      [rightSkipAnim]
    );

    const playScaleX = useMemo(
      () =>
        playPressAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.08],
        }),
      [playPressAnim]
    );
    const playScaleY = useMemo(
      () =>
        playPressAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.95],
        }),
      [playPressAnim]
    );
    const playInnerScaleX = useMemo(
      () =>
        playPressAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.92],
        }),
      [playPressAnim]
    );
    const leftNeighborShift = useMemo(
      () =>
        playPressAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -6],
        }),
      [playPressAnim]
    );
    const rightNeighborShift = useMemo(
      () =>
        playPressAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 6],
        }),
      [playPressAnim]
    );
    const leftSkipScaleX = useMemo(
      () =>
        leftSkipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.1],
        }),
      [leftSkipAnim]
    );
    const leftSkipScaleY = useMemo(
      () =>
        leftSkipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.94],
        }),
      [leftSkipAnim]
    );
    const rightSkipScaleX = useMemo(
      () =>
        rightSkipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.1],
        }),
      [rightSkipAnim]
    );
    const rightSkipScaleY = useMemo(
      () =>
        rightSkipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.94],
        }),
      [rightSkipAnim]
    );
    const iconStroke = canSeek ? colors.ctlSkipIcon : "rgba(255,255,255,0.25)";

    return (
      <View style={styles.playbackButtonsRow}>
        <Pressable
          onPress={() => skipBy(-15)}
          onPressIn={onLeftPressIn}
          onPressOut={onLeftPressOut}
          hitSlop={8}
          disabled={!canSeek}
        >
          <Animated.View
            style={[
              styles.circleSkipBtn,
              {
                transform: [
                  { translateX: leftNeighborShift },
                  { scaleX: leftSkipScaleX },
                  { scaleY: leftSkipScaleY },
                ],
              },
            ]}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Polygon
                points="11,19 2,12 11,5"
                stroke={iconStroke}
                strokeWidth="2"
                strokeLinejoin="round"
                fill="none"
              />
              <Polygon
                points="22,19 13,12 22,5"
                stroke={iconStroke}
                strokeWidth="2"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={handlePlayAction}
          onPressIn={onPlayPressIn}
          onPressOut={onPlayPressOut}
          hitSlop={8}
          disabled={!source}
        >
          <Animated.View
            style={[
              styles.mainPlayBtn,
              { transform: [{ scaleX: playScaleX }, { scaleY: playScaleY }] },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.playRippleCircle,
                {
                  opacity: playRippleOpacity,
                  transform: [{ scale: playRippleScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.mainPlayInner,
                { transform: [{ scaleX: playInnerScaleX }] },
              ]}
            >
              {isPlaying ? (
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Rect
                    x="6"
                    y="5"
                    width="4.2"
                    height="14"
                    rx="1"
                    stroke={colors.ctlPillIcon}
                    strokeWidth="2.2"
                  />
                  <Rect
                    x="13.8"
                    y="5"
                    width="4.2"
                    height="14"
                    rx="1"
                    stroke={colors.ctlPillIcon}
                    strokeWidth="2.2"
                  />
                </Svg>
              ) : (
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Polygon
                    points="7,5 19,12 7,19"
                    stroke={colors.ctlPillIcon}
                    strokeWidth="2.2"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
              )}
              <Text style={styles.playBtnText}>
                {isPlaying ? "Pause" : "Play"}
              </Text>
            </Animated.View>
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={() => skipBy(15)}
          onPressIn={onRightPressIn}
          onPressOut={onRightPressOut}
          hitSlop={8}
          disabled={!canSeek}
        >
          <Animated.View
            style={[
              styles.circleSkipBtn,
              {
                transform: [
                  { translateX: rightNeighborShift },
                  { scaleX: rightSkipScaleX },
                  { scaleY: rightSkipScaleY },
                ],
              },
            ]}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Polygon
                points="2,19 11,12 2,5"
                stroke={iconStroke}
                strokeWidth="2"
                strokeLinejoin="round"
                fill="none"
              />
              <Polygon
                points="13,19 22,12 13,5"
                stroke={iconStroke}
                strokeWidth="2"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </Animated.View>
        </Pressable>
      </View>
    );
  }
);

// ==========================================
// CHAPTER DETAILS PANEL (DRAGGABLE SHEET)
// ==========================================
interface ChapterDetailsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  book: IChapter | null;
  durationSec: number;
}

const ChapterDetailsPanel = ({
  isOpen,
  onClose,
  book,
  durationSec,
}: ChapterDetailsPanelProps) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(DETAILS_SHEET_HEIGHT);

  useEffect(() => {
    if (isOpen) {
      translateY.value = withTiming(0, { duration: 200 });
    } else {
      translateY.value = withTiming(DETAILS_SHEET_HEIGHT, { duration: 160 });
    }
  }, [isOpen, translateY]);

  const handleClose = useCallback(() => {
    translateY.value = withTiming(
      DETAILS_SHEET_HEIGHT,
      { duration: 160 },
      () => {
        runOnJS(onClose)();
      }
    );
  }, [onClose, translateY]);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .onChange((event) => {
          if (event.translationY > 0) {
            translateY.value = event.translationY;
          }
        })
        .onEnd((event) => {
          if (event.translationY > 60 || event.velocityY > 400) {
            runOnJS(handleClose)();
          } else {
            translateY.value = withTiming(0, { duration: 140 });
          }
        }),
    [handleClose, translateY]
  );

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!isOpen) return null;

  const publishedDate = (book as any)?.createdAt
    ? new Date((book as any).createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Recent";

  const authorName =
    book?.author && book.author.trim() !== "" ? book.author : "Readapt Creator";

  const likesCount =
    typeof book?.likes === "number"
      ? book.likes
      : Array.isArray(book?.likes)
      ? (book?.likes as any).length
      : 0;

  const commentsCount =
    typeof book?.comments === "number"
      ? book.comments
      : Array.isArray(book?.comments)
      ? (book?.comments as any).length
      : 0;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.detailsBackdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
      <GestureDetector gesture={dragGesture}>
        <Reanimated.View
          style={[
            styles.detailsPanel,
            { paddingBottom: insets.bottom + 24 },
            animatedStyles,
          ]}
        >
          <View style={styles.dragHandle} />
          <Text style={styles.panelHeading} numberOfLines={1}>
            {book?.title || "Chapter Overview"}
          </Text>
          <View style={styles.authorRow}>
            <Text style={styles.authorLabel}>By</Text>
            <Text style={styles.authorNameVal}>{authorName}</Text>
          </View>
          <View style={styles.panelSRow}>
            <View style={styles.pItem}>
              <Text style={styles.pVal}>{formatDurationStats(durationSec)}</Text>
              <Text style={styles.pLabel}>Duration</Text>
            </View>
            <View style={styles.pDivider} />
            <View style={styles.pItem}>
              <Text style={styles.pVal}>{likesCount}</Text>
              <Text style={styles.pLabel}>Likes</Text>
            </View>
            <View style={styles.pDivider} />
            <View style={styles.pItem}>
              <Text style={styles.pVal}>{commentsCount}</Text>
              <Text style={styles.pLabel}>Comments</Text>
            </View>
            <View style={styles.pDivider} />
            <View style={styles.pItem}>
              <Text style={styles.pVal}>{publishedDate}</Text>
              <Text style={styles.pLabel}>Published</Text>
            </View>
          </View>
          <ScrollView
            style={styles.descScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.descTitle}>About this Chapter</Text>
            <Text style={styles.panelDescription}>
              {(book as any)?.details ||
                "No detailed description has been added for this chapter yet."}
            </Text>
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
};

// ==========================================
// DRAGGABLE SPEED SHEET WITH NATIVE MD3 SLIDER
// ==========================================
interface SpeedSheetProps {
  visible: boolean;
  onClose: () => void;
  currentRate: number;
  onSelectRate: (rate: number) => void;
}

const SpeedSheet = memo(
  ({ visible, onClose, currentRate, onSelectRate }: SpeedSheetProps) => {
    const insets = useSafeAreaInsets();
    const translateY = useSharedValue(SPEED_SHEET_HEIGHT);
    const trackWidth = Math.min(SCREEN_WIDTH - 80, 310);

    const activeIndex = useMemo(() => {
      let closest = 2; // Default 1.0x
      let minD = 999;
      SPEED_OPTIONS.forEach((r, i) => {
        const d = Math.abs(r - currentRate);
        if (d < minD) {
          minD = d;
          closest = i;
        }
      });
      return closest;
    }, [currentRate]);

    const thumbX = useSharedValue(
      (activeIndex / (SPEED_OPTIONS.length - 1)) * trackWidth
    );
    const isSliderDragging = useSharedValue(false);

    useEffect(() => {
      if (visible) {
        translateY.value = withTiming(0, { duration: 200 });
      } else {
        translateY.value = withTiming(SPEED_SHEET_HEIGHT, { duration: 160 });
      }
    }, [visible, translateY]);

    useEffect(() => {
      if (!isSliderDragging.value) {
        thumbX.value = withTiming(
          (activeIndex / (SPEED_OPTIONS.length - 1)) * trackWidth,
          { duration: 150 }
        );
      }
    }, [activeIndex, trackWidth, thumbX, isSliderDragging]);

    const handleClose = useCallback(() => {
      translateY.value = withTiming(SPEED_SHEET_HEIGHT, { duration: 160 }, () => {
        runOnJS(onClose)();
      });
    }, [onClose, translateY]);

    const sheetPanGesture = useMemo(
      () =>
        Gesture.Pan()
          .onChange((e) => {
            if (e.translationY > 0) {
              translateY.value = e.translationY;
            }
          })
          .onEnd((e) => {
            if (e.translationY > 60 || e.velocityY > 350) {
              runOnJS(handleClose)();
            } else {
              translateY.value = withTiming(0, { duration: 140 });
            }
          }),
      [handleClose, translateY]
    );

    const updateRateFromX = useCallback(
      (posX: number) => {
        const clampedX = Math.max(0, Math.min(trackWidth, posX));
        const ratio = clampedX / trackWidth;
        const nearestIdx = Math.round(ratio * (SPEED_OPTIONS.length - 1));
        const chosenRate = SPEED_OPTIONS[nearestIdx];
        if (Math.abs(chosenRate - currentRate) > 0.02) {
          triggerTactileHaptic("selection");
          onSelectRate(chosenRate);
        }
      },
      [trackWidth, currentRate, onSelectRate]
    );

    const sliderPanGesture = useMemo(
      () =>
        Gesture.Pan()
          .onBegin((e) => {
            "worklet";
            isSliderDragging.value = true;
            const clamped = Math.max(0, Math.min(trackWidth, e.x));
            thumbX.value = clamped;
            runOnJS(updateRateFromX)(e.x);
          })
          .onUpdate((e) => {
            "worklet";
            const clamped = Math.max(0, Math.min(trackWidth, e.x));
            thumbX.value = clamped;
            runOnJS(updateRateFromX)(e.x);
          })
          .onFinalize(() => {
            "worklet";
            isSliderDragging.value = false;
          }),
      [trackWidth, thumbX, isSliderDragging, updateRateFromX]
    );

    const animatedCardStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    const animatedThumb = useAnimatedStyle(() => ({
      transform: [{ translateX: thumbX.value - 14 }],
    }));

    const animatedActiveTrack = useAnimatedStyle(() => ({
      width: thumbX.value,
    }));

    if (!visible) return null;

    return (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { zIndex: 9999, elevation: 9999 },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.speedBackdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <GestureDetector gesture={sheetPanGesture}>
          <Reanimated.View
            style={[
              styles.speedSheetCard,
              { paddingBottom: insets.bottom + 24 },
              animatedCardStyle,
            ]}
          >
            <View style={styles.dragHandle} />
            <View style={styles.speedHeaderRow}>
              <Text style={styles.speedSheetTitle}>Playback Speed</Text>
              <View style={styles.speedBadge}>
                <Text style={styles.speedBadgeText}>
                  {formatSpeedLabel(currentRate)}
                  {currentRate === 1.0 ? " • Normal" : ""}
                </Text>
              </View>
            </View>

            {/* PERFECT MD3 SLIDER TRACK */}
            <View style={[styles.md3Container, { width: trackWidth }]}>
              <GestureDetector gesture={sliderPanGesture}>
                <View style={[styles.md3TrackWrap, { width: trackWidth }]}>
                  <View style={[styles.md3InactiveTrack, { width: trackWidth }]} />
                  <Reanimated.View
                    style={[styles.md3ActiveTrack, animatedActiveTrack]}
                  />

                  {/* Stopper Notches */}
                  {SPEED_OPTIONS.map((rate, i) => {
                    const leftPos =
                      (i / (SPEED_OPTIONS.length - 1)) * trackWidth;
                    const isPassed = i <= activeIndex;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.md3StopperDot,
                          { left: leftPos - 2 },
                          isPassed && styles.md3StopperDotPassed,
                        ]}
                      />
                    );
                  })}

                  {/* MD3 Active Thumb */}
                  <Reanimated.View
                    pointerEvents="none"
                    style={[styles.md3Thumb, animatedThumb]}
                  />
                </View>
              </GestureDetector>

              {/* Number Indications */}
              <View style={[styles.md3LabelsRow, { width: trackWidth }]}>
                {SPEED_OPTIONS.map((rate, i) => (
                  <Pressable
                    key={i}
                    onPress={() => {
                      triggerTactileHaptic("selection");
                      onSelectRate(rate);
                    }}
                  >
                    <Text
                      style={[
                        styles.md3LabelText,
                        i === activeIndex && styles.md3LabelTextActive,
                      ]}
                    >
                      {formatSpeedLabel(rate)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Quick Speed Preset Pills */}
            <View style={styles.speedOptionsGrid}>
              {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => {
                const isSelected = Math.abs(rate - currentRate) < 0.05;
                return (
                  <Pressable
                    key={rate}
                    style={[
                      styles.speedOptionPill,
                      isSelected && styles.speedOptionPillActive,
                    ]}
                    onPress={() => {
                      triggerTactileHaptic("selection");
                      onSelectRate(rate);
                    }}
                  >
                    <Text
                      style={[
                        styles.speedOptionText,
                        isSelected && styles.speedOptionTextActive,
                      ]}
                    >
                      {rate === 1.0 ? "Normal" : `${rate}x`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={styles.speedDoneBtn}
              onPress={() => {
                triggerTactileHaptic("light");
                handleClose();
              }}
            >
              <Text style={styles.speedDoneBtnText}>Done</Text>
            </Pressable>
          </Reanimated.View>
        </GestureDetector>
      </View>
    );
  }
);

// ==========================================
// DRAGGABLE TOC DRAWER (EXACT PDF VIEWER TRANSITION)
// ==========================================
interface TocDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  toc?: { title: string; cut: string }[];
  onSelectDuration: (durationSec: number) => void;
}

const TocDrawer = memo(
  ({ isOpen, onClose, toc, onSelectDuration }: TocDrawerProps) => {
    const insets = useSafeAreaInsets();
    const translateX = useSharedValue(TOC_WIDTH);

    useEffect(() => {
      if (isOpen) {
        translateX.value = withTiming(0, { duration: 200 });
      } else {
        translateX.value = withTiming(TOC_WIDTH, { duration: 180 });
      }
    }, [isOpen, translateX]);

    const handleClose = useCallback(() => {
      translateX.value = withTiming(TOC_WIDTH, { duration: 180 }, () => {
        runOnJS(onClose)();
      });
    }, [onClose, translateX]);

    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .onChange((event) => {
            if (event.translationX > 0) {
              translateX.value = event.translationX;
            }
          })
          .onEnd((event) => {
            if (event.translationX > 60 || event.velocityX > 350) {
              runOnJS(handleClose)();
            } else {
              translateX.value = withTiming(0, { duration: 140 });
            }
          }),
      [handleClose, translateX]
    );

    const animatedDrawerStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    if (!isOpen) return null;

    const items =
      toc && toc.length > 0
        ? toc.map((t) => ({ name: t.title, duration: t.cut }))
        : [
            { name: "Introduction", duration: "00:00" },
            { name: "The Ego Illusion", duration: "00:48" },
            { name: "Social Conditioning", duration: "01:36" },
            { name: "Emotional Discipline", duration: "02:32" },
          ];

    return (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { zIndex: 9999, elevation: 9999 },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.tocBackdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <GestureDetector gesture={panGesture}>
          <Reanimated.View
            style={[
              styles.tocSideSheet,
              {
                paddingTop: insets.top + 20,
                paddingBottom: insets.bottom + 20,
                width: TOC_WIDTH,
              },
              animatedDrawerStyle,
            ]}
          >
            <View style={styles.tocDragIndicator} />
            <Text style={styles.tocHeader}>TABLE OF CONTENTS</Text>
            <ScrollView
              style={styles.tocScrollView}
              contentContainerStyle={styles.tocChipsList}
              showsVerticalScrollIndicator={false}
            >
              {items.map((ch, i) => (
                <Pressable
                  key={i}
                  style={styles.tocChipCard}
                  onPress={() => {
                    triggerTactileHaptic("selection");
                    onSelectDuration(parseAnyDurationToSec(ch.duration));
                    handleClose();
                  }}
                >
                  <Text style={styles.chipChapterName} numberOfLines={2}>
                    {ch.name}
                  </Text>
                  <Text style={styles.chipDurationIndex}>{ch.duration}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Reanimated.View>
        </GestureDetector>
      </View>
    );
  }
);


// ==========================================
// MAIN COMPONENT: AudioPlayerScreen
// ==========================================
const AudioPlayerScreen = ({ route }: Props) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const chapterId = route?.params?.bookId;

  const {
    status,
    currentTrack,
    togglePlay,
    playTrack,
    seekTo,
    setPlaybackRate,
    preloadTrack,
    updateTrackMetadata,
  } = useGlobalAudio();

  // Instant Hydration on frame 0
  const isAlreadyActiveTrack = Boolean(
    chapterId &&
      currentTrack &&
      getTrackId(currentTrack) === chapterId
  );

  const initialData = (route?.params as any)?.initialBookData;
  const [showQnaNoticeToast, setShowQnaNoticeToast] = useState(
    Boolean((route?.params as any)?.showQnaRequirementToast)
  );

  const qnaToastY = useSharedValue(80);
  const qnaToastAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: qnaToastY.value }],
  }));

  useEffect(() => {
    if (showQnaNoticeToast) {
      qnaToastY.value = withTiming(0, { duration: 260 });
    }
  }, [showQnaNoticeToast]);

  const handleDismissQnaToast = useCallback(() => {
    qnaToastY.value = withTiming(80, { duration: 200 }, () => {
      runOnJS(setShowQnaNoticeToast)(false);
    });
  }, []);

  

  const [book, setBook] = useState<IChapter | null>(() => {
    if (isAlreadyActiveTrack && currentTrack) {
      return currentTrack as IChapter;
    }
    if (initialData && (initialData._id === chapterId || !chapterId)) {
      return initialData as IChapter;
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(() => !isAlreadyActiveTrack);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [showSpeedSheet, setShowSpeedSheet] = useState(false);
  const [showQnaModal, setShowQnaModal] = useState(false);
  const [showQnaComments, setShowQnaComments] = useState(false);
  const [isQnaLoading, setIsQnaLoading] = useState(false);
  const [seriesData, setSeriesData] = useState<ISeries | null>(null);
  const [relatedStandaloneBooks, setRelatedStandaloneBooks] = useState<any[]>([]);
  const [isRelatedLoading, setIsRelatedLoading] = useState(false);
  const relatedBookRef = useRef<any>(book);
  relatedBookRef.current = book;

  useEffect(() => {
    if (chapterId && (!book || book._id !== chapterId)) {
      if (initialData && (initialData._id === chapterId || !chapterId)) {
        setBook(initialData as IChapter);
      }
      lastAutoStartedBookIdRef.current = null;
    }
  }, [chapterId, initialData]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      setCurrentQnaIndex(viewableItems[0].index);
    }
  }).current;

  const { user, reload } = useUser();
  const markChapterQnaCompleted = useCallback(async (cId?: string) => {
    if (!cId) return;
    try {
      const storageKey = `@completed_qna_chapters_${(user as any)?._id || (user as any)?.userId || "guest"}`;
      const raw = await AsyncStorage.getItem(storageKey);
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(String(cId))) {
        list.push(String(cId));
        await AsyncStorage.setItem(storageKey, JSON.stringify(list));
        DeviceEventEmitter.emit("CHAPTER_QNA_COMPLETED", { chapterId: cId });
      }
    } catch {}
  }, [user]);
  const { isConnected } = useNetworkStatus();
  const [commentedQueId, setCommentedQueId] = useState("");
  const [questions, setQuestions] = useState<any[] | null>(null);
  const [currentQnaIndex, setCurrentQnaIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!chapterId) return;
    AsyncStorage.getItem(`@chapter_solved_qna_${chapterId}`)
      .then((raw) => {
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) {
            setSolvedIds(new Set(arr));
          }
        }
      })
      .catch(() => {});
  }, [chapterId]);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [userAnswersMap, setUserAnswersMap] = useState<Record<string, { selectedIndex: number; isCorrect: boolean }>>({});
  const [showComments, setShowComments] = useState(false);
  const [activeTranscriptionIndex, setActiveTranscriptionIndex] = useState(-1);
  const [isDetached, setIsDetached] = useState(false);
  const isUserScrollingRef = useRef(false);
  const lineLayoutsRef = useRef<{ [idx: number]: { y: number; height: number } }>({});
  const [lyricsContainerHeight, setLyricsContainerHeight] = useState(360);
  const lyricsContainerHeightRef = useRef(360);
  lyricsContainerHeightRef.current = lyricsContainerHeight;

  const fullscreenAnim = useSharedValue(0);

  useEffect(() => {
    navigation.setOptions({ headerShown: !showFullscreen });
    return () => {
      navigation.setOptions({ headerShown: true });
    };
  }, [navigation, showFullscreen]);

  useEffect(() => {
    if (showFullscreen) {
      fullscreenAnim.value = withTiming(1, {
        duration: 250,
        easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      });
    } else {
      fullscreenAnim.value = withTiming(0, {
        duration: 200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
    }
  }, [showFullscreen, fullscreenAnim]);

  const fullscreenAnimStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            fullscreenAnim.value,
            [0, 1],
            [SCREEN_HEIGHT + 60, 0]
          ),
        },
      ],
      opacity: interpolate(fullscreenAnim.value, [0, 0.05, 1], [0, 1, 1]),
    };
  });

  

  // Download Progress states
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadedRecently, setIsDownloadedRecently] = useState(false);

  const mainScrollRef = useRef<ScrollView>(null);
  const lyricsScrollRef = useRef<ScrollView>(null);
  const activeLineRef = useRef(-1);
  const lastAutoStartedBookIdRef = useRef<string | null>(
    isAlreadyActiveTrack ? chapterId : null
  );

  const lockMainScroll = useCallback((locked: boolean) => {
    mainScrollRef.current?.setNativeProps({ scrollEnabled: !locked });
  }, []);


  const isCurrentBookTrack =
    Boolean(book) && getTrackId(currentTrack) === getTrackId(book);
  const isPlaying = isCurrentBookTrack ? Boolean(status?.playing) : false;
  const isLoaded = isCurrentBookTrack ? Boolean(status?.isLoaded) : false;
  const fallbackDuration =
    parseAnyDurationToSec((book as any)?.duration) ||
    parseAnyDurationToSec((book as any)?.total);
  const durationSec =
    isCurrentBookTrack && (status?.duration || 0) > 0
      ? status.duration
      : fallbackDuration;
  const canSeek = Boolean(book) && (isLoaded || durationSec > 0);
  const currentRate = status?.playbackRate || 1.0;
  const speedLabel = formatSpeedLabel(currentRate);

  const currentTimeRef = useRef(0);

  // Robust Lyrics state: loads from DB string, JSON array, or remote URL
  const [rawLyricsText, setRawLyricsText] = useState<string>("");

  useEffect(() => {
    let isCancelled = false;
    const loadLyricsAsync = async () => {
      if (!book) {
        setRawLyricsText("");
        return;
      }
      const raw =
        book.lyrics ||
        book.transcript ||
        (book as any).lyrics ||
        (book as any).transcript ||
        (book as any).transcription ||
        (book as any).transcriptions ||
        (book as any).subtitles ||
        (book as any).lrc;

      if (!raw) {
        setRawLyricsText("");
        return;
      }

      if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          try {
            const res = await fetch(trimmed);
            const text = await res.text();
            if (!isCancelled) setRawLyricsText(text);
            return;
          } catch (e) {
            console.warn("Failed to fetch remote lyrics URL:", e);
          }
        }
        if (!isCancelled) setRawLyricsText(trimmed);
      } else if (Array.isArray(raw)) {
        if (!isCancelled) setRawLyricsText(JSON.stringify(raw));
      } else if (typeof raw === "object") {
        if (!isCancelled) setRawLyricsText(JSON.stringify(raw));
      }
    };

    loadLyricsAsync();
    return () => {
      isCancelled = true;
    };
  }, [book]);

  const transcriptions = useMemo(
    () => parseLyrics(rawLyricsText),
    [rawLyricsText]
  );

  const scrollToLineCenter = useCallback((idx: number, animated = true) => {
    if (idx < 0 || !lyricsScrollRef.current) return;
    const layout = lineLayoutsRef.current[idx];
    const containerH = lyricsContainerHeightRef.current > 0 ? lyricsContainerHeightRef.current : 260;
    let targetY = 0;
    if (layout && layout.height > 0) {
      const lineCenter = layout.y + layout.height / 2;
      targetY = Math.max(0, lineCenter - containerH / 2);
    } else {
      const topPad = lyricsContainerHeightRef.current > 0 ? Math.floor(lyricsContainerHeightRef.current / 2 - 20) : 120;
      const estLineH = 48;
      const lineCenter = topPad + idx * estLineH + estLineH / 2;
      targetY = Math.max(0, lineCenter - containerH / 2);
    }
    lyricsScrollRef.current?.scrollTo({ y: targetY, animated });
  }, []);

  const reSyncLyrics = useCallback(() => {
    triggerTactileHaptic("light");
    setIsDetached(false);
    isUserScrollingRef.current = false;
    const current = currentTimeRef.current || status?.currentTime || 0;
    let idx = -1;
    for (let i = 0; i < transcriptions.length; i++) {
      if (transcriptions[i].time !== -1 && transcriptions[i].time <= current + 0.15) {
        idx = i;
      } else if (transcriptions[i].time !== -1) {
        break;
      }
    }
    if (idx !== -1) {
      activeLineRef.current = idx;
      setActiveTranscriptionIndex(idx);
      scrollToLineCenter(idx, true);
    }
  }, [status?.currentTime, transcriptions, scrollToLineCenter]);

  // 3D Card Flip Animation (0 = Cover, 180 = Lyrics)
  const flipAnim = useSharedValue(0);

  const flipToLyrics = useCallback(() => {
    triggerTactileHaptic("light");
    setShowLyrics(true);
    flipAnim.value = withTiming(180, { duration: 380 });
  }, [flipAnim]);

  const flipToCover = useCallback(() => {
    triggerTactileHaptic("light");
    setShowLyrics(false);
    flipAnim.value = withTiming(0, { duration: 380 });
  }, [flipAnim]);

  const toggleLyricsFlip = useCallback(() => {
    if (showLyrics) {
      flipToCover();
    } else {
      flipToLyrics();
    }
  }, [showLyrics, flipToCover, flipToLyrics]);

  const handleBackAction = useCallback(() => {
    if (showSpeedSheet) {
      setShowSpeedSheet(false);
      return true;
    }
    if (showToc) {
      setShowToc(false);
      return true;
    }
    if (showQnaComments) {
      setShowQnaComments(false);
      setCommentedQueId("");
      return true;
    }
    if (showComments) {
      setShowComments(false);
      setCommentedQueId("");
      return true;
    }
    if (showQnaModal) {
      setShowQnaModal(false);
      return true;
    }
    if (showDetailsPanel) {
      setShowDetailsPanel(false);
      return true;
    }
    if (showFullscreen) {
      if (showLyrics) {
        flipToCover();
      } else {
        setShowFullscreen(false);
      }
      return true;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return true;
    }
    return false;
  }, [
    showSpeedSheet,
    showToc,
    showQnaComments,
    showComments,
    showQnaModal,
    showDetailsPanel,
    showFullscreen,
    showLyrics,
    flipToCover,
    navigation,
  ]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", handleBackAction);
    return () => sub.remove();
  }, [handleBackAction]);

  const frontCardStyle = useAnimatedStyle(() => {
    const rotateY = flipAnim.value;
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity: rotateY >= 90 ? 0 : 1,
      zIndex: rotateY < 90 ? 2 : 1,
    };
  });

  const backCardStyle = useAnimatedStyle(() => {
    const rotateY = flipAnim.value - 180;
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity: flipAnim.value < 90 ? 0 : 1,
      zIndex: flipAnim.value >= 90 ? 2 : 1,
    };
  });

  useEffect(() => {
    const unsub = subscribeToPlaybackTime((liveTime) => {
      if (isCurrentBookTrack) {
        currentTimeRef.current = liveTime;
      }
      if (!showLyrics || !transcriptions.length) return;
      let idx = -1;
      for (let i = 0; i < transcriptions.length; i++) {
        if (transcriptions[i].time !== -1 && transcriptions[i].time <= liveTime + 0.15) {
          idx = i;
        } else if (transcriptions[i].time !== -1) {
          break;
        }
      }
      if (idx !== -1 && idx !== activeLineRef.current) {
        activeLineRef.current = idx;
        setActiveTranscriptionIndex(idx);
        if (!isUserScrollingRef.current && !isDetached) {
          scrollToLineCenter(idx, true);
        }
      }
    });
    return unsub;
  }, [isCurrentBookTrack, showLyrics, transcriptions, isDetached, scrollToLineCenter]);

  useEffect(() => {
    if (showLyrics && transcriptions.length > 0) {
      setIsDetached(false);
      isUserScrollingRef.current = false;
      const current = currentTimeRef.current || status?.currentTime || 0;
      let idx = -1;
      for (let i = 0; i < transcriptions.length; i++) {
        if (transcriptions[i].time !== -1 && transcriptions[i].time <= current + 0.15) {
          idx = i;
        } else if (transcriptions[i].time !== -1) {
          break;
        }
      }
      if (idx !== -1) {
        activeLineRef.current = idx;
        setActiveTranscriptionIndex(idx);
        setTimeout(() => {
          scrollToLineCenter(idx, true);
        }, 180);
      }
    }
  }, [showLyrics, transcriptions, scrollToLineCenter]);

  const [isLiked, setIsLiked] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (user && user.likes && chapterId) {
      const isAlreadyLiked = user.likes.some((item: any) => {
        const id = typeof item === "string" ? item : item?._id;
        return id === chapterId;
      });
      setIsLiked(Boolean(isAlreadyLiked));
    }
  }, [user, chapterId]);

  // Fetch Questions from API
  const fetchQuestions = useCallback(async () => {
    if (!chapterId) return;
    setIsQnaLoading(true);
    try {
      const res = await api.get(`/question/by-chapter/${chapterId}`);
      if (res?.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setQuestions(res.data.data);
      } else if (res?.data?.questions && Array.isArray(res.data.questions) && res.data.questions.length > 0) {
        setQuestions(res.data.questions);
      } else if (Array.isArray(book?.questions) && book.questions.length > 0) {
        setQuestions(book.questions);
      }
    } catch (_) {
      if (Array.isArray(book?.questions) && book.questions.length > 0) {
        setQuestions(book.questions);
      }
    } finally {
      setIsQnaLoading(false);
    }
  }, [chapterId, book?.questions]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    if (!book || !book.series) return;
    const series: ISeries =
      typeof book.series === "object" ? (book.series as any) : null;
    if (!series || !series.chapters) return;

    const contents = series.chapters || [];
    const chapterIndex = contents.findIndex(
      (item) => (item.content as any)?._id === book._id
    );
    if (chapterIndex !== -1) {
      for (let index = chapterIndex + 1; index < contents.length; index++) {
        const item = contents[index];
        if (
          item.contentModel === "Chapter" &&
          typeof item.content === "object" &&
          (item.content as any)?.media
        ) {
          preloadTrack(item.content as IChapter);
          break;
        }
      }
    }
  }, [book?._id, preloadTrack]);

  const { showToast } = useToast();
  const { downloadChapter, downloadStatuses } = useDownloads();

  const currentBookDownloadStatus = book?._id ? downloadStatuses[book._id] : undefined;
  useEffect(() => {
    if (currentBookDownloadStatus) {
      if (currentBookDownloadStatus.status === 'downloading') {
        setIsDownloading(true);
        setDownloadProgress(currentBookDownloadStatus.percent / 100);
      } else if (currentBookDownloadStatus.status === 'completed') {
        setIsDownloading(false);
        setIsDownloadedRecently(true);
        setDownloadProgress(1);
      }
    }
  }, [currentBookDownloadStatus]);

  const fetchChapter = useCallback(async () => {
    if (!chapterId) return;
    if (!isAlreadyActiveTrack) {
      setIsLoading(true);
    }
    try {
      let resolvedBook: IChapter | null = null;
      if (isConnected) {
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const chapter = await api.get(`/chapter/${chapterId}`, { headers });
        if (chapter.data?.data) {
          resolvedBook = chapter.data.data;
        } else if (chapter.data) {
          resolvedBook = chapter.data;
        }
      } else {
        const isDownloaded = await checkIsDownloaded(chapterId);
        if (!isDownloaded) {
          showToast({
            title: "You seem to be offline. Please connect to Internet",
          });
        }
        const downloaded = await getSingleDownloaded(chapterId);
        if (downloaded) resolvedBook = downloaded as any;
      }
      if (resolvedBook) {
        setBook(resolvedBook);
        if (isAlreadyActiveTrack || getTrackId(currentTrack) === getTrackId(resolvedBook)) {
          (updateTrackMetadata as any)?.(resolvedBook);
        }

        if (resolvedBook.series) {
          const rawSId =
            typeof (resolvedBook.series as any) === "object"
              ? (resolvedBook.series as any)?._id
              : resolvedBook.series;
          const cleanSId = String(rawSId || "").trim();
          if (
            cleanSId &&
            cleanSId !== "undefined" &&
            cleanSId !== "null" &&
            cleanSId !== "[object Object]" &&
            cleanSId.length >= 10
          ) {
            api
              .get(`/series/${cleanSId}`)
              .then((sRes) => {
                if (sRes?.data?.data) setSeriesData(sRes.data.data);
              })
              .catch(() => {});
          }
        }
      }
    } catch (error) {
      try {
        const downloaded = await getSingleDownloaded(chapterId);
        if (downloaded) setBook(downloaded as any);
      } catch (_) {}
    } finally {
      setIsLoading(false);
    }
  }, [chapterId, accessToken, isConnected, showToast, isAlreadyActiveTrack]);

  useEffect(() => {
    fetchChapter();
  }, [fetchChapter]);

  const lastSavedPlayRef = useRef<number | null>(null);
  useEffect(() => {
    if (!book || !book._id) return;
    if (lastAutoStartedBookIdRef.current === book._id) return;
    lastAutoStartedBookIdRef.current = book._id;
    let isCancelled = false;

    const startOrResumeAudio = async () => {
      const targetBook: IChapter = {
        ...book,
        media: book.media || DEMO_AUDIO_URL,
      };
      if (getTrackId(currentTrack) === getTrackId(targetBook)) return;

      let resumeSec = 0;
      try {
        const recentReads = await getRecentReads(user?._id || user?.userId);
        const existingRead = recentReads.find(
          (r) => r.content?._id === book._id
        );
        if (existingRead) {
          const parsed = parseInt(existingRead.readtill, 10);
          if (!isNaN(parsed) && parsed > 0) {
            resumeSec = parsed;
            lastSavedPlayRef.current = parsed;
          }
        }
      } catch (_) {}

      if (isCancelled) return;
      void playTrack(targetBook, resumeSec);
      void updateRecentReads(resumeSec);
    };

    startOrResumeAudio();
    return () => {
      isCancelled = true;
    };
  }, [book?._id, currentTrack, playTrack]);

  const seekToSec = useCallback(
    (sec: number) => {
      if (!canSeek) return;
      const maxDur = durationSec > 0 ? durationSec : Number.MAX_SAFE_INTEGER;
      const clamped = Math.max(0, Math.min(sec, maxDur));
      seekTo(clamped);
    },
    [canSeek, durationSec, seekTo]
  );

  const skipBy = useCallback(
    (deltaSec: number) => {
      seekToSec(currentTimeRef.current + deltaSec);
    },
    [seekToSec]
  );

  const resetInfo = () => {
    setIsLiked(false);
    setIsLoading(true);
    lastAutoStartedBookIdRef.current = null;
  };

  const updateRecentReads = useCallback(
    async (customPageVal?: number) => {
      if (!book || !book._id) return;
      const currentPageValue =
        customPageVal !== undefined
          ? customPageVal
          : Math.max(0, Math.floor(currentTimeRef.current));

      const realTotalDuration = Math.max(
        0,
        Math.floor(durationSec > 0 ? durationSec : fallbackDuration)
      );
      try {
        const recentReads = await getRecentReads(user?._id || user?.userId);
        const newRecentReads = recentReads.filter(
          (item) => item.content?._id !== book._id
        );
        newRecentReads.unshift({
          content: {
            ...book,
            comments:
              typeof book.comments === "number"
                ? book.comments
                : Array.isArray(book.comments)
                ? (book.comments as any).length
                : 0,
            category:
              (book.category as any)?.name ||
              (book.category as any)?._id ||
              book.category ||
              "",
          },
          readtill: String(currentPageValue),
          total: String(realTotalDuration),
          readAt: new Date().toISOString(),
        });
        await saveRecentReads(user?._id || user?.userId, newRecentReads);
        lastSavedPlayRef.current = currentPageValue;
      } catch (_) {}
    },
    [book, durationSec, fallbackDuration, user?._id, user?.userId]
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      void updateRecentReads();
    });
    return unsubscribe;
  }, [navigation, updateRecentReads]);

  // Deferred loading of related content for standalone audio books.
  // Cached per book, so collapsing to the mini player and opening the player
  // again keeps the row instead of wiping it and starting from zero.
  const relatedBookId = String((book as any)?._id || chapterId || "");
  const isRelatedSeriesBook = Boolean((book as any)?.series);
  const hasRelatedBook = Boolean((book as any)?._id);
  const relatedCategoryId = String(
    (book as any)?.category?._id || (book as any)?.category || ""
  );
  useEffect(() => {
    // Wait for the chapter document (it carries the category used for matching).
    if (!relatedBookId || !hasRelatedBook || isRelatedSeriesBook) {
      setRelatedStandaloneBooks([]);
      setIsRelatedLoading(false);
      return;
    }

    let isMounted = true;
    const cached = getCachedRelatedBooks(relatedBookId);
    if (cached && cached.length > 0) {
      setRelatedStandaloneBooks(cached);
      setIsRelatedLoading(false);
    } else {
      setRelatedStandaloneBooks([]);
      setIsRelatedLoading(true);
    }

    const timer = setTimeout(() => {
      resolveRelatedStandaloneBooks({
        book: relatedBookRef.current,
        accessToken,
        isConnected,
        onUpdate: (fresh) => {
          if (isMounted && fresh.length > 0) {
            setRelatedStandaloneBooks(fresh);
            setIsRelatedLoading(false);
          }
        },
      })
        .then((items) => {
          if (!isMounted) return;
          if (items.length > 0) setRelatedStandaloneBooks(items);
          setIsRelatedLoading(false);
        })
        .catch(() => {
          if (isMounted) setIsRelatedLoading(false);
        });
    }, 60);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    relatedBookId,
    hasRelatedBook,
    isRelatedSeriesBook,
    relatedCategoryId,
    accessToken,
    isConnected,
  ]);


  const isSeriesContent = Boolean((book as any)?.series || seriesData);
  const showStandaloneRelated =
    !isSeriesContent && (relatedStandaloneBooks.length > 0 || isRelatedLoading);

  const isFrameworkSeries = Boolean(
    (route?.params as any)?.isFramework ||
    (route?.params as any)?.seriesType === "framework" ||
    initialData?.seriesType === "framework" ||
    seriesData?.type === "framework" ||
    (book as any)?.series?.type === "framework" ||
    (book as any)?.seriesType === "framework"
  );

  const frameworkChapterList = useMemo(() => {
    return seriesData?.chapters?.filter((c: any) => c.contentModel === "Chapter") || [];
  }, [seriesData?.chapters]);

  const currentChapterIdx = useMemo(() => {
    if (frameworkChapterList.length === 0) return 0;
    const currentId = String((book as any)?._id || chapterId);
    const idx = frameworkChapterList.findIndex((item: any) => {
      const raw = item?.content;
      const cId = typeof raw === "object" ? String(raw?._id || raw?.id) : String(raw);
      return cId && cId === currentId;
    });
    return idx >= 0 ? idx : 0;
  }, [frameworkChapterList, (book as any)?._id, chapterId]);

  const currentLevelNum = currentChapterIdx + 1;
  const nextChapterItem = frameworkChapterList[currentChapterIdx + 1];
  const nextLevelRaw = nextChapterItem?.content;
  const nextLevelData: any = typeof nextLevelRaw === "object" ? nextLevelRaw : null;
  const nextLevelTitle = nextLevelData?.title || `Level ${currentLevelNum + 1}`;
  const hasNextLevel = Boolean(nextChapterItem);

  const isAllLevelsCompleted = Boolean(
    isFrameworkSeries &&
    frameworkChapterList.length > 0 &&
    currentChapterIdx === frameworkChapterList.length - 1
  );

  const levelsSummary = useMemo(() => {
    if (!frameworkChapterList.length) return [];
    return frameworkChapterList.map((item: any, idx: number) => {
      const c = typeof item?.content === "object" ? item.content : null;
      const isCurrent = idx === currentChapterIdx;
      let qCount = 0;
      let correct = 0;
      if (isCurrent && questions && questions.length > 0) {
        qCount = questions.length;
        correct = questions.reduce((acc: number, q: any) => {
          const userAns = userAnswersMap[q?._id || ""];
          return userAns !== undefined && userAns === q?.correctOption ? acc + 1 : acc;
        }, 0);
      } else {
        const prevQCount = Array.isArray(c?.questions) ? c.questions.length : 5;
        qCount = prevQCount;
        correct = prevQCount;
      }
      const accRate = qCount > 0 ? Math.round((correct / qCount) * 100) : 100;
      return {
        levelNumber: idx + 1,
        title: String(c?.title || `Level ${idx + 1}`),
        totalQuestions: qCount,
        correctCount: correct,
        accuracy: accRate,
      };
    });
  }, [frameworkChapterList, currentChapterIdx, questions, userAnswersMap]);

  const handleOpenNextLevel = useCallback(() => {
    if (!nextChapterItem) return;
    const nextRaw = nextChapterItem?.content;
    const nextData: any = typeof nextRaw === "object" ? nextRaw : null;
    const nextId = String(nextData?._id || nextData?.id || nextRaw);
    if (!nextId) return;

    const mediaType = nextData?.type || "audio";
    if (mediaType === "pdf") {
      (navigation as any).navigate("ReadBook", {
        bookId: nextId,
        initialBookData: nextData,
        isFramework: true,
        seriesType: "framework",
        seriesId: seriesData?._id || (route?.params as any)?.seriesId,
      });
    } else {
      updateRecentReads();
      (navigation as any).setParams({ bookId: nextId, initialBookData: nextData });
      resetInfo();
      setBook(nextData);
      const targetTrack = {
        ...nextData,
        media: nextData?.media || DEMO_AUDIO_URL,
      };
      void playTrack(targetTrack, 0);
    }
  }, [nextChapterItem, navigation, seriesData?._id, route?.params, updateRecentReads, playTrack]);

  const like = async () => {
    triggerTactileHaptic("medium");
    if (!isConnected) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }
    const currentLikes = typeof book?.likes === "number" ? book.likes : 0;
    const nextState = !isLiked;
    const resolvedLikes = nextState
      ? currentLikes + 1
      : Math.max(0, currentLikes - 1);
    setIsLiked(nextState);
    setBook((prev) => (prev ? { ...prev, likes: resolvedLikes } : prev));

    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.28,
        useNativeDriver: true,
        friction: 4,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
      }),
    ]).start();

    try {
      DeviceEventEmitter?.emit("like-updated", {
        chapterId,
        liked: nextState,
        count: resolvedLikes,
      });
    } catch (_) {}

    try {
      const res = await api.post(
        "/chapter/like",
        { chapterId },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res?.data?.success) {
        const serverLiked = Boolean(res.data.liked);
        const serverLikes =
          typeof res.data.likes === "number" ? res.data.likes : resolvedLikes;
        setIsLiked(serverLiked);
        setBook((prev) => (prev ? { ...prev, likes: serverLikes } : prev));
        reload().catch(() => {});
      }
    } catch (_) {
      setIsLiked(!nextState);
    }
  };

  const share = async () => {
    triggerTactileHaptic("light");
    await Share.share({ message: "https://play.google.com/store/apps" });
  };

  // Real download progress tracking (matching PDF viewer)
  const download = async () => {
    if (isDownloading) return;
    triggerTactileHaptic("light");
    if (!book || !user) return;
    if (!book?.isDownloadable) {
      showToast({ title: "This Chapter is not downloadable" });
      return;
    }
    if (!IS_EARLY_ACCESS_FREE && user?.subscription?.plan < 2) {
      showToast({
        title: "Please upgrade your plan to download this chapter",
      });
      return;
    }
    const isAlreadyDownloaded = await checkIsDownloaded(book._id);
    if (isAlreadyDownloaded) {
      showToast({ title: "This Chapter is already Downloaded" });
      return;
    }
    if (!isConnected) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      const uri = await downloadChapter(book);
      if (uri) {
        setIsDownloading(false);
        setIsDownloadedRecently(true);
        showToast({ title: "Audio downloaded" });
        setTimeout(() => {
          setIsDownloadedRecently(false);
          setDownloadProgress(0);
        }, 1500);
      } else {
        setIsDownloading(false);
        setDownloadProgress(0);
        showToast({ title: "Failed to download audio" });
      }
    } catch (e) {
      setIsDownloading(false);
      setDownloadProgress(0);
      showToast({ title: "Failed to download audio" });
    }
  };

  const likesCount = useMemo(() => {
    if (!book) return 0;
    if (typeof book.likes === "number") return book.likes;
    if (Array.isArray(book.likes)) return (book.likes as any).length;
    return 0;
  }, [book?.likes]);

  const commentsCount = useMemo(() => {
    if (!book) return 0;
    if (typeof book.comments === "number") return book.comments;
    if (Array.isArray(book.comments)) return (book.comments as any).length;
    return 0;
  }, [book?.comments]);

  if (!book && !isConnected) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: 100, alignItems: "center", justifyContent: "center" },
        ]}
      >
        <Offline />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Q&A COMPLETION REQUIREMENT STICKY TOAST (Dismissible Only Via ✕ Button) */}
      {showQnaNoticeToast && (
        <Reanimated.View
          style={[
            styles.qnaRequirementBanner,
            { bottom: insets.bottom + 16 },
            qnaToastAnimStyle,
          ]}
        >
          <View style={styles.qnaBannerIconWrap}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Circle cx="12" cy="12" r="10" stroke="#2dd4bf" strokeWidth={2} />
              <Line x1="12" y1="16" x2="12" y2="12" stroke="#2dd4bf" strokeWidth={2} strokeLinecap="round" />
              <Circle cx="12" cy="8" r="1" fill="#2dd4bf" />
            </Svg>
          </View>
          <Text style={styles.qnaBannerText}>
            Note: This chapter will only be marked as completed once you finish all the questions and answers (Q&A) at the end.
          </Text>
          <TouchableOpacity
            style={styles.qnaBannerCloseBtn}
            onPress={handleDismissQnaToast}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M18 6L6 18M6 6L18 18" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </Reanimated.View>
      )}

      <ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.playerContainer}>
          {/* AUDIO COVER CONTAINER */}
          <View style={styles.audioImg}>
            <Pressable
              onPress={() => {
                triggerTactileHaptic("light");
                setShowFullscreen(true);
              }}
              style={styles.coverGestureTarget}
            >
              {book?.cover ? (
                <CachedImage
                  uri={book.cover}
                  label={book?.title}
                  style={styles.coverImage}
                  letterSize={72}
                  priority="high"
                />
              ) : (
                <View style={[styles.coverImage, styles.coverPlaceholder]}>
                  {isLoading && <ActivityIndicator color={colors.accent} />}
                </View>
              )}
            </Pressable>

            {/* TOP BAR: CLEAN FULLSCREEN TRIGGER */}
            <View style={styles.coverTopBar} pointerEvents="box-none">
              <View />
              <Pressable
                style={styles.coverFloatingBtn}
                onPress={() => {
                  triggerTactileHaptic("light");
                  setShowFullscreen(true);
                }}
              >
                <Svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2"
                >
                  <Polyline points="15 3 21 3 21 9" />
                  <Polyline points="9 21 3 21 3 15" />
                  <Line x1="21" y1="3" x2="14" y2="10" />
                  <Line x1="3" y1="21" x2="10" y2="14" />
                </Svg>
              </Pressable>
            </View>

            {/* CONTROLS OVERLAY: INDEPENDENT SIBLING */}
            <View
              style={styles.mediaControlsOverlay}
              pointerEvents="box-none"
            >
              <View style={styles.timelineContainer}>
                <SmoothAudioSlider
                  currentTime={
                    isCurrentBookTrack ? status?.currentTime || 0 : 0
                  }
                  duration={durationSec}
                  onSeek={seekToSec}
                  disabled={!canSeek}
                  minimumTrackTintColor="#FFFFFF"
                  maximumTrackTintColor="rgba(255, 255, 255, 0.24)"
                  thumbTintColor="#FFFFFF"
                  active={!showFullscreen}
                  toc={book?.toc}
                />
              </View>

              <PlaybackButtons
                skipBy={skipBy}
                source={book}
                canSeek={canSeek}
                currentTrack={currentTrack}
                playTrack={playTrack}
                togglePlay={togglePlay}
                isPlaying={isPlaying}
              />
            </View>
          </View>

          <View style={styles.bookDetails}>
            <Text style={styles.bookTitle}>{book?.title || "Loading..."}</Text>
            <View style={styles.row}>
              <Text style={styles.bookAuthor}>
                by {book?.author || "Unknown"}
              </Text>
              <View style={styles.divider} />
              <Text style={styles.statItem}>{likesCount} likes</Text>
              <View style={styles.divider} />
              <Text style={styles.statItem}>{commentsCount} comments</Text>
            </View>

            {/* ACTION ROW: LIKE, COMMENT, SHARE, DOWNLOAD, QNA, DETAIL ICON */}
            <View style={styles.controlStatsBar}>
              <View style={styles.leftControlsGroup}>
                <Pressable style={styles.controlItem} onPress={like}>
                  <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                    <Svg
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      fill={isLiked ? "#eb4040" : "none"}
                      stroke={isLiked ? "#eb4040" : colors.textGray}
                      strokeWidth="2"
                    >
                      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </Svg>
                  </Animated.View>
                </Pressable>

                <Pressable
                  style={styles.controlItem}
                  onPress={() => {
                    triggerTactileHaptic("light");
                    setShowComments(true);
                  }}
                >
                  <Svg
                    width={20}
                    height={20}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={colors.textGray}
                    strokeWidth="2"
                  >
                    <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </Svg>
                </Pressable>

                <Pressable style={styles.controlItem} onPress={share}>
                  <Svg
                    width={20}
                    height={20}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={colors.textGray}
                    strokeWidth="2"
                  >
                    <Circle cx="18" cy="5" r="3" />
                    <Circle cx="6" cy="12" r="3" />
                    <Circle cx="18" cy="19" r="3" />
                    <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </Svg>
                </Pressable>

                {/* DOWNLOAD WITH CIRCULAR PROGRESS */}
                <Pressable style={styles.controlItem} onPress={download}>
                  {isDownloading ? (
                    <View style={styles.circularProgressWrapper}>
                      <Svg width={24} height={24} viewBox="0 0 24 24">
                        <Circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth="2.5"
                          fill="none"
                        />
                        <Circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke={colors.accent}
                          strokeWidth="2.5"
                          fill="none"
                          strokeDasharray={56.54}
                          strokeDashoffset={56.54 * (1 - downloadProgress)}
                          strokeLinecap="round"
                        />
                      </Svg>
                    </View>
                  ) : isDownloadedRecently ? (
                    <View style={styles.circularProgressWrapper}>
                      <Svg
                        width={22}
                        height={22}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#00D2B4"
                        strokeWidth="2.5"
                      >
                        <Polyline points="20 6 9 17 4 12" />
                      </Svg>
                    </View>
                  ) : (
                    <Svg
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={colors.textGray}
                      strokeWidth="2"
                    >
                      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <Polyline points="7 10 12 15 17 10" />
                      <Line x1="12" y1="15" x2="12" y2="3" />
                    </Svg>
                  )}
                </Pressable>
              </View>

              <View style={styles.rightActionsGroup}>
                {/* DETAIL ICON */}
                <PopButton
                  onPress={() => {
                    triggerTactileHaptic("light");
                    setShowDetailsPanel(true);
                  }}
                >
                  <View style={styles.controlItem}>
                    <Feather name="info" size={22} color="#9ca3af" />
                  </View>
                </PopButton>

                {/* QNA TAB BUTTON (PDF VIEWER STYLE) */}
                <PopButton
                  onPress={() => {
                    triggerTactileHaptic("light");
                    setShowQnaModal(true);
                  }}
                >
                  <View style={styles.controlItem}>
                    <Feather name="help-circle" size={22} color="#e5e7eb" />
                    {questions && questions.length > 0 ? (
                      <View style={styles.qnaCountBadge}>
                        <Text style={styles.qnaCountBadgeText}>
                          {questions.length}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </PopButton>
              </View>
            </View>
          </View>
        </View>

        {isFrameworkSeries ? (
          <FrameworkLevelProgress
            currentChapter={book}
            seriesData={seriesData}
            seriesId={
              typeof (book as any)?.series === "object"
                ? (book as any)?.series?._id
                : typeof (book as any)?.series === "string"
                ? (book as any).series
                : (route?.params as any)?.seriesId || undefined
            }
            questions={questions || undefined}
            onOpenQna={() => setShowQnaModal(true)}
            onOpenNextLevel={handleOpenNextLevel}
          />
        ) : isSeriesContent ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Next Chapters</Text>
            </View>
            {book && (
              <NextChapter
                book={book as any}
                onOpen={(nextBook: any) => {
                  updateRecentReads();
                  const nextId = String(nextBook?._id || nextBook?.id);
                  if (!nextId) return;
                  if (nextBook?.type === "pdf") {
                    (navigation as any).navigate("ReadBook", {
                      bookId: nextId,
                      initialBookData: nextBook,
                    });
                  } else {
                    navigation.setParams({ bookId: nextId, initialBookData: nextBook } as any);
                    resetInfo();
                    setBook(nextBook);
                    const targetTrack = {
                      ...nextBook,
                      media: nextBook.media || DEMO_AUDIO_URL,
                    };
                    void playTrack(targetTrack, 0);
                  }
                }}
                viewer="audio"
              />
            )}
          </View>
        ) : showStandaloneRelated ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Related Content</Text>
            </View>
            <View style={styles.relatedGrid}>
              {isRelatedLoading && relatedStandaloneBooks.length === 0 ? (
                <RelatedContentSkelly count={2} />
              ) : (
                relatedStandaloneBooks.map((relBook, idx) => (
                <TouchableOpacity
                  key={relBook._id || idx}
                  style={styles.relatedGridCardWrapper}
                  activeOpacity={0.88}
                  onPress={() => {
                    const accessCheck = canUserAccessChapter(
                      user,
                      relBook?.for ?? 0,
                      Date.now()
                    );
                    if (!accessCheck.allowed) {
                      showToast({
                        title:
                          accessCheck.reason ||
                          "Upgrade your subscription to access this content.",
                      });
                      return;
                    }
                    void updateRecentReads();
                    const isAudio = relBook?.type === "audio";
                    if (isAudio) {
                      const nextId = String(relBook._id || relBook.id);
                      navigation.setParams({ bookId: nextId, initialBookData: relBook } as any);
                      resetInfo();
                      setBook(relBook);
                      const targetTrack = {
                        ...relBook,
                        media: relBook.media || DEMO_AUDIO_URL,
                      };
                      void playTrack(targetTrack, 0);
                    } else {
                      (navigation as any).navigate("ReadBook", {
                        bookId: String(relBook._id),
                        initialBookData: relBook,
                      });
                    }
                  }}
                >
                  <View pointerEvents="none">
                    <ContentCard
                      book={relBook}
                      index={-1}
                      seriesType={"standalone" as any}
                    />
                  </View>
                </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* FULLSCREEN AUDIO PLAYER (120 FPS ZERO-LAG OVERLAY) */}
      <Reanimated.View
        pointerEvents={showFullscreen ? "auto" : "none"}
        style={[styles.fullscreenOverlayWrapper, fullscreenAnimStyle]}
      >
        <View style={styles.fullscreenOverlay}>
            {/* TOP BAR: BACK ARROW IF IN LYRICS FLIP, CLOSE CROSS IF IN COVER */}
            <Pressable
              style={[styles.fsCloseTrigger, { top: Math.max(insets.top + 10, 24) }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => {
                triggerTactileHaptic("light");
                if (showLyrics) {
                  flipToCover();
                } else {
                  setShowFullscreen(false);
                }
              }}
            >
              {showLyrics ? (
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.5"
                >
                  <Line x1="19" y1="12" x2="5" y2="12" />
                  <Polyline points="12 19 5 12 12 5" />
                </Svg>
              ) : (
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.5"
                >
                  <Line x1="18" y1="6" x2="6" y2="18" />
                  <Line x1="6" y1="6" x2="18" y2="18" />
                </Svg>
              )}
            </Pressable>

            {/* FULLSCREEN TOC TRIGGER */}
            <Pressable
              style={[styles.fsTocTrigger, { top: Math.max(insets.top + 10, 24) }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => {
                triggerTactileHaptic("light");
                setShowToc(true);
              }}
            >
              <Svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
              >
                <Line x1="8" y1="6" x2="21" y2="6" />
                <Line x1="8" y1="12" x2="21" y2="12" />
                <Line x1="8" y1="18" x2="21" y2="18" />
                <Circle cx="3" cy="6" r="1" fill="#fff" />
                <Path d="M3 10 v4" stroke="#fff" />
                <Circle cx="3" cy="18" r="1" fill="#fff" />
              </Svg>
            </Pressable>

            {/* FLIPPABLE 3D COVER & LYRICS STAGE */}
            <View style={styles.fullscreenCardStage}>
              {/* FRONT: 3D COVER CARD */}
              <Reanimated.View
                pointerEvents={showLyrics ? "none" : "auto"}
                style={[styles.flipCardFace, frontCardStyle]}
              >
                <Interactive3DCoverCard
                  coverUri={book?.cover}
                  isLoading={isLoading}
                  style={styles.fullscreenImage}
                />
              </Reanimated.View>

              {/* BACK: LYRICS CONTAINER (SAME STAGE, FLIPPED HORIZONTALLY) */}
              <Reanimated.View
                pointerEvents={showLyrics ? "auto" : "none"}
                style={[
                  styles.flipCardFace,
                  styles.lyricsCardBack,
                  backCardStyle,
                ]}
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  if (h > 0) setLyricsContainerHeight(h);
                }}
              >
                <View style={styles.lyricsCardHeader}>
                  <Text style={styles.lyricsCardTitle}>LYRICS</Text>
                </View>
                <ScrollView
                  ref={lyricsScrollRef}
                  style={styles.lyricsScroll}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    if (h > 0) {
                      setLyricsContainerHeight(h);
                      lyricsContainerHeightRef.current = h;
                    }
                  }}
                  contentContainerStyle={[
                    styles.lyricsScrollContent,
                    {
                      paddingTop: lyricsContainerHeight > 0 ? Math.floor(lyricsContainerHeight / 2 - 20) : 120,
                      paddingBottom: lyricsContainerHeight > 0 ? Math.floor(lyricsContainerHeight / 2 - 20) : 120,
                    },
                  ]}
                  showsVerticalScrollIndicator={false}
                  onScrollBeginDrag={() => {
                    isUserScrollingRef.current = true;
                    setIsDetached(true);
                  }}
                  onMomentumScrollBegin={() => {
                    isUserScrollingRef.current = true;
                    setIsDetached(true);
                  }}
                  onScrollEndDrag={() => {
                    isUserScrollingRef.current = false;
                  }}
                  onMomentumScrollEnd={() => {
                    isUserScrollingRef.current = false;
                  }}
                >
                  {transcriptions.length === 0 ? (
                    <View style={styles.emptyLyricsContainer}>
                      <Svg
                        width={36}
                        height={36}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="1.6"
                      >
                        <Path d="M9 18V5l12-2v13" />
                        <Circle cx="6" cy="18" r="3" />
                        <Circle cx="18" cy="16" r="3" />
                      </Svg>
                      <Text style={styles.emptyLyricsTitle}>
                        No Lyrics Available
                      </Text>
                      <Text style={styles.emptyLyricsSub}>
                        No synchronized lyrics or transcriptions have been added for this chapter yet.
                      </Text>
                    </View>
                  ) : (
                    transcriptions.map((line, i) => (
                      <View
                        key={`${line.time}-${i}`}
                        onLayout={(e) => {
                          lineLayoutsRef.current[i] = e.nativeEvent.layout;
                        }}
                      >
                        <PopButton
                          onPress={() => {
                            if (line.time >= 0) {
                              triggerTactileHaptic("selection");
                              seekToSec(line.time);
                              setIsDetached(false);
                              isUserScrollingRef.current = false;
                              scrollToLineCenter(i, true);
                            }
                          }}
                        >
                          <Text
                            style={[
                              styles.lyricsLine,
                              line.time !== -1 &&
                                i === activeTranscriptionIndex &&
                                styles.lyricsLineActive,
                            ]}
                          >
                            {line.text}
                          </Text>
                        </PopButton>
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* FLOATING SYNC BUTTON: RE-CENTERS ACTIVE LYRIC */}
                {isDetached && transcriptions.length > 0 && (
                  <View style={styles.floatingSyncContainer} pointerEvents="box-none">
                    <Pressable
                      style={styles.floatingSyncBtn}
                      onPress={reSyncLyrics}
                    >
                      <Svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0D1313"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <Path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                      </Svg>
                      <Text style={styles.floatingSyncText}>Sync to Audio</Text>
                    </Pressable>
                  </View>
                )}
              </Reanimated.View>
            </View>

            {/* FULLSCREEN CONTROLS: ALWAYS ACCESSIBLE AT BOTTOM */}
            <View style={styles.fullscreenControls} pointerEvents="box-none">
              <View style={styles.timelineContainer}>
                <SmoothAudioSlider
                  currentTime={
                    isCurrentBookTrack ? status?.currentTime || 0 : 0
                  }
                  duration={durationSec}
                  onSeek={seekToSec}
                  disabled={!canSeek}
                  minimumTrackTintColor="#FFFFFF"
                  maximumTrackTintColor="rgba(255, 255, 255, 0.24)"
                  thumbTintColor="#FFFFFF"
                  active={showFullscreen}
                  toc={book?.toc}
                />
              </View>

              <PlaybackButtons
                skipBy={skipBy}
                source={book}
                canSeek={canSeek}
                currentTrack={currentTrack}
                playTrack={playTrack}
                togglePlay={togglePlay}
                isPlaying={isPlaying}
              />

              <View style={styles.fsUtilitiesRow}>
                {/* SPEED BUTTON: OPENS MD3 SPEED SLIDER SHEET */}
                <Pressable
                  style={styles.speedBtn}
                  onPress={() => {
                    triggerTactileHaptic("light");
                    setShowSpeedSheet(true);
                  }}
                >
                  <Text style={styles.speedBtnText}>{speedLabel}</Text>
                </Pressable>

                {/* UNIFIED LYRICS TOGGLE BUTTON: FLIPS COVER <-> LYRICS */}
                <Pressable
                  style={[
                    styles.lyricsBtn,
                    showLyrics && styles.lyricsBtnActive,
                  ]}
                  onPress={toggleLyricsFlip}
                >
                  <Svg
                    width={22}
                    height={22}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={showLyrics ? "#ffffff" : colors.textGray}
                    strokeWidth="2"
                  >
                    <Line x1="4" y1="6" x2="20" y2="6" />
                    <Line x1="4" y1="12" x2="14" y2="12" />
                    <Line x1="4" y1="18" x2="18" y2="18" />
                  </Svg>
                </Pressable>
              </View>
            </View>

            {/* DRAGGABLE SPEED BOTTOM SHEET WITH MD3 SLIDER */}
            <SpeedSheet
              visible={showSpeedSheet}
              onClose={() => setShowSpeedSheet(false)}
              currentRate={currentRate}
              onSelectRate={(rate) => setPlaybackRate(rate)}
            />

            {/* DRAGGABLE TOC DRAWER (PDF VIEWER STYLE) */}
            <TocDrawer
              isOpen={showToc}
              onClose={() => setShowToc(false)}
              toc={book?.toc}
              onSelectDuration={seekToSec}
            />
          </View>
      </Reanimated.View>

      {/* FULLSCREEN QNA MODAL (PDF VIEWER STYLE) */}
      <Modal
        visible={showQnaModal}
        animationType="slide"
        transparent={false}
        onRequestClose={handleBackAction}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#08090a",
            paddingTop: insets.top + 8,
          }}
        >
          <View style={styles.qnaHeader}>
            <TouchableOpacity
              onPress={() => setShowQnaModal(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Svg
                width={28}
                height={28}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Polyline points="6 9 12 15 18 9" />
              </Svg>
            </TouchableOpacity>
          </View>

          {questions && questions.length > 0 && (
            <View style={styles.segmentedProgressContainer}>
              <View style={styles.progressTextRow}>
                <Text style={styles.progressTitle}>Question progress</Text>
                <Text style={styles.progressCount}>
                  {currentQnaIndex + 1} of {questions.length}
                </Text>
              </View>

              <View style={styles.segmentsRow}>
                {questions.map((q, i) => {
                  const isSolved = solvedIds.has(String(q?._id));
                  const isCurrent = i === currentQnaIndex;

                  let bgColor = "#374151";
                  if (isSolved) bgColor = "#34d399";
                  else if (isCurrent) bgColor = "#60a5fa";

                  return (
                    <View
                      key={`seg_${i}`}
                      style={[
                        styles.segmentPill,
                        { backgroundColor: bgColor },
                      ]}
                    />
                  );
                })}
              </View>

              <View style={styles.progressLegendsRow}>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: "#34d399" },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    Submitted {solvedIds.size}
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: "#60a5fa" },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    Current {currentQnaIndex + 1}
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: "#374151" },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    Unanswered{" "}
                    {Math.max(0, questions.length - solvedIds.size)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ flex: 1, justifyContent: "center" }}>
            {questions && questions.length > 0 ? (
              <FlatList
                data={questions}
                keyExtractor={(item: any, index: number) =>
                  item?._id ? String(item._id) : `q_${index}`
                }
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                renderItem={({
                  item,
                  index,
                }: {
                  item: any;
                  index: number;
                }) => {
                  if (
                    !item ||
                    typeof item !== "object" ||
                    !item._id ||
                    !item.question ||
                    !Array.isArray(item.options) ||
                    item.options.length === 0
                  ) {
                    return null;
                  }

                  return (
                    <View
                      style={{
                        width: SCREEN_WIDTH,
                        paddingHorizontal: 20,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{
                          paddingVertical: 10,
                          width: "100%",
                        }}
                        style={{ width: "100%" }}
                      >
                        <QuestionCard
                          question={item}
                          index={index}
                          total={questions.length}
                          qnaCommentCount={
                            Array.isArray((book as any)?.qnaComments)
                              ? (book as any).qnaComments.length
                              : 0
                          }
                          onCommentClick={() => {
                            setCommentedQueId(item._id);
                            setShowQnaComments(true);
                          }}
                          onAttempted={(isCorrect: boolean, selectedIndex?: number) => {
                            const qId = String(item._id);
                            setUserAnswersMap((prev) => ({
                              ...prev,
                              [qId]: {
                                selectedIndex: selectedIndex !== undefined ? selectedIndex : 0,
                                isCorrect,
                              },
                            }));
                            setSolvedIds((prev) => {
                              const next = new Set(prev);
                              next.add(qId);
                              AsyncStorage.setItem(
                                `@chapter_solved_qna_${chapterId}`,
                                JSON.stringify(Array.from(next))
                              ).catch(() => {});
                              if (questions && questions.length > 0 && next.size >= questions.length) {
                                markChapterQnaCompleted(chapterId);
                                setTimeout(() => {
                                  setShowCompletionModal(true);
                                }, 350);
                              }
                              return next;
                            });
                          }}
                        />
                      </ScrollView>
                    </View>
                  );
                }}
              />
            ) : isQnaLoading ? (
              <View style={styles.emptyQnaState}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.emptyQnaSub, { marginTop: 12 }]}>
                  Loading questions...
                </Text>
              </View>
            ) : (
              <View style={styles.emptyQnaState}>
                <Text style={styles.emptyQnaSub}>
                  No Q&A available for this chapter.
                </Text>
              </View>
            )}
          </View>
        </View>

        <CommentsDrawer
          visible={showQnaComments}
          reload={fetchChapter}
          onClose={() => setShowQnaComments(false)}
          chapterId={chapterId}
          initialComments={
            Array.isArray((book as any)?.qnaComments)
              ? ((book as any).qnaComments as any)
              : []
          }
          isQuestion={true}
        />
      </Modal>

      <LevelCompletionModal
        visible={showCompletionModal}
        onClose={() => {
          setShowCompletionModal(false);
          setShowQnaModal(false);
        }}
        onNextLevel={() => {
          setShowCompletionModal(false);
          setShowQnaModal(false);
          handleOpenNextLevel();
        }}
        contentType={
          isFrameworkSeries
            ? "framework"
            : (book as any)?.series || seriesData
            ? "series"
            : "standalone"
        }
        levelNumber={currentLevelNum}
        levelTitle={(book as any)?.title || `Level ${currentLevelNum}`}
        nextLevelNumber={currentLevelNum + 1}
        nextLevelTitle={nextLevelTitle}
        hasNextLevel={hasNextLevel}
        questions={questions || []}
        userAnswers={userAnswersMap}
        isAllLevelsCompleted={isAllLevelsCompleted}
        totalLevels={frameworkChapterList.length}
        levelsSummary={levelsSummary}
      />

      {/* CHAPTER DETAILS PANEL (DRAGGABLE SHEET) */}
      <ChapterDetailsPanel
        isOpen={showDetailsPanel}
        onClose={() => setShowDetailsPanel(false)}
        book={book}
        durationSec={durationSec}
      />

      <CommentsDrawer
        visible={showComments}
        reload={fetchChapter}
        onClose={() => setShowComments(false)}
        chapterId={chapterId}
        initialComments={
          Array.isArray(book?.comments) ? (book?.comments as any) : []
        }
      />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain, paddingTop: 95 },
  scrollContent: { paddingBottom: 60 },
  playerContainer: { padding: 16, paddingHorizontal: 24, gap: 16 },
  audioImg: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#12121c",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  coverGestureTarget: { width: "100%", height: "100%" },
  fs3DCardStage: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  fs3DCardInner: { width: "100%", height: "100%" },
  card3DGlare: { backgroundColor: "rgba(255, 255, 255, 0.16)" },
  coverImage: { width: "100%", height: "100%", resizeMode: "cover" },
  coverPlaceholder: {
    backgroundColor: "#181424",
    alignItems: "center",
    justifyContent: "center",
  },
  coverTopBar: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 15,
  },
  coverFloatingBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(5, 5, 10, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaControlsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    padding: 20,
    paddingTop: 28,
    backgroundColor: "rgba(9, 12, 14, 0.65)",
    zIndex: 14,
  },
  timelineContainer: { width: "100%", marginBottom: 16 },
  playbackButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    height: 64,
  },
  circleSkipBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ctlSkipBg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mainPlayBtn: {
    width: 158,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.ctlPillBg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mainPlayInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  playRippleCircle: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(13, 19, 19, 0.2)",
  },
  playBtnText: {
    fontWeight: "700",
    fontSize: 16,
    color: colors.ctlPillIcon,
  },
  bookDetails: { marginTop: 4 },
  bookTitle: {
    fontFamily: "Playfair Display",
    fontSize: 22,
    fontWeight: "600",
    color: colors.textWhite,
    marginBottom: 2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  bookAuthor: { fontSize: 13, color: colors.textGray },
  divider: {
    width: 3,
    height: 3,
    backgroundColor: colors.textGray,
    borderRadius: 50,
    opacity: 0.4,
  },
  statItem: { fontSize: 12, fontWeight: "600", color: colors.accent },
  controlStatsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 20,
  },
  leftControlsGroup: { flexDirection: "row", alignItems: "center", gap: 18 },
  rightActionsGroup: { flexDirection: "row", alignItems: "center", gap: 14 },
  detailActionBtn: { padding: 4 },
  controlItem: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  circularProgressWrapper: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  qnaCountBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#eb4040",
    alignItems: "center",
    justifyContent: "center",
  },
  qnaCountBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  section: { marginBottom: 40 },
  sectionHeader: { paddingHorizontal: 24, marginBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    color: "#e5e7eb",
  },
  relatedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    gap: 12,
  },
  relatedGridCardWrapper: {
    width: "48%",
    marginBottom: 8,
  },

  // FULLSCREEN OVERLAY & FLIP STAGE
  fullscreenOverlayWrapper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#050614",
    zIndex: 9999,
    elevation: 9999,
  },
  floatingSyncContainer: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    elevation: 50,
  },
  floatingSyncBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F6F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  floatingSyncText: {
    color: "#0D1313",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  fsCloseTrigger: {
    position: "absolute",
    top: 50,
    left: 24,
    backgroundColor: colors.surfaceVariant,
    borderRadius: 50,
    padding: 10,
    zIndex: 9999,
  },
  fsTocTrigger: {
    position: "absolute",
    top: 50,
    right: 24,
    backgroundColor: "rgba(5,5,5,0.9)",
    borderRadius: 50,
    padding: 10,
    zIndex: 9999,
  },
  fullscreenCardStage: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1,
    marginTop: 50,
    alignSelf: "center",
    position: "relative",
  },
  flipCardFace: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#100c1c",
  },
  fsCoverImg: { width: "100%", height: "100%", resizeMode: "cover" },

  // LYRICS CARD (FLIPPED BACK)
  lyricsCardBack: {
    backgroundColor: "#100c1c",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 18,
    overflow: "hidden",
  },
  lyricsCardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    paddingBottom: 8,
    marginBottom: 8,
  },
  lyricsCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: colors.accent,
    textAlign: "center",
  },
  lyricsScroll: { flex: 1 },
  lyricsScrollContent: { paddingHorizontal: 4 },
  lyricsLine: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(255,255,255,0.30)",
    lineHeight: 28,
    marginVertical: 10,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  lyricsLineActive: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 22,
    lineHeight: 32,
    textShadowColor: "rgba(255, 255, 255, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  emptyLyricsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 45,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyLyricsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  emptyLyricsSub: {
    fontSize: 12,
    color: colors.textGray,
    textAlign: "center",
    lineHeight: 18,
  },

  fullscreenControls: {
    width: "100%",
    marginTop: "auto",
    paddingBottom: 10,
    zIndex: 10,
    elevation: 10,
  },
  fsUtilitiesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    marginTop: 20,
  },
  speedBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    minWidth: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  speedBtnText: {
    color: colors.textGray,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  lyricsBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  lyricsBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  // TOC DRAWER (PDF VIEWER STYLE)
  tocBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    zIndex: 9999,
    elevation: 9999,
  },
  tocSideSheet: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,15,18,0.98)",
    paddingHorizontal: 20,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.12)",
    zIndex: 10000,
    elevation: 10000,
  },
  tocDragIndicator: {
    width: 4,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    position: "absolute",
    left: 8,
    top: "45%",
  },
  tocHeader: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.accent,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  tocScrollView: { flex: 1 },
  tocChipsList: { gap: 10 },
  tocChipCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chipChapterName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#e5e7eb",
    flex: 1,
    marginRight: 8,
  },
  chipDurationIndex: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    backgroundColor: "rgba(1,121,111,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // DETAILS PANEL STYLES
  detailsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    zIndex: 50,
  },
  detailsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: DETAILS_SHEET_HEIGHT,
    backgroundColor: "rgba(18, 18, 24, 0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
    elevation: 35,
    zIndex: 51,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 10,
    alignSelf: "center",
    position: "absolute",
    top: 10,
  },
  panelHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 8,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
  },
  authorLabel: { fontSize: 12, color: colors.textGray },
  authorNameVal: { fontSize: 13, fontWeight: "600", color: colors.accent },
  panelSRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 14,
  },
  pItem: { flexDirection: "column", alignItems: "center", gap: 4 },
  pVal: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
  pLabel: {
    fontSize: 10,
    color: colors.textGray,
    textTransform: "uppercase",
  },
  pDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  descScroll: { maxHeight: 150 },
  descTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  panelDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: "#d1d5db",
  },

  // SPEED SHEET STYLES WITH NATIVE MD3 SLIDER
  speedBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    zIndex: 9999,
    elevation: 9999,
  },
  speedSheetCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(18, 18, 24, 0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
    zIndex: 10000,
    elevation: 10000,
  },
  speedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 20,
  },
  speedSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  speedBadge: {
    backgroundColor: "rgba(1, 121, 111, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(1, 121, 111, 0.35)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  speedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent,
  },

  // MD3 Slider Styles
  md3Container: {
    alignSelf: "center",
    marginBottom: 20,
  },
  md3TrackWrap: {
    height: 36,
    justifyContent: "center",
    position: "relative",
  },
  md3InactiveTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  md3ActiveTrack: {
    position: "absolute",
    left: 0,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  md3StopperDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    top: 16,
  },
  md3StopperDotPassed: {
    backgroundColor: "#ffffff",
  },
  md3Thumb: {
    position: "absolute",
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: colors.accent,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  md3LabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  md3LabelText: {
    fontSize: 11,
    color: colors.textGray,
    fontWeight: "600",
  },
  md3LabelTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },

  speedOptionsGrid: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 20,
  },
  speedOptionPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  speedOptionPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  speedOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textGray,
  },
  speedOptionTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  speedDoneBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  speedDoneBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  // QNA MODAL STYLES (PDF VIEWER STYLE)
  qnaHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  segmentedProgressContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  progressTextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textWhite,
  },
  progressCount: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
  },
  segmentsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  segmentPill: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressLegendsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: colors.textGray,
  },
  emptyQnaState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyQnaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textWhite,
  },
  emptyQnaSub: {
    fontSize: 13,
    color: colors.textGray,
    textAlign: "center",
  },
  qnaRequirementBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#161d2d",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.35)",
    borderLeftWidth: 4,
    borderLeftColor: "#2dd4bf",
    zIndex: 99999,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  qnaBannerIconWrap: {
    marginRight: 10,
  },
  qnaBannerText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
  },
  qnaBannerCloseBtn: {
    padding: 4,
    marginLeft: 8,
  },
});

export default AudioPlayerScreen;
