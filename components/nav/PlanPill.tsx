// File: components/nav/PlanPill.tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { useUser } from "../../hooks/useUser";
import { getEntitlementState } from "../../lib/entitlements";

const PlanPill = () => {
  const { user } = useUser();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const { effectivePlanName } = getEntitlementState(user, now);
  const isEarlyAccess = effectivePlanName === "Early Access";

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
