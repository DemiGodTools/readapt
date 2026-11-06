// File: components/props/ContentCard.tsx
import React, { memo, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Dimensions, DeviceEventEmitter } from "react-native";
import Svg, { Path, Polyline, Line, Rect, Circle } from "react-native-svg";
import pallete from "../../lib/Colors";
import { IChapter } from "../../types/Chapter";
import PopButton from "./PopButton";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../nav/MainNavigation";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { IUser } from "../../types/User";
import { canUserAccessChapter } from "../../lib/entitlements";
import CachedImage from "./CachedImage";

const { width } = Dimensions.get("window");

const CARD_GAP = 12;
const SIDE_PADDING = 20;
const CARD_WIDTH = (width - SIDE_PADDING * 2 - CARD_GAP) / 2;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const WhiteCenterLockIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Rect
      x={3}
      y={11}
      width={18}
      height={11}
      rx={2}
      ry={2}
      stroke="#ffffff"
      strokeWidth={2.2}
      fill="none"
    />
    <Path
      d="M7 11V7a5 5 0 0 1 10 0v4"
      stroke="#ffffff"
      strokeWidth={2.2}
      strokeLinecap="round"
    />
  </Svg>
);

interface ContentCardProps {
  book: IChapter | any;
  index?: number;
  seriesType?: "normal" | "framework" | "standalone";
  isFramework?: boolean;
  isLocked?: boolean;
  isCompleted?: boolean;
  isLiked?: boolean;
  cardWidth?: number;
  compact?: boolean;
}

const ContentCard = memo(
  ({
    book,
    index,
    seriesType,
    isFramework = false,
    isLocked = false,
    isCompleted = false,
    isLiked: isLikedProp,
    cardWidth,
    compact = false,
  }: ContentCardProps) => {
    const navigation = useNavigation<NavigationProp>();
    const { showToast } = useToast();
    const { user }: { user: IUser | null } = useUser();

    const finalBookData: any =
      typeof (book as any)?.content === "object" && (book as any)?.content
        ? (book as any).content
        : book;

    const handlePress = () => {
      const targetId = finalBookData?._id;

      if (!targetId) {
        showToast({ title: "Unable to load chapter" });
        return;
      }

      if (isLocked) {
        const prevLevel = index !== undefined && index > 0 ? index : 1;
        const currentLvl = index !== undefined ? index + 1 : 2;
        showToast({
          title: `Complete Level ${prevLevel} to unlock Level ${currentLvl}!`,
        });
        return;
      }

      const accessCheck = canUserAccessChapter(user, finalBookData?.for ?? 0);

      if (!accessCheck.allowed) {
        showToast({
          title: accessCheck.reason || "Upgrade your subscription to access this content.",
        });
        return;
      }

      const isFrameworkMode =
        seriesType === "framework" || isFramework === true;

      const mediaType = finalBookData?.type ?? "pdf";
      const sId =
        typeof finalBookData?.series === "object"
          ? finalBookData?.series?._id
          : finalBookData?.series;

      if (mediaType === "pdf") {
        navigation.navigate("ReadBook", {
          bookId: String(targetId),
          initialBookData: finalBookData,
          isFramework: isFrameworkMode,
          seriesType: isFrameworkMode ? "framework" : (seriesType || undefined),
          seriesId: sId,
        } as any);
      } else {
        navigation.navigate("AudioRdr", {
          bookId: String(targetId),
          initialBookData: finalBookData,
          isFramework: isFrameworkMode,
          seriesType: isFrameworkMode ? "framework" : (seriesType || undefined),
          seriesId: sId,
        } as any);
      }
    };

    const isFrameworkMode =
      seriesType === "framework" || isFramework === true;
    const dynamicNumber = index !== undefined ? index + 1 : 1;
    const badgeLabel = isFrameworkMode ? `Level ${dynamicNumber}` : null;

    const isLikedInUser = useMemo(() => {
      if (!user?.likes || !Array.isArray(user.likes) || !finalBookData?._id) return false;
      const targetId = String(finalBookData._id);
      return user.likes.some((l: any) => {
        const id = typeof l === "string" ? l : String(l?._id || l?.$oid || "");
        return id === targetId;
      });
    }, [user?.likes, finalBookData?._id]);

    const isItemLiked =
      isLikedProp !== undefined
        ? Boolean(isLikedProp)
        : Boolean(finalBookData?.isLiked) || isLikedInUser;

    const [likeOverride, setLikeOverride] = useState<{
      liked: boolean;
      count: number;
    } | null>(null);

    useEffect(() => {
      const subscription = DeviceEventEmitter.addListener("like-updated", (event: any) => {
        if (String(event?.chapterId) !== String(finalBookData?._id)) return;
        if (typeof event?.count !== "number") return;
        setLikeOverride({
          liked: Boolean(event.liked),
          count: Number(event.count),
        });
      });
      return () => subscription.remove();
    }, [finalBookData?._id]);

    useEffect(() => {
      setLikeOverride(null);
    }, [finalBookData?.likes, finalBookData?.isLiked]);

    const likesCount = Array.isArray(finalBookData.likes)
      ? finalBookData.likes.length
      : typeof finalBookData.likes === "number"
      ? finalBookData.likes
      : 0;

    const commentsCount = Array.isArray(finalBookData.comments)
      ? finalBookData.comments.length
      : typeof finalBookData.comments === "number"
      ? finalBookData.comments
      : 0;

    const effectiveLiked = likeOverride?.liked ?? isItemLiked;
    const effectiveLikesCount = likeOverride?.count ?? likesCount;

    return (
      <PopButton
        styles={[
          styles.bookCard,
          cardWidth ? { width: cardWidth } : null,
          compact && styles.bookCardCompact,
        ]}
        scale={0.97}
        onPress={handlePress}
      >
        <View style={[styles.bookCoverWrap, compact && styles.bookCoverWrapCompact]}>
          <CachedImage
            uri={finalBookData.cover}
            label={finalBookData.title || "Untitled"}
            style={[styles.bookCover, isLocked && styles.bookCoverLocked]}
            letterSize={44}
          />

          {isLocked && (
            <View style={styles.lockedDimOverlay}>
              <View style={[styles.centerLockCircle, compact && { width: 34, height: 34, borderRadius: 17 }]}>
                <WhiteCenterLockIcon />
              </View>
            </View>
          )}

          {badgeLabel ? (
            <View
              style={[
                styles.cardBadge,
                isLocked
                  ? styles.lockedPillBadge
                  : { backgroundColor: "#38bdf8" },
                compact && { paddingHorizontal: 4, paddingVertical: 2 },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: isLocked ? "#ffffff" : "#050505" },
                  compact && { fontSize: 8 },
                ]}
              >
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.formatIndicator, compact && styles.formatIndicatorCompact]}>
          {finalBookData.type === "audio" ? (
            <Svg width={compact ? 10 : 12} height={compact ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </Svg>
          ) : (
            <Svg width={compact ? 10 : 12} height={compact ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <Polyline points="14 2 14 8 20 8" />
              <Line x1="16" y1="13" x2="8" y2="13" />
              <Line x1="16" y1="17" x2="8" y2="17" />
            </Svg>
          )}
          <Text style={[styles.formatText, compact && styles.formatTextCompact]}>
            {finalBookData.type === "audio" ? "Audio" : "PDF"}
          </Text>
        </View>

        <View style={[styles.textContainer, compact && styles.textContainerCompact]}>
          <Text
            style={[styles.bookTitle, compact && styles.bookTitleCompact]}
            numberOfLines={compact ? 2 : 1}
            ellipsizeMode="tail"
          >
            {finalBookData.title || "Untitled"}
          </Text>

          {!compact && (
            finalBookData.shortDescription ? (
              <Text style={styles.bookShortDesc} numberOfLines={isCompleted ? 1 : 2} ellipsizeMode="tail">
                {finalBookData.shortDescription}
              </Text>
            ) : (
              <Text style={styles.bookAuthor} numberOfLines={1} ellipsizeMode="tail">
                {finalBookData.author || "READAPT"}
              </Text>
            )
          )}

          {compact && (
            <Text style={styles.bookAuthorCompact} numberOfLines={1} ellipsizeMode="tail">
              {finalBookData.author || "READAPT"}
            </Text>
          )}

          {isCompleted && (
            <View style={styles.completedTagRow}>
              <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                <Circle cx="12" cy="12" r="10" fill="#10b981" />
                <Path
                  d="M8 12.5l2.5 2.5L16 9"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={styles.completedTagText}>Completed</Text>
            </View>
          )}
        </View>

        <View style={[styles.bookStats, compact && styles.bookStatsCompact]}>
          <View style={styles.statItem}>
            <Svg width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill={effectiveLiked ? "#eb4040" : "none"} stroke={effectiveLiked ? "#eb4040" : pallete.textgray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </Svg>
            <Text style={[styles.statText, compact && { fontSize: 10 }, effectiveLiked && { color: "#eb4040", fontWeight: "700" }]}>
              {effectiveLikesCount}
            </Text>
          </View>

          {!compact && (
            <View style={styles.statItem}>
              <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={pallete.textgray} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </Svg>
              <Text style={styles.statText}>{commentsCount}</Text>
            </View>
          )}
        </View>
      </PopButton>
    );
  }
);

const styles = StyleSheet.create({
  bookCard: {
    width: CARD_WIDTH,
    height: 295,
    backgroundColor: "rgba(20, 20, 20, 0.6)",
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 16,
    flexDirection: "column",
  },
  bookCoverWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: "#161616",
  },
  bookCover: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  bookCoverLocked: {
    opacity: 0.45,
    filter: [{ grayscale: 1 }],
  },
  lockedDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 10, 12, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerLockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(20, 20, 22, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
  },
  lockedPillBadge: {
    backgroundColor: "rgba(35, 35, 40, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
    top: 6,
    right: 6,
    borderBottomLeftRadius: 12,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  formatIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  formatText: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "500",
  },
  textContainer: {
    height: 52,
    justifyContent: "flex-start",
  },
  bookTitle: {
    fontFamily: "Playfair Display",
    fontSize: 15,
    fontWeight: "600",
    color: pallete.textwhite,
    lineHeight: 18,
    marginBottom: 3,
  },
  bookShortDesc: {
    fontSize: 11,
    lineHeight: 20,
    color: "#9ca3af",
  },
  bookAuthor: {
    fontSize: 11,
    color: pallete.textgray,
  },
  bookStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: "auto",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: pallete.textgray,
  },
  completedTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  completedTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#10b981",
    letterSpacing: 0.3,
  },
  bookCardCompact: {
    height: undefined,
    padding: 7,
    borderRadius: 12,
    marginBottom: 12,
  },
  bookCoverWrapCompact: {
    aspectRatio: 0.78,
    borderRadius: 8,
    marginBottom: 6,
  },
  textContainerCompact: {
    height: 42,
    justifyContent: "flex-start",
  },
  bookTitleCompact: {
    fontFamily: "Playfair Display",
    fontSize: 11,
    fontWeight: "600",
    color: pallete.textwhite,
    lineHeight: 14,
    marginBottom: 2,
  },
  bookAuthorCompact: {
    fontSize: 10,
    color: pallete.textgray,
    lineHeight: 12,
  },
  formatIndicatorCompact: {
    paddingVertical: 1,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderRadius: 4,
  },
  formatTextCompact: {
    fontSize: 8,
  },
  bookStatsCompact: {
    paddingTop: 4,
    marginTop: 4,
  },
});

export default ContentCard;