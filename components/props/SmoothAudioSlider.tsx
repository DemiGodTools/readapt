import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { View, TextInput, StyleSheet, ViewStyle, TextStyle, LayoutChangeEvent, Vibration } from "react-native";
import { subscribeToPlaybackTime, parseAnyDurationToSec, setUserScrubbingActive } from "../../hooks/useGlobalAudio";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, clamp } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

let Haptics: any = null;
try { Haptics = require("expo-haptics"); } catch (_) {}

export const triggerTactileHaptic = (type: "light" | "medium" | "selection" = "light") => {
  try {
    if (Haptics) {
      if (type === "selection") Haptics.selectionAsync();
      else if (type === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    Vibration.vibrate(type === "medium" ? 12 : 6);
  } catch (_) {}
};

export const formatTime = (sec = 0) => {
  if (isNaN(sec) || sec < 0 || !isFinite(sec)) return "0:00";
  const totalSec = Math.floor(sec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

interface SmoothAudioSliderProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  style?: ViewStyle;
  sliderStyle?: ViewStyle;
  showTimeLabels?: boolean;
  timeTextStyle?: TextStyle;
  timeRowStyle?: ViewStyle;
  mini?: boolean;
  active?: boolean;
  toc?: any;
}

export const SmoothAudioSlider = memo(({
  currentTime, duration, onSeek, disabled = false,
  minimumTrackTintColor = "#FFFFFF", maximumTrackTintColor = "rgba(255, 255, 255, 0.24)",
  thumbTintColor = "#FFFFFF", style, sliderStyle, showTimeLabels = true,
  timeTextStyle, timeRowStyle, mini = false, active = true, toc,
}: SmoothAudioSliderProps) => {
  const [liveDuration, setLiveDuration] = useState<number>(duration > 0 ? duration : 0);

  useEffect(() => {
    if (duration > 0 && Math.abs(duration - liveDuration) > 0.5) {
      setLiveDuration(duration);
    }
  }, [duration]);

  const parsedTocList = useMemo(() => {
    if (!toc) return [];
    if (Array.isArray(toc)) return toc;
    if (typeof toc === "string" && toc.trim().length > 0) {
      try {
        const parsed = JSON.parse(toc.trim());
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {}
    }
    return [];
  }, [toc]);

  const maxTocSec = useMemo(() => {
    let maxS = 0;
    for (const item of parsedTocList) {
      if (!item || typeof item !== "object") continue;
      const rawCut =
        item.cut !== undefined
          ? item.cut
          : item.time !== undefined
          ? item.time
          : item.timestamp !== undefined
          ? item.timestamp
          : item.start !== undefined
          ? item.start
          : item.duration;
      if (rawCut !== undefined && rawCut !== null) {
        const s = parseAnyDurationToSec(rawCut);
        if (!isNaN(s) && s > maxS) maxS = s;
      }
    }
    return maxS;
  }, [parsedTocList]);

  const effDuration = useMemo(() => {
    const rawDur = liveDuration > 0 ? liveDuration : duration > 0 ? duration : 0;
    if (rawDur > 0) {
      return Math.max(rawDur, maxTocSec > 0 ? maxTocSec * 1.02 : 0);
    }
    return Math.max(currentTime || 0, maxTocSec > 0 ? maxTocSec * 1.05 : 180);
  }, [liveDuration, duration, maxTocSec, currentTime]);

  const safeCurrentTime = Math.max(0, Math.min(currentTime || 0, effDuration));

  const tocPoints = useMemo(() => {
    if (!parsedTocList || parsedTocList.length === 0 || effDuration <= 0) return [];

    return parsedTocList
      .map((item: any) => {
        if (!item || typeof item !== "object") return null;
        const rawCut =
          item.cut !== undefined
            ? item.cut
            : item.time !== undefined
            ? item.time
            : item.timestamp !== undefined
            ? item.timestamp
            : item.start !== undefined
            ? item.start
            : item.duration;
        if (rawCut === undefined || rawCut === null) return null;
        const sec = parseAnyDurationToSec(rawCut);
        if (isNaN(sec) || sec < 0) return null;
        const ratio = Math.max(0.002, Math.min(0.998, sec / effDuration));
        return {
          ratio,
          title: String(item.title || item.name || ""),
          cut: String(rawCut),
        };
      })
      .filter((x): x is { ratio: number; title: string; cut: string } => x !== null);
  }, [parsedTocList, effDuration]);

  const trackWidth = useSharedValue(0);
  const ratioAnim = useSharedValue(effDuration > 0 ? safeCurrentTime / effDuration : 0);
  const isSeekingShared = useSharedValue(false);
  const thumbScaleAnim = useSharedValue(1);
  const rippleScaleAnim = useSharedValue(0.3);
  const rippleOpacityAnim = useSharedValue(0);

  const isSeekingRef = useRef(false);
  const durationRef = useRef(effDuration);
  durationRef.current = effDuration;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const lastFormattedTimeRef = useRef(formatTime(currentTime || 0));
  const lastFormattedDurRef = useRef(formatTime(duration || 180));
  const currentTimeInputRef = useRef<TextInput>(null);
  const durationTextInputRef = useRef<TextInput>(null);

  const syncLiveTimeLabel = useCallback((sec: number) => {
    const formatted = formatTime(sec);
    if (formatted !== lastFormattedTimeRef.current) {
      lastFormattedTimeRef.current = formatted;
      currentTimeInputRef.current?.setNativeProps({ text: formatted });
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!isSeekingRef.current) {
      ratioAnim.value = effDuration > 0 ? safeCurrentTime / effDuration : 0;
      syncLiveTimeLabel(safeCurrentTime);
    }
    const unsubscribe = subscribeToPlaybackTime((liveTime: number, liveDur: number) => {
      const effDur = liveDur > 0 ? liveDur : durationRef.current > 0 ? durationRef.current : 180;
      durationRef.current = effDur;
      if (liveDur > 0 && Math.abs(liveDur - liveDuration) > 0.5) {
        setLiveDuration(liveDur);
      }
      const formattedDur = formatTime(effDur);
      if (formattedDur !== lastFormattedDurRef.current) {
        lastFormattedDurRef.current = formattedDur;
        durationTextInputRef.current?.setNativeProps({ text: formattedDur });
      }
      if (!isSeekingRef.current && !isSeekingShared.value) {
        ratioAnim.value = Math.max(0, Math.min(1, liveTime / effDur));
        syncLiveTimeLabel(liveTime);
      }
    });
    return unsubscribe;
  }, [active, effDuration, safeCurrentTime, ratioAnim, syncLiveTimeLabel, isSeekingShared]);

  const onScrubStart = useCallback(() => {
    isSeekingRef.current = true;
    setUserScrubbingActive(true);
    triggerTactileHaptic("light");
  }, []);

  const onScrubCommit = useCallback((finalRatio: number) => {
    isSeekingRef.current = false;
    setUserScrubbingActive(false);
    const finalSec = finalRatio * durationRef.current;
    syncLiveTimeLabel(finalSec);
    triggerTactileHaptic("medium");
    onSeek(finalSec);
  }, [onSeek, syncLiveTimeLabel]);

  const panGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-4, 4])
    .onBegin((e) => {
      "worklet";
      if (disabledRef.current) return;
      isSeekingShared.value = true;
      thumbScaleAnim.value = withTiming(1.2, { duration: 60 });
      rippleScaleAnim.value = withTiming(1, { duration: 100 });
      rippleOpacityAnim.value = withTiming(0.8, { duration: 100 });
      ratioAnim.value = clamp(e.x / (trackWidth.value || 1), 0, 1);
      runOnJS(onScrubStart)();
    })
    .onUpdate((e) => {
      "worklet";
      if (!disabledRef.current) ratioAnim.value = clamp(e.x / (trackWidth.value || 1), 0, 1);
    })
    .onFinalize((e) => {
      "worklet";
      isSeekingShared.value = false;
      thumbScaleAnim.value = withTiming(1.0, { duration: 60 });
      rippleScaleAnim.value = withTiming(0.4, { duration: 100 });
      rippleOpacityAnim.value = withTiming(0, { duration: 100 });
      const finalRatio = clamp(e.x / (trackWidth.value || 1), 0, 1);
      ratioAnim.value = finalRatio;
      runOnJS(onScrubCommit)(finalRatio);
    }), [onScrubStart, onScrubCommit, isSeekingShared, thumbScaleAnim, rippleScaleAnim, rippleOpacityAnim, trackWidth, ratioAnim]
  );

  const tapGesture = useMemo(() => Gesture.Tap().maxDuration(300).onEnd((e) => {
    "worklet";
    if (disabledRef.current) return;
    const finalRatio = clamp(e.x / (trackWidth.value || 1), 0, 1);
    ratioAnim.value = finalRatio;
    runOnJS(onScrubCommit)(finalRatio);
  }), [onScrubCommit, trackWidth, ratioAnim]);

  const sliderGesture = useMemo(() => Gesture.Race(panGesture, tapGesture), [panGesture, tapGesture]);
  const handleLayout = useCallback((e: LayoutChangeEvent) => { trackWidth.value = e.nativeEvent.layout.width; }, [trackWidth]);

  const isMini = mini || !showTimeLabels;
  const thumbWidth = isMini ? 3.5 : 5;
  const thumbHeight = isMini ? 14 : 36;
  const trackHeight = isMini ? 6 : 14;
  const gapCutoutWidth = isMini ? 9 : 15;

  const fillStyle = useAnimatedStyle(() => {
    const w = trackWidth.value > 0 ? trackWidth.value : 1;
    return { width: w, transform: [{ translateX: (ratioAnim.value - 1) * w }] };
  });

  const thumbAnchorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ratioAnim.value * (trackWidth.value > 0 ? trackWidth.value : 1) }],
  }));

  const thumbActiveStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: thumbScaleAnim.value }, { scaleY: thumbScaleAnim.value }],
  }));

  const rippleActiveStyle = useAnimatedStyle(() => ({
    opacity: rippleOpacityAnim.value,
    transform: [{ scale: rippleScaleAnim.value }],
  }));

  return (
    <View style={[styles.container, style]}>
      <GestureDetector gesture={sliderGesture}>
        <View onLayout={handleLayout} style={[styles.touchArea, isMini ? styles.touchAreaMini : styles.touchAreaFull, sliderStyle]}>
          <View pointerEvents="none" style={[styles.trackStage, { height: thumbHeight }]}>
            <View style={[styles.trackBase, { height: trackHeight, borderRadius: trackHeight / 2, backgroundColor: maximumTrackTintColor }]}>
              <Reanimated.View style={[styles.fillBar, { height: trackHeight, backgroundColor: minimumTrackTintColor }, fillStyle]} />
              {tocPoints.map((pt, i) => (
                <View key={i} style={[styles.tocPointDot, { left: `${(pt.ratio * 100).toFixed(2)}%` as any, height: isMini ? 5 : 7, width: isMini ? 5 : 7, borderRadius: isMini ? 2.5 : 3.5, marginTop: isMini ? -2.5 : -3.5, marginLeft: isMini ? -2.5 : -3.5 }]} />
              ))}
              <View style={[styles.endStopDot, { width: isMini ? 3 : 4.5, height: isMini ? 3 : 4.5, borderRadius: 3, backgroundColor: minimumTrackTintColor }]} />
            </View>
            <Reanimated.View style={[styles.thumbAnchor, { height: thumbHeight, width: gapCutoutWidth, marginLeft: -gapCutoutWidth / 2 }, thumbAnchorStyle]}>
              <View style={[styles.gapMask, { width: gapCutoutWidth, height: trackHeight + 4 }]} />
              {!isMini && <Reanimated.View style={[styles.rippleHalo, rippleActiveStyle]} />}
              <Reanimated.View style={[styles.verticalThumb, { width: thumbWidth, height: thumbHeight, backgroundColor: thumbTintColor }, thumbActiveStyle]} />
            </Reanimated.View>
          </View>
        </View>
      </GestureDetector>
      {showTimeLabels && (
        <View pointerEvents="none" style={[styles.timeRow, timeRowStyle]}>
          <TextInput ref={currentTimeInputRef} editable={false} defaultValue={formatTime(safeCurrentTime)} style={[styles.timeTextInput, timeTextStyle]} />
          <TextInput ref={durationTextInputRef} editable={false} defaultValue={formatTime(effDuration)} style={[styles.timeTextInputRight, timeTextStyle]} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: "100%" },
  touchArea: { width: "100%", justifyContent: "center" },
  touchAreaFull: { height: 44 },
  touchAreaMini: { height: 22 },
  trackStage: { width: "100%", justifyContent: "center", position: "relative" },
  trackBase: { width: "100%", overflow: "hidden", justifyContent: "center" },
  fillBar: { position: "absolute", left: 0, top: 0 },
  endStopDot: { position: "absolute", right: 6, opacity: 0.9 },
  tocPointDot: { position: "absolute", top: "50%", backgroundColor: "#00D2B4", borderWidth: 1.2, borderColor: "#050614", zIndex: 4, opacity: 0.98 },
  thumbAnchor: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center" },
  gapMask: { position: "absolute", backgroundColor: "#0A0C10", borderRadius: 3 },
  rippleHalo: { position: "absolute", width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255, 255, 255, 0.18)" },
  verticalThumb: { borderRadius: 999 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  timeTextInput: { fontSize: 13, fontWeight: "600", color: "#E5E7EB", fontVariant: ["tabular-nums"], padding: 0, margin: 0, minWidth: 54, textAlign: "left" },
  timeTextInputRight: { fontSize: 13, fontWeight: "600", color: "#E5E7EB", fontVariant: ["tabular-nums"], padding: 0, margin: 0, minWidth: 54, textAlign: "right" },
});
export default SmoothAudioSlider;