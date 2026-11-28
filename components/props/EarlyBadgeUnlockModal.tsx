import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
  Animated,
  Easing,
  Vibration,
} from "react-native";
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const THEME = {
  bg: "#070B0D",
  cardBg: "#0F161A",
  cardBorder: "rgba(0, 210, 180, 0.28)",
  tealPrimary: "#00D2B4",
  tealSoftBg: "rgba(0, 210, 180, 0.12)",
  tealGlow: "rgba(0, 210, 180, 0.25)",
  textPrimary: "#FFFFFF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
};

interface EarlyBadgeUnlockModalProps {
  visible: boolean;
  onClaim: () => void;
  loading?: boolean;
}

export default function EarlyBadgeUnlockModal({
  visible,
  onClaim,
  loading = false,
}: EarlyBadgeUnlockModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const badgeBounceAnim = useRef(new Animated.Value(0)).current;
  const glowPulseAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (visible) {
      try {
        Vibration.vibrate([0, 35, 60, 45]);
      } catch {}

      // Reveal Card
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Continuous subtle badge float + glow pulse
      const bounceLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(badgeBounceAnim, {
            toValue: -8,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(badgeBounceAnim, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      bounceLoop.start();

      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulseAnim, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowPulseAnim, {
            toValue: 0.6,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      glowLoop.start();

      return () => {
        bounceLoop.stop();
        glowLoop.stop();
      };
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      badgeBounceAnim.setValue(0);
      glowPulseAnim.setValue(0.7);
    }
  }, [visible, scaleAnim, opacityAnim, badgeBounceAnim, glowPulseAnim]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClaim} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* Dark Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]} />

        {/* Celebration Dialog Box */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Radial Teal Ambient Glow behind badge */}
          <Animated.View
            style={[
              styles.radialGlowWrap,
              {
                opacity: glowPulseAnim,
                transform: [{ scale: glowPulseAnim }],
              },
            ]}
          >
            <Svg width={240} height={240} viewBox="0 0 240 240">
              <Defs>
                <RadialGradient id="tealGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="#00D2B4" stopOpacity="0.55" />
                  <Stop offset="55%" stopColor="#00D2B4" stopOpacity="0.18" />
                  <Stop offset="100%" stopColor="#00D2B4" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx="120" cy="120" r="120" fill="url(#tealGlow)" />
            </Svg>
          </Animated.View>

          {/* Floating Badge Image */}
          <Animated.View
            style={[
              styles.badgeWrap,
              { transform: [{ translateY: badgeBounceAnim }] },
            ]}
          >
            <Image
              source={require("../../assets/earlybadge.png")}
              style={styles.badgeImg}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Lifetime Pill */}
          <View style={styles.lifetimePill}>
            <View style={styles.greenDot} />
            <Text style={styles.lifetimePillText}>Founding Lifetime Badge</Text>
          </View>

          {/* Title & Body */}
          <Text style={styles.title}>Early Reader Unlocked!</Text>
          <Text style={styles.subtitle}>
            Proud to have you with us from the very beginning. You are permanently recognized as a founding reader of READAPT.
          </Text>

          {/* Action CTA Button */}
          <TouchableOpacity
            style={styles.ctaButton}
            activeOpacity={0.85}
            onPress={onClaim}
            disabled={loading}
          >
            <LinearGradient
              colors={["#00E5C5", "#00B89C"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>
                {loading ? "Unlocking..." : "Claim & View Profile"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.88)",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: THEME.cardBg,
    borderRadius: 28,
    borderColor: THEME.cardBorder,
    borderWidth: 1.5,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 28,
    alignItems: "center",
    shadowColor: THEME.tealPrimary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 20,
  },
  radialGlowWrap: {
    position: "absolute",
    top: -10,
    alignSelf: "center",
    width: 240,
    height: 240,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeWrap: {
    width: 140,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  badgeImg: {
    width: 135,
    height: 56,
  },
  lifetimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: THEME.tealSoftBg,
    borderColor: "rgba(0, 210, 180, 0.4)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5.5,
    marginBottom: 16,
  },
  greenDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.5,
    backgroundColor: THEME.tealPrimary,
  },
  lifetimePillText: {
    color: THEME.tealPrimary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  title: {
    color: THEME.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: THEME.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 6,
    marginBottom: 26,
  },
  ctaButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  ctaGradient: {
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: "#051614",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
