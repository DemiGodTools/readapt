// File: components/props/BannerSkelly.tsx
import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions, Platform } from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import pallete from "../../lib/Colors";

const Shimmer = createShimmerPlaceholder(LinearGradient);
const { width } = Dimensions.get("window");

export const BANNER_CARD_WIDTH = Math.min(Math.round(width * 0.74), 285);
export const BANNER_CARD_HEIGHT = Math.round(BANNER_CARD_WIDTH * (4 / 3));

// Google Material Design 3 (MD3) Dark Tonal Surface & Shimmer Palette
const MD3_SURFACE_CONTAINER = "#161124";
const MD3_SHIMMER_BASE = ["#1D162F", "#2E234A", "#1D162F"];
const MD3_SHIMMER_ELEVATED = ["#261E3C", "#3D2F60", "#261E3C"];
const MD3_SHIMMER_ACCENT = ["#1A2E35", "#244B54", "#1A2E35"];
const MD3_SHIMMER_SIDE = ["#140E21", "#211836", "#140E21"];

// Peeking Side Card Geometry matching BannerSlider parallax modeConfig
const SIDE_CARD_SCALE = 0.88;
const PEEK_OFFSET = 38;

export default function BannerSkelly() {
  // Subtle MD3 tonal breathing wave across the skeleton slider
  const breatheOpacity = useSharedValue(0.88);

  useEffect(() => {
    breatheOpacity.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0.82, {
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      true
    );
  }, []);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    opacity: breatheOpacity.value,
  }));

  return (
    <View style={styles.sliderWrapper}>
      <Animated.View
        style={[
          styles.carouselStage,
          { height: BANNER_CARD_HEIGHT + 10 },
          animatedPulseStyle,
        ]}
      >
        {/* Left Peeking Parallax Skeleton Card (Matches Carousel Neighbor) */}
        <View
          style={[
            styles.sideCard,
            styles.leftPeekCard,
            {
              width: BANNER_CARD_WIDTH,
              height: BANNER_CARD_HEIGHT,
              transform: [
                { translateX: -PEEK_OFFSET },
                { scale: SIDE_CARD_SCALE },
              ],
            },
          ]}
        >
          <Shimmer
            shimmerColors={MD3_SHIMMER_SIDE}
            duration={1650}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.sideCardBottom}>
            <Shimmer
              shimmerColors={MD3_SHIMMER_BASE}
              duration={1650}
              style={styles.sideTitleSkelly}
            />
            <Shimmer
              shimmerColors={MD3_SHIMMER_BASE}
              duration={1650}
              style={styles.sideSubSkelly}
            />
          </View>
        </View>

        {/* Right Peeking Parallax Skeleton Card (Matches Carousel Neighbor) */}
        <View
          style={[
            styles.sideCard,
            styles.rightPeekCard,
            {
              width: BANNER_CARD_WIDTH,
              height: BANNER_CARD_HEIGHT,
              transform: [
                { translateX: PEEK_OFFSET },
                { scale: SIDE_CARD_SCALE },
              ],
            },
          ]}
        >
          <Shimmer
            shimmerColors={MD3_SHIMMER_SIDE}
            duration={1650}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.sideCardBottom}>
            <Shimmer
              shimmerColors={MD3_SHIMMER_BASE}
              duration={1650}
              style={styles.sideTitleSkelly}
            />
            <Shimmer
              shimmerColors={MD3_SHIMMER_BASE}
              duration={1650}
              style={styles.sideSubSkelly}
            />
          </View>
        </View>

        {/* Center Focal 3:4 Card Skeleton (Exact BannerCard Anatomy) */}
        <View
          style={[
            styles.centerCard,
            { width: BANNER_CARD_WIDTH, height: BANNER_CARD_HEIGHT },
          ]}
        >
          {/* Base MD3 Surface Shimmer */}
          <Shimmer
            shimmerColors={MD3_SHIMMER_BASE}
            duration={1500}
            style={[
              styles.coverShimmer,
              { width: BANNER_CARD_WIDTH, height: BANNER_CARD_HEIGHT },
            ]}
          />

          {/* Subtle MD3 Bottom Scrim for Tonal Hierarchy */}
          <LinearGradient
            colors={[
              "rgba(19, 12, 37, 0.05)",
              "rgba(19, 12, 37, 0.55)",
              "rgba(13, 8, 26, 0.94)",
            ]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Top-Right Circular Media Badge Skeleton (Matches chapterMediaBadge) */}
          <View style={styles.topRightBadgeWrap}>
            <Shimmer
              shimmerColors={MD3_SHIMMER_ELEVATED}
              duration={1500}
              style={styles.mediaIconSkelly}
            />
          </View>

          {/* Bottom Content Stack Skeleton (Matches bannerTitle, bannerAuthor, ctaButton) */}
          <View style={styles.bottomContent}>
            {/* Title Line 1 */}
            <Shimmer
              shimmerColors={MD3_SHIMMER_ELEVATED}
              duration={1500}
              style={styles.titleLinePrimary}
            />
            {/* Title Line 2 */}
            <Shimmer
              shimmerColors={MD3_SHIMMER_ELEVATED}
              duration={1500}
              style={styles.titleLineSecondary}
            />

            {/* Author / Subtitle Metadata Line */}
            <Shimmer
              shimmerColors={MD3_SHIMMER_BASE}
              duration={1500}
              style={styles.subtitleSkelly}
            />

            {/* CTA Pill Button Skeleton */}
            <View style={styles.actionRow}>
              <Shimmer
                shimmerColors={MD3_SHIMMER_ACCENT}
                duration={1500}
                style={styles.ctaButtonSkelly}
              />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Pagination Dots Skeleton Row (Prevents vertical layout shift on load) */}
      <View style={styles.paginationRow}>
        <Shimmer
          shimmerColors={MD3_SHIMMER_ACCENT}
          duration={1500}
          style={styles.activeDotSkelly}
        />
        <View style={styles.inactiveDotSkelly} />
        <View style={styles.inactiveDotSkelly} />
        <View style={styles.inactiveDotSkelly} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sliderWrapper: {
    width: "100%",
    marginTop: 18,
    marginBottom: 8,
    alignItems: "center",
  },
  carouselStage: {
    width,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  sideCard: {
    position: "absolute",
    borderRadius: 22,
    backgroundColor: "#110B1F",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    opacity: 0.52,
  },
  leftPeekCard: {
    left: (width - BANNER_CARD_WIDTH) / 2,
    zIndex: 1,
  },
  rightPeekCard: {
    right: (width - BANNER_CARD_WIDTH) / 2,
    zIndex: 1,
  },
  sideCardBottom: {
    position: "absolute",
    bottom: 18,
    left: 16,
    right: 16,
    gap: 8,
    opacity: 0.5,
  },
  sideTitleSkelly: {
    width: "70%",
    height: 16,
    borderRadius: 8,
  },
  sideSubSkelly: {
    width: "45%",
    height: 11,
    borderRadius: 6,
  },
  centerCard: {
    borderRadius: 22,
    backgroundColor: pallete.bgcard || MD3_SURFACE_CONTAINER,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.11)",
    position: "relative",
    zIndex: 5,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  coverShimmer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  topRightBadgeWrap: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
  },
  mediaIconSkelly: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  bottomContent: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  titleLinePrimary: {
    width: "84%",
    height: 18,
    borderRadius: 9,
    marginBottom: 6,
  },
  titleLineSecondary: {
    width: "56%",
    height: 18,
    borderRadius: 9,
    marginBottom: 10,
  },
  subtitleSkelly: {
    width: "62%",
    height: 12,
    borderRadius: 6,
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ctaButtonSkelly: {
    width: 116,
    height: 30,
    borderRadius: 14,
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    gap: 6,
  },
  activeDotSkelly: {
    width: 22,
    height: 5,
    borderRadius: 3,
  },
  inactiveDotSkelly: {
    width: 6,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
});
