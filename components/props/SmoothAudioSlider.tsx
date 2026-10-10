import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import Slider from "@react-native-community/slider";

export const formatTime = (sec = 0) => {
  if (isNaN(sec) || sec < 0 || !isFinite(sec)) return "0:00";
  const totalSec = Math.floor(sec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }
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
}

export const SmoothAudioSlider = memo(
  ({
    currentTime,
    duration,
    onSeek,
    disabled = false,
    minimumTrackTintColor = "#007AFF",
    maximumTrackTintColor = "rgba(255, 255, 255, 0.25)",
    thumbTintColor = "#007AFF",
    style,
    sliderStyle,
    showTimeLabels = true,
    timeTextStyle,
    timeRowStyle,
  }: SmoothAudioSliderProps) => {
    const isSeekingRef = useRef(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekDisplayTime, setSeekDisplayTime] = useState(currentTime || 0);
    const seekCooldownRef = useRef(0);

    const safeDuration = duration > 0 ? duration : 1;
    const safeCurrentTime = Math.max(0, Math.min(currentTime || 0, safeDuration));

    // Keep seekDisplayTime in sync with external currentTime only when not seeking and outside cooldown
    useEffect(() => {
      if (!isSeekingRef.current && Date.now() > seekCooldownRef.current) {
        setSeekDisplayTime(safeCurrentTime);
      }
    }, [safeCurrentTime]);

    const handleSlidingStart = useCallback((val: number) => {
      isSeekingRef.current = true;
      setIsSeeking(true);
      setSeekDisplayTime(val);
    }, []);

    const handleValueChange = useCallback((val: number) => {
      setSeekDisplayTime(val);
    }, []);

    const handleSlidingComplete = useCallback(
      (val: number) => {
        isSeekingRef.current = false;
        seekCooldownRef.current = Date.now() + 450;
        setSeekDisplayTime(val);
        onSeek(val);
        // Reset seeking flag after native engine completes the jump
        setTimeout(() => {
          if (!isSeekingRef.current) {
            setIsSeeking(false);
          }
        }, 450);
      },
      [onSeek]
    );

    const displayVal = isSeeking ? seekDisplayTime : safeCurrentTime;

    return (
      <View style={[styles.container, style]}>
        <Slider
          style={[styles.slider, sliderStyle]}
          minimumValue={0}
          maximumValue={safeDuration}
          value={displayVal}
          minimumTrackTintColor={minimumTrackTintColor}
          maximumTrackTintColor={maximumTrackTintColor}
          thumbTintColor={thumbTintColor}
          onSlidingStart={handleSlidingStart}
          onValueChange={handleValueChange}
          onSlidingComplete={handleSlidingComplete}
          disabled={disabled || duration <= 0}
        />

        {showTimeLabels && (
          <View style={[styles.timeRow, timeRowStyle]}>
            <Text style={[styles.timeText, timeTextStyle]}>
              {formatTime(displayVal)}
            </Text>
            <Text style={[styles.timeText, timeTextStyle]}>
              {formatTime(duration)}
            </Text>
          </View>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  slider: {
    width: "100%",
    height: 28,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
  },
});

export default SmoothAudioSlider;
