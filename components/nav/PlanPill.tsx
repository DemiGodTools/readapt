// File: components/nav/PlanPill.tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Svg, { Path } from "react-native-svg";
import { useUser } from "../../hooks/useUser";
import { getEntitlementState } from "../../lib/entitlements";

/**
 * Official Material Design 3 (MD3) Lock Clock Icon
 * Represents Early Access: A secure lock with an attached clockface and clock hands
 */
export const LockClockIcon = ({
  size = 18,
  color = "#00D2B4",
}: {
  size?: number;
  color?: string;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M18 11c.34 0 .68.03 1 .08V10c0-1.1-.9-2-2-2h-1V6c0-2.76-2.24-5-5-5S6 3.24 6 6v2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h7.26c-.17-.64-.26-1.31-.26-2 0-3.31 2.69-6 6-6zM8 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H8V6zm10 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm.5 5.5H16v-4h1.5v2.5h1V18.5z"
      fill={color}
    />
  </Svg>
);

interface PlanPillProps {
  iconOnly?: boolean;
}

const PlanPill: React.FC<PlanPillProps> = ({ iconOnly = true }) => {
  const { user } = useUser();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const { effectivePlanName } = getEntitlementState(user, now);
  const isEarlyAccess = effectivePlanName === "Early Access";
  const iconColor = isEarlyAccess ? "#00D2B4" : "#ffffff";

  if (iconOnly) {
    return (
      <View
        style={[
          styles.iconContainer,
          isEarlyAccess ? styles.earlyIconBorder : styles.standardIconBorder,
        ]}
      >
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.iconGlass,
              isEarlyAccess && styles.earlyIconGlass,
            ]}
          />
        </BlurView>
        <LockClockIcon size={18} color={iconColor} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill}>
        <View style={[styles.glass, isEarlyAccess && styles.earlyGlass]} />
      </BlurView>
      <View style={styles.pill}>
        <Text style={[styles.planText, isEarlyAccess && styles.earlyText]}>
          {effectivePlanName}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // --- Icon Mode Styles (MD3 Lock-Clock Button) ---
  iconContainer: {
    width: 34,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  earlyIconBorder: {
    borderColor: "rgba(0, 210, 180, 0.38)",
    backgroundColor: "rgba(0, 210, 180, 0.12)",
  },
  standardIconBorder: {
    borderColor: "rgba(255, 255, 255, 0.20)",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  iconGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  earlyIconGlass: {
    backgroundColor: "rgba(0, 210, 180, 0.08)",
  },

  // --- Text Pill Legacy Mode Styles ---
  container: {
    borderRadius: 999,
    overflow: "hidden",
  },
  glass: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  earlyGlass: {
    borderColor: "rgba(0, 210, 180, 0.4)",
    backgroundColor: "rgba(0, 210, 180, 0.12)",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  planText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  earlyText: {
    color: "#00D2B4",
  },
});

export default PlanPill;
