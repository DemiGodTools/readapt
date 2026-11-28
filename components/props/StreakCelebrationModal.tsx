import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image as RNImage,
  Platform,
  Vibration,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import Svg, {
  Path,
  Rect,
} from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import {
  useFonts,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";

// --- Animated SVG Components ---
const AnimatedPath = Animated.createAnimatedComponent(Path);

// --- Header / Utility Icons ---
const CloseIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const CrownIcon = () => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="#e59819">
    <Path d="M2 19h20v2H2v-2zm1.5-12.5l4 3.5 4.5-5.5 4.5 5.5 4-3.5L19 17H5L3.5 6.5z" />
  </Svg>
);

const ArrowRight = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#1c1917" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M5 12h14M12 5l7 7-7 7" />
  </Svg>
);

// --- Feature Icons (Professional Lucide-Grade Standard) ---
// 1. Read a book: Symmetrical open book with curving pages
const BookIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="#ffe1b8">
    <Path d="M12 6.5c-1.8-1.5-4.2-2-7.5-2A1.5 1.5 0 0 0 3 6v12.5a1 1 0 0 0 1.2.98c3-.5 5.3-.1 6.8 1.02.6.48 1.4.48 2 0 1.5-1.12 3.8-1.52 6.8-1.02A1 1 0 0 0 21 18.5V6a1.5 1.5 0 0 0-1.5-1.5c-3.3 0-5.7.5-7.5 2z" />
  </Svg>
);

// 2. Take quizzes: Solid rounded square with dark checkmark inside
const QuizIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24">
    <Rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#ffe1b8" />
    <Path
      d="M7.5 12.2l3 3 6-6"
      stroke="#1c1917"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

// 3. Learn more: Professional Lucide Trending Growth Chart Icon
const LearnMoreIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    {/* Base bar charts */}
    <Rect x="3" y="14" width="3.5" height="7" rx="1.2" fill="#ffe1b8" />
    <Rect x="9.25" y="10" width="3.5" height="11" rx="1.2" fill="#ffe1b8" />
    <Rect x="15.5" y="5" width="3.5" height="16" rx="1.2" fill="#ffe1b8" />
    {/* Clean rising trendline */}
    <Path
      d="M4 11L9.5 6.5L13.5 9.5L20.5 3"
      stroke="#ffa024"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M16 3H20.5V7.5"
      stroke="#ffa024"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// --- Small Gift Icon for Top-Right Corner of 1-Day Streak Badge ---
const AnimatedGiftBadge = () => {
  const bounce = useSharedValue(1);
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);

  useEffect(() => {
    bounce.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.94, { duration: 800, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    p1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    p2.value = withDelay(
      450,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedGiftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.value }],
  }));

  const p1Style = useAnimatedStyle(() => ({
    opacity: p1.value * 0.9 + 0.1,
    transform: [
      { translateY: (p1.value - 0.5) * 5 },
      { scale: 0.6 + p1.value * 0.5 },
    ] as any,
  }));

  const p2Style = useAnimatedStyle(() => ({
    opacity: p2.value * 0.9 + 0.1,
    transform: [
      { translateX: (p2.value - 0.5) * 5 },
      { scale: 0.6 + p2.value * 0.5 },
    ] as any,
  }));

  return (
    <View style={styles.cornerGiftContainer}>
      <Animated.View style={[styles.cornerGiftInner, animatedGiftStyle]}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Rect x="4" y="11" width="16" height="10" rx="2" fill="#ff9f1c" />
          <Rect x="3" y="7" width="18" height="4" rx="1.2" fill="#fdb750" />
          <Rect x="10.5" y="7" width="3" height="14" fill="#fff3c4" />
          <Path
            d="M12 7c-1.8-3-4.5-1.5-3.5 0.5 1 2 3.5 1.5 3.5 1.5s2.5 0.5 3.5-1.5c1-2-1.7-3.5-3.5-0.5z"
            fill="#fff3c4"
          />
        </Svg>
      </Animated.View>

      {/* Living Twinkling Surrounding Particles */}
      <Animated.View style={[styles.giftParticle, { top: -2, right: -2 }, p1Style]}>
        <View style={styles.goldDot} />
      </Animated.View>
      <Animated.View style={[styles.giftParticle, { bottom: -2, left: -2 }, p2Style]}>
        <View style={[styles.goldDot, { width: 3, height: 3, backgroundColor: "#fff5cc" }]} />
      </Animated.View>
    </View>
  );
};

// --- Animated WebP Flame Asset & Zero-Latency Preloader ---
const ANIFLAME_ASSET = require("../../assets/aniflame.webp");

/**
 * Preloads the animated WebP flame asset into memory and native image pipeline (Glide/Fresco on Android, SDWebImage on iOS).
 * Call this on parent screen mount (e.g. Home.tsx) so the modal opens with 0ms texture readiness, zero flicker, and zero blank delay.
 */
export const preloadStreakCelebrationAssets = () => {
  try {
    const resolved = RNImage.resolveAssetSource(ANIFLAME_ASSET);
    if (resolved?.uri) {
      ExpoImage.prefetch(resolved.uri, "memory-disk");
      RNImage.prefetch(resolved.uri);
    }
  } catch (_) {}
};

// Immediate prefetch at file import time
preloadStreakCelebrationAssets();

// --- Animated WebP Flame Graphic Component ---
const AnimatedFlameGraphic = () => {
  return (
    <View style={styles.flameContainer}>
      <ExpoImage
        source={ANIFLAME_ASSET}
        style={styles.aniflameImage}
        contentFit="contain"
        autoplay={true}
        cachePolicy="memory-disk"
        priority="high"
        transition={0}
      />
    </View>
  );
};

// --- Hand-Drawn Swoosh Mark with Vertical Downward End Stroke (Permanent line) ---
const HandDrawnSwoosh = ({
  animatedHorizontalProps,
  animatedVerticalProps,
}: {
  animatedHorizontalProps: any;
  animatedVerticalProps: any;
}) => {
  return (
    <View style={styles.swooshContainer}>
      <Svg width={150} height={22} viewBox="0 0 150 22" fill="none">
        {/* Main horizontal underline flourish curve */}
        <AnimatedPath
          d="M 6 6 C 44 2, 98 2, 140 6"
          stroke="#ff9f1c"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeDasharray="150"
          animatedProps={animatedHorizontalProps}
        />
        {/* Small vertical downward stroke at the end of the right tip (Stays permanent) */}
        <AnimatedPath
          d="M 140 6 L 140 17"
          stroke="#ff9f1c"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeDasharray="14"
          animatedProps={animatedVerticalProps}
        />
      </Svg>
    </View>
  );
};

// --- Main Modal Component ---
interface StreakCelebrationModalProps {
  visible: boolean;
  currentStreak: number;
  onClose: () => void;
  onViewRewards?: () => void;
}

export const StreakCelebrationModal: React.FC<StreakCelebrationModalProps> = ({
  visible,
  currentStreak,
  onClose,
  onViewRewards,
}) => {
  const [isMounted, setIsMounted] = useState(visible);

  // Load Poppins Google Font
  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Card entrance shared values
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const translateY = useSharedValue(20);
  const backdropOpacity = useSharedValue(0);

  // Mark drawing shared values
  const horizontalProgress = useSharedValue(150);
  const verticalProgress = useSharedValue(14);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);

      // Strong distinct vibration pattern that penetrates battery/power saving mode
      try {
        Vibration.cancel();
        Vibration.vibrate([0, 90, 50, 120]);
      } catch (_) {}

      const vibTimer = setTimeout(() => {
        try {
          Vibration.vibrate([0, 70, 40, 90]);
        } catch (_) {}
      }, 70);

      // Smooth Optimized Entrance Animation
      backdropOpacity.value = withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.quad),
      });

      opacity.value = withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.quad),
      });

      scale.value = withTiming(1, {
        duration: 320,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });

      translateY.value = withTiming(0, {
        duration: 320,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });

      // 1. Hand-Drawn Horizontal Underline (draws across)
      horizontalProgress.value = 150;
      horizontalProgress.value = withDelay(
        350,
        withTiming(0, {
          duration: 650,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        })
      );

      // 2. Small Vertical Downward Stroke at the end of the right tip (stays permanent)
      verticalProgress.value = 14;
      verticalProgress.value = withDelay(
        1000,
        withTiming(0, {
          duration: 180,
          easing: Easing.out(Easing.quad),
        })
      );

      return () => clearTimeout(vibTimer);
    } else {
      // Smooth Exit Animation
      backdropOpacity.value = withTiming(0, {
        duration: 180,
        easing: Easing.in(Easing.quad),
      });

      opacity.value = withTiming(0, {
        duration: 180,
        easing: Easing.in(Easing.quad),
      });

      scale.value = withTiming(
        0.93,
        { duration: 180, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(setIsMounted)(false);
        }
      );
    }
  }, [visible]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ] as any,
  }));

  const animatedHorizontalProps = useAnimatedProps(() => ({
    strokeDashoffset: horizontalProgress.value,
  }));

  const animatedVerticalProps = useAnimatedProps(() => ({
    strokeDashoffset: verticalProgress.value,
  }));

  if (!isMounted) {
    return (
      <View
        pointerEvents="none"
        style={styles.hiddenPreload}
      >
        <ExpoImage
          source={ANIFLAME_ASSET}
          style={styles.hiddenPreloadImage}
          priority="high"
          cachePolicy="memory-disk"
          transition={0}
        />
      </View>
    );
  }
  const streakVal = currentStreak > 0 ? currentStreak : 1;
  const isFirstDayStreak = streakVal === 1;

  // Font family resolution with Poppins guarantee
  const poppinsExtraBold = fontsLoaded
    ? "Poppins_800ExtraBold"
    : Platform.select({ ios: "Poppins-Bold", android: "Poppins-Bold", default: "sans-serif" });

  const poppinsBold = fontsLoaded
    ? "Poppins_700Bold"
    : Platform.select({ ios: "Poppins-Bold", android: "Poppins-Bold", default: "sans-serif" });

  const poppinsSemiBold = fontsLoaded
    ? "Poppins_600SemiBold"
    : Platform.select({ ios: "Poppins-SemiBold", android: "Poppins-SemiBold", default: "sans-serif" });

  const poppinsMedium = fontsLoaded
    ? "Poppins_500Medium"
    : Platform.select({ ios: "Poppins-Medium", android: "Poppins-Medium", default: "sans-serif" });

  const handleGiftPress = () => {
    onClose();
    if (onViewRewards) {
      setTimeout(() => {
        onViewRewards();
      }, 210);
    }
  };

  return (
    <Modal
      transparent
      animationType="none"
      visible={isMounted}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, animatedBackdropStyle]}>
        <Animated.View style={[styles.card, animatedCardStyle]}>
          {/* Subtle Background Wave Texture */}
          <RNImage
            source={require("../../assets/golden-wave-bg.png")}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
          <View style={styles.backgroundOverlay} />

          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <CloseIcon />
          </TouchableOpacity>

          <View style={styles.contentContainer}>
            {/* 1. Cosmic Planetary Flame with Orbiting Ring */}
            <AnimatedFlameGraphic />

            {/* 2. Streak Counter Row with Crown & Corner Gift Badge */}
            <View style={styles.streakBadgeWrapper}>
              <View style={styles.streakPill}>
                <CrownIcon />
                <Text style={[styles.streakPillText, { fontFamily: poppinsBold }]}>
                  {streakVal} {streakVal === 1 ? "Day" : "Days"} Streak
                </Text>
              </View>

              {/* Gift Icon: Tapping opens the Daily Rewards screen */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleGiftPress}
                style={styles.badgeGiftCorner}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <AnimatedGiftBadge />
              </TouchableOpacity>
            </View>

            {/* 3. Balanced Typography with Poppins Font */}
            <Text style={[styles.titleText, { fontFamily: poppinsExtraBold }]}>
              {streakVal >= 7
                ? "Unstoppable!"
                : streakVal >= 3
                ? "On a roll!"
                : "You’re on fire!"}
            </Text>

            <Text style={[styles.subtitleText, { fontFamily: poppinsMedium }]}>
              {streakVal === 1
                ? "You started your reading journey!\nKeep going to build your habit."
                : `You've locked in your ${streakVal}-day streak!\nKeep the momentum going tomorrow!`}
            </Text>

            {/* 4. Hand-Drawn Mark with Vertical Downward End Stroke (Permanent line) */}
            <HandDrawnSwoosh
              animatedHorizontalProps={animatedHorizontalProps}
              animatedVerticalProps={animatedVerticalProps}
            />

            {/* 5. Clean, Professional Feature Actions (Read a book, Take quizzes, Learn more) */}
            <View style={styles.featuresBox}>
              <View style={styles.featureItem}>
                <BookIcon />
                <Text style={[styles.featureText, { fontFamily: poppinsMedium }]}>Read a book</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.featureItem}>
                <QuizIcon />
                <Text style={[styles.featureText, { fontFamily: poppinsMedium }]}>Take quizzes</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.featureItem}>
                <LearnMoreIcon />
                <Text style={[styles.featureText, { fontFamily: poppinsMedium }]}>Learn more</Text>
              </View>
            </View>

            {/* 6. Primary Action Button - Always closes modal pop up directly */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={onClose}
              style={styles.buttonWrapper}
            >
              <LinearGradient
                colors={["#fdb750", "#ff8c00"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButton}
              >
                <Text style={[styles.primaryButtonText, { fontFamily: poppinsSemiBold }]}>Keep Going</Text>
                <ArrowRight />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(4, 3, 3, 0.82)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "88%",
    maxWidth: 364,
    backgroundColor: "#161311",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 179, 71, 0.16)",
    overflow: "hidden",
    shadowColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    opacity: 0.35,
  },
  backgroundOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(22, 19, 17, 0.88)",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  contentContainer: {
    paddingTop: 16,
    paddingHorizontal: 22,
    paddingBottom: 26,
    alignItems: "center",
    zIndex: 1,
  },

  // --- Animated WebP Flame Container ---
  flameContainer: {
    width: 170,
    height: 160,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  aniflameImage: {
    width: 154,
    height: 154,
  },
  hiddenPreload: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  hiddenPreloadImage: {
    width: 1,
    height: 1,
  },

  // --- Streak Badge Wrapper & Corner Gift Badge ---
  streakBadgeWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffe1b8",
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  streakPillText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2b1c04",
    letterSpacing: 0.2,
  },
  badgeGiftCorner: {
    position: "absolute",
    top: -8,
    right: -8,
    zIndex: 15,
  },
  cornerGiftContainer: {
    position: "relative",
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  cornerGiftInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2a1f18",
    borderWidth: 1,
    borderColor: "rgba(255, 179, 71, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  giftParticle: {
    position: "absolute",
    zIndex: 5,
  },
  goldDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 99,
    backgroundColor: "#ffd166",
  },

  // --- Balanced Typography with Poppins ---
  titleText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  titleHighlight: {
    color: "#ff9f1c",
  },
  subtitleText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#b8b0a8",
    textAlign: "center",
    marginBottom: 4,
    fontWeight: "500",
  },

  // --- Swoosh Container ---
  swooshContainer: {
    position: "relative",
    width: 150,
    height: 24,
    alignItems: "center",
    marginBottom: 20,
  },

  // --- Feature Actions Box (Exact to Screenshot) ---
  featuresBox: {
    flexDirection: "row",
    backgroundColor: "rgba(30, 26, 24, 0.72)",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 8,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255, 179, 71, 0.12)",
    marginBottom: 24,
    alignItems: "center",
  },
  featureItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  featureText: {
    color: "#ece8e3",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  divider: {
    width: 1,
    height: 38,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },

  // --- Primary Action Button ---
  buttonWrapper: {
    width: "100%",
  },
  primaryButton: {
    flexDirection: "row",
    width: "100%",
    paddingVertical: 16,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#1c1917",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

export default StreakCelebrationModal;
