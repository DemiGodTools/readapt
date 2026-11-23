import React, { useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  StyleProp,
  ViewStyle,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useStreak } from "../../hooks/useStreak";
import { useUser } from "../../hooks/useUser";

interface StreakBadgeProps {
  streak?: number;
  isCompletedToday?: boolean;
  onPress?: () => void;
  size?: "small" | "medium" | "large";
  style?: StyleProp<ViewStyle>;
}

export const StreakBadge: React.FC<StreakBadgeProps> = ({
  streak: propStreak,
  isCompletedToday: propIsCompleted,
  onPress,
  size = "medium",
  style,
}) => {
  const { streak: hookStreak, isCompletedToday: hookIsCompleted } = useStreak();
  const navigation = useNavigation<any>();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  let contextUserStreak: number | undefined;
  try {
    const { user } = useUser();
    contextUserStreak = (user as any)?.streakData?.currentStreak ?? (user as any)?.streak;
  } catch (_) {}

  // Prioritize explicit prop, then hook live reactive state, then user context cache
  const effectiveStreak =
    propStreak !== undefined
      ? propStreak
      : hookStreak > 0
      ? hookStreak
      : typeof contextUserStreak === "number" && contextUserStreak > 0
      ? contextUserStreak
      : hookStreak;

  const effectiveCompleted =
    propIsCompleted !== undefined ? propIsCompleted : hookIsCompleted;

  // Active if streak > 0 OR completed today
  const isActive = effectiveStreak > 0 || effectiveCompleted;
  const displayCount = Math.max(0, effectiveStreak);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 25,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 25,
      bounciness: 4,
    }).start();
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      try {
        navigation.navigate("DailyRewards");
      } catch (_) {}
    }
  };

  const dimensions = useMemo(() => {
    if (size === "small") return { width: 64, height: 27, fontSize: 13 };
    if (size === "large") return { width: 92, height: 39, fontSize: 19 };
    return { width: 76, height: 32, fontSize: 16 };
  }, [size]);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[style]}
    >
      <Animated.View
        style={[
          styles.container,
          { width: dimensions.width, height: dimensions.height },
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/*
          Both plates remain permanently mounted to guarantee 0ms instant transition,
          zero texture unmount/re-decode latency, and zero visual flicker.
        */}
        <Image
          source={require("../../assets/streakoff.png")}
          style={[styles.plateImage, { opacity: isActive ? 0 : 1 }]}
          resizeMode="contain"
          fadeDuration={0}
        />
        <Image
          source={require("../../assets/streakon.png")}
          style={[styles.plateImage, { opacity: isActive ? 1 : 0 }]}
          resizeMode="contain"
          fadeDuration={0}
        />

        {/* Dynamic native text rendered only when streak is active (>0). streakoff.png already has the pristine metallic 0. */}
        {isActive && (
          <View style={styles.numberSlot} pointerEvents="none">
            <Text
              style={[
                styles.streakNumber,
                styles.streakNumberActive,
                { fontSize: dimensions.fontSize },
              ]}
              numberOfLines={1}
            >
              {displayCount}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  plateImage: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
  },
  numberSlot: {
    position: "absolute",
    left: "48%",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  streakNumber: {
    fontStyle: "italic",
    fontWeight: "900",
    textAlign: "center",
    includeFontPadding: false,
    letterSpacing: -0.5,
    paddingRight: 2,
    ...Platform.select({
      ios: {
        fontFamily: "System",
      },
      android: {
        fontFamily: "sans-serif",
      },
    }),
  },
  streakNumberActive: {
    color: "#FFA200", // Glowing fiery amber-gold matching the flame artwork
    textShadowColor: "rgba(255, 140, 0, 0.55)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  streakNumberInactive: {
    color: "#7A7880", // Muted silver-zinc matching the off flame
  },
});

export default StreakBadge;
