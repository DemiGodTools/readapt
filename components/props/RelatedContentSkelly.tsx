// File: components/props/RelatedContentSkelly.tsx
// Skeleton for the "Related Content" 2-column grid. Mirrors ContentCard's
// geometry (same width/height, cover square, format pill, title/author lines
// and stats row) so the section does not jump when the real cards arrive.
import React from "react";
import { StyleSheet, View } from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";
import { LinearGradient } from "expo-linear-gradient";

const Shimmer = createShimmerPlaceholder(LinearGradient);
const SHIMMER_COLORS: string[] = ["#191525", "#221e2e", "#191525"];

function SkeletonCard() {
  return (
    <View style={styles.card}>
      {/* Cover */}
      <Shimmer
        shimmerColors={SHIMMER_COLORS}
        duration={1500}
        style={styles.cover}
      />

      {/* Format pill */}
      <Shimmer
        shimmerColors={SHIMMER_COLORS}
        duration={1500}
        style={styles.formatPill}
      />

      {/* Title */}
      <Shimmer
        shimmerColors={SHIMMER_COLORS}
        duration={1500}
        style={styles.title}
      />

      {/* Author */}
      <Shimmer
        shimmerColors={SHIMMER_COLORS}
        duration={1500}
        style={styles.author}
      />

      {/* Stats row */}
      <View style={styles.statsRow}>
        <Shimmer
          shimmerColors={SHIMMER_COLORS}
          duration={1500}
          style={styles.stat}
        />
        <Shimmer
          shimmerColors={SHIMMER_COLORS}
          duration={1500}
          style={styles.stat}
        />
      </View>
    </View>
  );
}

export default function RelatedContentSkelly({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <View key={`related-skelly-${index}`} style={styles.wrapper}>
          <SkeletonCard />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "48%",
    marginBottom: 8,
  },
  card: {
    width: "100%",
    height: 295,
    backgroundColor: "rgba(20, 20, 20, 0.6)",
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  cover: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  formatPill: {
    width: 44,
    height: 14,
    borderRadius: 5,
    marginBottom: 7,
  },
  title: {
    width: "82%",
    height: 13,
    borderRadius: 6,
    marginBottom: 6,
  },
  author: {
    width: "55%",
    height: 10,
    borderRadius: 5,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "auto",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  stat: {
    width: 32,
    height: 10,
    borderRadius: 5,
  },
});
