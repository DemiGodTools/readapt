import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { useUser } from "../../hooks/useUser";

const PLAN_LABELS = ["Free", "Basic", "Pro", "Premium"];

const PlanPill = () => {
  const { user } = useUser();
  const planIndex = user?.subscription?.plan ?? 0;
  const planLabel = PLAN_LABELS[planIndex] || "Free";

  return (
    <View style={styles.container}>
      <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill}>
        <View style={styles.glass} />
      </BlurView>
      <View style={styles.pill}>
        <Text style={styles.planText}>{planLabel}</Text>
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
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(15,23,42,0.48)",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  planText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});

export default PlanPill;
