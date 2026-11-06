// File: components/props/BannerSlider.tsx
import React, { memo, useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
} from "react-native";
import Carousel from "react-native-reanimated-carousel";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../nav/MainNavigation";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { canUserAccessChapter } from "../../lib/entitlements";
import pallete from "../../lib/Colors";
import BannerSkelly, { BANNER_CARD_WIDTH, BANNER_CARD_HEIGHT } from "./BannerSkelly";
import CachedImage from "./CachedImage";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";

const Shimmer = createShimmerPlaceholder(LinearGradient);
const { width } = Dimensions.get("window");
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// --- Icons ---
const HeadphoneIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 18v-6a9 9 0 0 1 18 0v6"
      stroke="#38bdf8"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5ZM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5Z"
      fill="#38bdf8"
    />
  </Svg>
);

const DocumentIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
    <Path
      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
      stroke="#FFFFFF"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M14 2v6h6"
      stroke="#FFFFFF"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M16 13H8M16 17H8M10 9H8"
      stroke="#FFFFFF"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const ChevronRightIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 18l6-6-6-6"
      stroke="#fff"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// --- 120 FPS Worklet Pagination Dot with Liquid Color & Width Interpolation ---
const NativePaginationDot = memo(
  ({
    index,
    progress,
    count,
  }: {
    index: number;
    progress: SharedValue<number>;
    count: number;
  }) => {
    const accentColor = pallete.accent || "#00D2B4";

    const animatedDotStyle = useAnimatedStyle(() => {
      if (count <= 1) return { width: 6, opacity: 0.4 };

      const current = progress.value;
      const mod = ((current % count) + count) % count;
      let diff = Math.abs(mod - index);
      if (diff > count / 2) {
        diff = count - diff;
      }

      const dotWidth = interpolate(
        diff,
        [0, 0.5, 1],
        [24, 12, 6],
        Extrapolation.CLAMP
      );
      const opacity = interpolate(
        diff,
        [0, 1],
        [1, 0.32],
        Extrapolation.CLAMP
      );
      const scale = interpolate(
        diff,
        [0, 1],
        [1, 0.88],
        Extrapolation.CLAMP
      );
      const backgroundColor = interpolateColor(
        diff,
        [0, 0.65, 1],
        [accentColor, "rgba(255, 255, 255, 0.55)", "rgba(255, 255, 255, 0.35)"]
      );

      return {
        width: dotWidth,
        opacity,
        transform: [{ scale }],
        backgroundColor,
      };
    });

    return <Animated.View style={[styles.dot, animatedDotStyle]} />;
  }
);

interface BannerCardProps {
  item: any;
  index: number;
  count: number;
  progress: SharedValue<number>;
  isActive: boolean;
  onPress: (item: any) => void;
}

const BannerCard = memo(
  ({ item, index, count, progress, isActive, onPress }: BannerCardProps) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const zoomScale = useSharedValue(1);
    const pressScale = useSharedValue(1);

    // Smooth continuous Ken Burns slow zoom loop on active front card
    useEffect(() => {
      if (isActive) {
        zoomScale.value = withRepeat(
          withSequence(
            withTiming(1.07, {
              duration: 5200,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            }),
            withTiming(1.0, {
              duration: 3800,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            })
          ),
          -1,
          true
        );
      } else {
        cancelAnimation(zoomScale);
        zoomScale.value = withTiming(1, {
          duration: 360,
          easing: Easing.out(Easing.cubic),
        });
      }
    }, [isActive]);

    // Real-time 120fps UI-Thread Card Container Interpolation during swipe
    const animatedCardContainerStyle = useAnimatedStyle(() => {
      if (count <= 1) {
        return {
          transform: [{ scale: pressScale.value }],
        };
      }

      const current = progress.value;
      const mod = ((current % count) + count) % count;
      let signedDiff = mod - index;
      if (signedDiff > count / 2) signedDiff -= count;
      if (signedDiff < -count / 2) signedDiff += count;
      const absDiff = Math.abs(signedDiff);

      // Subtle vertical elevation & rotation polish as card enters/leaves center
      const translateY = interpolate(
        absDiff,
        [0, 1],
        [0, 6],
        Extrapolation.CLAMP
      );
      const cardOpacity = interpolate(
        absDiff,
        [0, 1, 1.5],
        [1, 0.76, 0.45],
        Extrapolation.CLAMP
      );

      return {
        opacity: cardOpacity,
        transform: [
          { translateY },
          { scale: pressScale.value },
        ],
      };
    });

    // Inner Cover Art Window Parallax + Ken Burns Scale on UI Thread
    const animatedImageStyle = useAnimatedStyle(() => {
      if (count <= 1) {
        return {
          transform: [{ scale: zoomScale.value }],
        };
      }

      const current = progress.value;
      const mod = ((current % count) + count) % count;
      let signedDiff = mod - index;
      if (signedDiff > count / 2) signedDiff -= count;
      if (signedDiff < -count / 2) signedDiff += count;

      // Opposite horizontal shift creates a deep window-parallax optical effect
      const parallaxTranslateX = interpolate(
        signedDiff,
        [-1, 0, 1],
        [-18, 0, 18],
        Extrapolation.CLAMP
      );

      return {
        transform: [
          { translateX: parallaxTranslateX },
          { scale: zoomScale.value * 1.04 },
        ],
      };
    });

    // Bottom Text & CTA Staggered Focus Interpolation on UI Thread
    const animatedContentStyle = useAnimatedStyle(() => {
      if (count <= 1) return {};

      const current = progress.value;
      const mod = ((current % count) + count) % count;
      let diff = Math.abs(mod - index);
      if (diff > count / 2) diff = count - diff;

      const contentOpacity = interpolate(
        diff,
        [0, 0.75, 1],
        [1, 0.72, 0.45],
        Extrapolation.CLAMP
      );
      const contentTranslateY = interpolate(
        diff,
        [0, 1],
        [0, 8],
        Extrapolation.CLAMP
      );

      return {
        opacity: contentOpacity,
        transform: [{ translateY: contentTranslateY }],
      };
    });

    const handlePressIn = useCallback(() => {
      pressScale.value = withSpring(0.968, {
        damping: 17,
        stiffness: 280,
        mass: 0.6,
      });
    }, []);

    const handlePressOut = useCallback(() => {
      pressScale.value = withSpring(1, {
        damping: 14,
        stiffness: 220,
        mass: 0.6,
      });
    }, []);

    const bannerType = item?.bannerType || "standalone_book";
    const redirectionType = item?.redirectionType;
    const isSeries =
      bannerType === "series" ||
      redirectionType === "series" ||
      item?.type === "series";
    const isScreen =
      bannerType === "screen" ||
      redirectionType === "screen" ||
      redirectionType === "page" ||
      Boolean(item?.targetScreen) ||
      [
        "downloads",
        "trending",
        "subscription",
        "upgrade",
        "profile",
        "liked",
        "recent_reads",
      ].includes(redirectionType) ||
      [
        "downloads",
        "trending",
        "subscription",
        "upgrade",
        "profile",
        "liked",
        "recent_reads",
      ].includes(item?.action);
    const isAnnouncement =
      (bannerType === "announcement" || redirectionType === "none") &&
      !isSeries &&
      !isScreen;
    const isChapter = !isSeries && !isScreen && !isAnnouncement;
    const isFramework = Boolean(item?.isFramework || item?.type === "framework");
    const isAudio = String(item?.type || "").toLowerCase().includes("audio");

    const targetScreen = (
      item?.targetScreen ||
      item?.action ||
      (isScreen ? redirectionType : "") ||
      ""
    ).toLowerCase();

    // Title & Subtext
    const title = item?.title || "Featured Selection";
    const subText = isAnnouncement
      ? item?.subText || item?.subtitle || "Stay updated with Readapt milestones"
      : isScreen
      ? item?.subText || item?.subtitle || "Tap to explore"
      : isSeries
      ? item?.subText || `${item?.chapters?.length || 0} Chapters • Curated Series`
      : item?.subText || `By ${item?.author || "Readapt Curators"}`;

    // CTA Button Text
    let ctaText = "Start Reading";
    if (isSeries) {
      ctaText = isFramework ? "Join Framework" : "Join Series";
    } else if (isChapter) {
      ctaText = isAudio ? "Listen Now" : "Start Reading";
    } else if (isScreen) {
      if (targetScreen === "downloads") ctaText = "Go to Downloads";
      else if (targetScreen === "trending") ctaText = "Go to Trending";
      else if (targetScreen === "subscription" || targetScreen === "upgrade")
        ctaText = "Early Access Perks";
      else if (targetScreen === "profile") ctaText = "Go to Profile";
      else if (targetScreen === "liked") ctaText = "Go to Favorites";
      else if (targetScreen === "recent_reads") ctaText = "Go to Recent Reads";
      else ctaText = item?.ctaText || "Explore";
    } else if (isAnnouncement) {
      ctaText = item?.ctaText || "Explore";
    }

    return (
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onPress(item)}
        style={[
          styles.cardContainer,
          { width: BANNER_CARD_WIDTH, height: BANNER_CARD_HEIGHT },
          animatedCardContainerStyle,
        ]}
      >
        {/* Inner MD3 Skeleton while image loads */}
        {!imageLoaded && (
          <Shimmer
            shimmerColors={["#1D162F", "#2E234A", "#1D162F"]}
            duration={1450}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* 3:4 Cover Art with UI-thread Window Parallax + Continuous Ken Burns */}
        {Boolean(item?.cover || item?.image) && (
          <Animated.View
            style={[styles.coverImage, styles.coverImageClip, animatedImageStyle]}
          >
            <CachedImage
              uri={item.cover || item.image}
              label={title}
              style={StyleSheet.absoluteFillObject}
              letterSize={72}
              priority={isActive ? "high" : "low"}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          </Animated.View>
        )}

        {/* Cinematic Gradient Backdrop */}
        <LinearGradient
          colors={[
            "rgba(0, 0, 0, 0.42)",
            "rgba(9, 3, 20, 0.06)",
            "rgba(9, 3, 20, 0.78)",
            "rgba(9, 3, 20, 0.98)",
          ]}
          locations={[0, 0.32, 0.72, 1]}
          style={styles.gradientOverlay}
        />

        {/* Top Media Tag: ONLY shown for standalone Chapter banners */}
        {isChapter && (
          <View
            style={[
              styles.chapterMediaBadge,
              isAudio && styles.audioChapterMediaBadge,
            ]}
          >
            {isAudio ? <HeadphoneIcon /> : <DocumentIcon />}
          </View>
        )}

        {/* Bottom Content Area with Smooth Parallax Focus */}
        <Animated.View style={[styles.bottomContent, animatedContentStyle]}>
          <Text style={styles.bannerTitle} numberOfLines={2}>
            {title}
          </Text>

          <Text style={styles.bannerAuthor} numberOfLines={2}>
            {subText}
          </Text>

          <View style={styles.actionRow}>
            <View
              style={[
                styles.ctaButton,
                isSeries &&
                  (isFramework
                    ? styles.frameworkCtaButton
                    : styles.seriesCtaButton),
              ]}
            >
              <Text style={styles.ctaButtonText}>{ctaText}</Text>
              <ChevronRightIcon />
            </View>
          </View>
        </Animated.View>
      </AnimatedPressable>
    );
  }
);

interface BannerSliderProps {
  banners: any[];
  loading?: boolean;
}

export default function BannerSlider({
  banners,
  loading = false,
}: BannerSliderProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useUser();
  const { showToast } = useToast();

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const progressValue = useSharedValue<number>(0);

  const handlePress = useCallback(
    (item: any) => {
      if (!item) return;

      const bannerType = item?.bannerType;
      const redirectionType = item?.redirectionType;
      const targetScreen = (
        item?.targetScreen ||
        item?.action ||
        (bannerType === "screen" || redirectionType === "screen"
          ? item?.targetId
          : "") ||
        ""
      )
        .toLowerCase()
        .trim();

      // 1. App Screen / Page Redirection
      if (
        bannerType === "screen" ||
        redirectionType === "screen" ||
        redirectionType === "page" ||
        [
          "downloads",
          "trending",
          "subscription",
          "upgrade",
          "profile",
          "liked",
          "recent_reads",
        ].includes(targetScreen) ||
        [
          "downloads",
          "trending",
          "subscription",
          "upgrade",
          "profile",
          "liked",
          "recent_reads",
        ].includes(redirectionType)
      ) {
        const dest =
          targetScreen || (redirectionType || "").toLowerCase().trim();
        switch (dest) {
          case "downloads":
            navigation.navigate("Tabs" as any, { screen: "Downloads" } as any);
            return;
          case "profile":
            navigation.navigate("Tabs" as any, { screen: "Profile" } as any);
            return;
          case "trending":
            navigation.navigate("TrendingBooks" as any);
            return;
          case "subscription":
          case "upgrade":
            navigation.navigate("Subscription" as any);
            return;
          case "liked":
            navigation.navigate("LikedContent" as any);
            return;
          case "recent_reads":
          case "history":
            navigation.navigate("RecentReads" as any);
            return;
          default:
            navigation.navigate("Tabs" as any);
            return;
        }
      }

      // 2. Announcement without redirection / Static
      if (
        redirectionType === "none" ||
        (bannerType === "announcement" &&
          (!targetScreen || targetScreen === "toast"))
      ) {
        showToast({
          title:
            item?.subText ||
            item?.subtitle ||
            item?.title ||
            "Spotlight Featured",
        });
        return;
      }

      // 3. Series Banner Action -> Navigate to Series Overview
      if (
        bannerType === "series" ||
        redirectionType === "series" ||
        item?.targetModel === "Series"
      ) {
        const seriesId = item?.targetId || item?._id || item?.id;
        if (seriesId) {
          navigation.navigate("SeriesOverview", { seriesId: String(seriesId) });
        }
        return;
      }

      // 4. Standalone Book / Chapter Action
      const targetId = item?.targetId || item?._id || item?.id;
      if (!targetId) return;

      const accessCheck = canUserAccessChapter(user, item?.for ?? 0);
      if (!accessCheck.allowed) {
        showToast({
          title:
            accessCheck.reason ||
            "Upgrade your subscription to access this content.",
        });
        navigation.navigate("Subscription" as any);
        return;
      }

      const isAudio = String(item?.type || "").toLowerCase().includes("audio");
      if (isAudio) {
        navigation.navigate("AudioRdr", {
          bookId: String(targetId),
          initialBookData: item,
        } as any);
      } else {
        navigation.navigate("ReadBook", {
          bookId: String(targetId),
          initialBookData: item,
        } as any);
      }
    },
    [user, navigation, showToast]
  );

  const data = useMemo(() => {
    if (!banners || banners.length === 0) return [];
    return banners;
  }, [banners]);

  if (loading) {
    return <BannerSkelly />;
  }

  if (data.length === 0) {
    return null;
  }

  return (
    <View style={styles.sliderWrapper}>
      <Carousel
        loop={data.length > 1}
        autoPlay={data.length > 1}
        autoPlayInterval={5200}
        scrollAnimationDuration={520}
        withAnimation={{
          type: "spring",
          config: {
            damping: 22,
            stiffness: 175,
            mass: 0.75,
            overshootClamping: false,
          },
        }}
        width={BANNER_CARD_WIDTH + 14}
        height={BANNER_CARD_HEIGHT + 10}
        style={{ width, alignSelf: "center" }}
        data={data}
        pagingEnabled
        snapEnabled
        overscrollEnabled={false}
        maxScrollDistancePerSwipe={width * 0.85}
        mode="parallax"
        modeConfig={{
          parallaxScrollingScale: 0.92,
          parallaxScrollingOffset: 38,
          parallaxAdjacentItemScale: 0.86,
        }}
        onProgressChange={(_, absoluteProgress) => {
          progressValue.value = absoluteProgress;
        }}
        onSnapToItem={(index) => {
          setActiveSlideIndex(index);
        }}
        onConfigurePanGesture={(gestureChain: any) =>
          gestureChain.activeOffsetX([-8, 8]).failOffsetY([-20, 20])
        }
        renderItem={({ item, index }) => (
          <View style={styles.slideItemWrap}>
            <BannerCard
              item={item}
              index={index}
              count={data.length}
              progress={progressValue}
              isActive={index === activeSlideIndex}
              onPress={handlePress}
            />
          </View>
        )}
      />

      {/* Real-Time Native 120 FPS UI-Thread Pagination Dots */}
      {data.length > 1 && (
        <View style={styles.paginationRow}>
          {data.map((_, idx) => (
            <NativePaginationDot
              key={idx}
              index={idx}
              progress={progressValue}
              count={data.length}
            />
          ))}
        </View>
      )}
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
  slideItemWrap: {
    width: BANNER_CARD_WIDTH + 14,
    height: BANNER_CARD_HEIGHT + 10,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContainer: {
    borderRadius: 22,
    backgroundColor: pallete.bgcard || "#130C25",
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.13)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.36,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  coverImageClip: {
    overflow: "hidden",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  chapterMediaBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  audioChapterMediaBadge: {
    borderColor: "rgba(56, 189, 248, 0.45)",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
  },
  bottomContent: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 24,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  bannerAuthor: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A1A1AA",
    lineHeight: 16,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  seriesCtaButton: {
    backgroundColor: "rgba(1, 121, 111, 0.45)",
    borderColor: "#01796F",
  },
  frameworkCtaButton: {
    backgroundColor: "rgba(56, 189, 248, 0.25)",
    borderColor: "#38bdf8",
  },
  ctaButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    gap: 6,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
});
