import React, { memo, useState, useEffect } from "react";
import { View, Text, Image, StyleSheet, Dimensions, DeviceEventEmitter } from "react-native";
import Svg, { Path, Polyline, Line } from "react-native-svg";
import pallete from "../../lib/Colors";
import { IChapter } from "../../types/Chapter";
import PopButton from "./PopButton";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../nav/MainNavigation";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { IUser } from "../../types/User";

const { width } = Dimensions.get("window");

const CARD_GAP = 12;
const SIDE_PADDING = 20;
const CARD_WIDTH = (width - SIDE_PADDING * 2 - CARD_GAP) / 2;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ContentCardProps {
  book: IChapter | any;
  index?: number;
  seriesType?: "normal" | "framework" | "standalone";
  isFramework?: boolean;
  isLiked?: boolean;
}

const ContentCard = memo(
  ({
    book,
    index,
    seriesType,
    isFramework = false,
    isLiked: isLikedProp,
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

      const requiredPlan = finalBookData?.for ?? 0;
      const mediaType = finalBookData?.type ?? "pdf";

      if ((user?.subscription?.plan ?? 0) >= requiredPlan) {
        if (mediaType === "pdf") {
          navigation.navigate("ReadBook", {
            bookId: String(targetId),
            initialBookData: finalBookData,
          } as any);
        } else {
          navigation.navigate("AudioRdr", {
            bookId: String(targetId),
            initialBookData: finalBookData,
          } as any);
        }
      } else {
        showToast({
          title: "Upgrade your subscription to access this content.",
        });
      }
    };

    // Sirf framework mode me Level badge dikhega; normal standalone chapters se badge hata diya gaya hai
    const isFrameworkMode =
      seriesType === "framework" || isFramework === true;
    const dynamicNumber = index !== undefined ? index + 1 : 1;
    const badgeLabel = isFrameworkMode ? `Level ${dynamicNumber}` : null;

    // Liked status determination
    const isItemLiked =
      isLikedProp !== undefined
        ? Boolean(isLikedProp)
        : Boolean(finalBookData?.isLiked);

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
      <PopButton styles={styles.bookCard} scale={0.97} onPress={handlePress}>
        {/* 1. Square Image Wrap */}
        <View style={styles.bookCoverWrap}>
          <Image
            source={{
              uri:
                finalBookData.cover ||
                "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400",
            }}
            style={styles.bookCover}
          />

          {badgeLabel ? (
            <View
              style={[
                styles.cardBadge,
                { backgroundColor: "#38bdf8" },
              ]}>
              <Text style={[styles.badgeText, { color: "#050505" }]}>
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 2. Format Indicator Pill */}
        <View style={styles.formatIndicator}>
          {finalBookData.type === "audio" ? (
            <Svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9ca3af"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </Svg>
          ) : (
            <Svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9ca3af"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <Polyline points="14 2 14 8 20 8" />
              <Line x1="16" y1="13" x2="8" y2="13" />
              <Line x1="16" y1="17" x2="8" y2="17" />
            </Svg>
          )}
          <Text style={styles.formatText}>
            {finalBookData.type === "audio" ? "Audio" : "PDF"}
          </Text>
        </View>

        {/* 3. Text Info Section */}
        <View style={styles.textContainer}>
          <Text style={styles.bookTitle} numberOfLines={1} ellipsizeMode="tail">
            {finalBookData.title || "Untitled"}
          </Text>

          {finalBookData.shortDescription ? (
            <Text
              style={styles.bookShortDesc}
              numberOfLines={2}
              ellipsizeMode="tail">
              {finalBookData.shortDescription}
            </Text>
          ) : (
            <Text style={styles.bookAuthor} numberOfLines={1} ellipsizeMode="tail">
              {finalBookData.author || "READAPT"}
            </Text>
          )}
        </View>

        {/* 4. Stats Footer with Filled Heart Support */}
        <View style={styles.bookStats}>
          <View style={styles.statItem}>
            <Svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill={effectiveLiked ? "#eb4040" : "none"}
              stroke={effectiveLiked ? "#eb4040" : pallete.textgray}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </Svg>
            <Text
              style={[
                styles.statText,
                effectiveLiked && { color: "#eb4040", fontWeight: "700" },
              ]}>
              {effectiveLikesCount}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke={pallete.textgray}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </Svg>
            <Text style={styles.statText}>{commentsCount}</Text>
          </View>
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
  cardBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
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
    lineHeight: 15,
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
});

export default ContentCard;