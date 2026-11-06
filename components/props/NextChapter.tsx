import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { IChapter } from "../../types/Chapter";
import PopButton from "./PopButton";
import { useUser } from "../../hooks/useUser";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../nav/MainNavigation";
import { useToast } from "../../hooks/useToast";
import useAuth from "../../hooks/useAuth";
import { api } from "../../lib/api";
import NextChapterCardSkelly from "./NextChapterSkelly";
import CachedImage from "./CachedImage";
import { assetPallete } from "../../lib/Colors";
import { ISeriesContent } from "../../types/Series";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { SubscriptionPlan } from "../../enums";
import { IS_EARLY_ACCESS_FREE, canUserAccessChapter } from "../../lib/entitlements";

const colors = {
  bgMain: "#090314",
  bgCard: "rgba(20, 20, 20, 0.6)",
  accent: "#01796F",
  ctlBg: "#D0F2EE",
  ctlIcon: "#004D46",
  textGray: "#9ca3af",
  textWhite: "#ffffff",
  surfaceVariant: "rgba(255, 255, 255, 0.08)",
};

type BookPopulated = {
  _id: string;
  title: string;
  details?: string;
  media: string;
  type: "pdf" | "audio";
  for: SubscriptionPlan;
  isTrending: boolean;
  comments: any[];
  cover: string;
  category: any;
  series?: any;
  likes: number;
  author: string;
  total: number;
  isDownloadable: boolean;
  toc: {
    cut: string;
    title: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Fast in-memory cache to avoid skeleton flashing on re-opening
const chaptersMemoryCache = new Map<string, BookPopulated[]>();

const NextChapter = ({
  book,
  onOpen,
  viewer,
}: {
  book: BookPopulated;
  onOpen: (book: BookPopulated) => void;
  viewer: "pdf" | "audio";
}) => {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useUser();
  const { showToast } = useToast();
  const { accessToken } = useAuth();
  const { isConnected } = useNetworkStatus();

  const bookId = String(book?._id || (book as any)?.id || "");
  const targetSeriesId =
    typeof book?.series === "object" ? book?.series?._id : book?.series;

  const cacheKey = targetSeriesId ? `series_${targetSeriesId}` : `book_${bookId}`;

  const [nextChapters, setNextChapters] = useState<BookPopulated[]>(() => {
    return chaptersMemoryCache.get(cacheKey) || [];
  });
  const [isLoading, setIsLoading] = useState(() => !chaptersMemoryCache.has(cacheKey));

  const renderContentCard = ({ item }: { item: BookPopulated }) => {
    if (!item || !item._id) return null;

    return (
      <PopButton
        styles={styles.queueItem}
        scale={0.96}
        onPress={() => {
          const accessCheck = canUserAccessChapter(user, item.for ?? 0);
          if (IS_EARLY_ACCESS_FREE || accessCheck.allowed) {
            if (onOpen) {
              onOpen(item);
            } else {
              const route = item.type === "audio" ? "AudioRdr" : "ReadBook";
              navigation.navigate(route, {
                bookId: item._id,
                initialBookData: item,
              });
            }
          } else {
            showToast({
              title: accessCheck.reason || "Upgrade your subscription to access this content.",
            });
          }
        }}
      >
        <View style={styles.queueWrapper}>
          <View style={styles.queueThumbContainer}>
            <CachedImage
              uri={item.cover}
              label={item.title}
              style={styles.queueThumb}
              transition={0}
              letterSize={18}
            />
            <View
              style={[
                styles.queueCardBadge,
                {
                  backgroundColor:
                    item.type === "pdf" ? assetPallete[0] : assetPallete[1],
                },
              ]}
            >
              <Text style={styles.badgeText}>
                {item.type === "pdf" ? "BOOK" : "AUDIO"}
              </Text>
            </View>
          </View>

          <View style={styles.queueInfo}>
            <Text style={styles.queueTitle} numberOfLines={1}>
              {item.title || "Untitled Chapter"}
            </Text>
            <Text style={styles.queueAuthor}>{item.author || "READAPT"}</Text>
            {Number(item.total) > 0 ? (
              <Text style={styles.pages}>
                {item.total} {item.type === "pdf" ? "pages" : "min"}
              </Text>
            ) : null}
          </View>
        </View>
      </PopButton>
    );
  };

  useEffect(() => {
    let isMounted = true;
    if (!bookId) return;

    const loadChapters = async () => {
      // 1. If book already has populated series chapters:
      if (book.series && Array.isArray(book.series.chapters)) {
        const rawChapters: ISeriesContent[] = book.series.chapters;
        const parsedChapters: BookPopulated[] = [];

        for (const item of rawChapters) {
          if (item.contentModel === "Chapter" && item.content) {
            const ch = item.content as any;
            const chId = String(typeof ch === "string" ? ch : ch._id || ch.id);
            if (chId && chId !== bookId && typeof ch === "object") {
              parsedChapters.push(ch);
            }
          }
        }

        if (isMounted) {
          chaptersMemoryCache.set(cacheKey, parsedChapters);
          setNextChapters(parsedChapters);
          setIsLoading(false);
        }
        return;
      }

      // 2. If target series ID exists, ONLY fetch chapters from this exact joined series
      const cleanTargetSeriesId = String(targetSeriesId || "").trim();
      if (
        cleanTargetSeriesId &&
        cleanTargetSeriesId !== "undefined" &&
        cleanTargetSeriesId !== "null" &&
        cleanTargetSeriesId !== "[object Object]" &&
        cleanTargetSeriesId.length >= 10 &&
        isConnected
      ) {
        try {
          const res = await api.get(`/series/${cleanTargetSeriesId}`, {
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          });

          const seriesData = res?.data?.data;
          if (seriesData?.chapters && isMounted) {
            const parsedChapters: BookPopulated[] = [];
            for (const item of seriesData.chapters) {
              if (item.contentModel === "Chapter" && item.content) {
                const ch = item.content as any;
                const chId = String(typeof ch === "string" ? ch : ch._id || ch.id);
                if (chId && chId !== bookId && typeof ch === "object") {
                  parsedChapters.push(ch);
                }
              }
            }

            chaptersMemoryCache.set(cacheKey, parsedChapters);
            setNextChapters(parsedChapters);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn("Failed to load series chapters for queue:", err);
        }
      }

      if (isMounted) {
        setIsLoading(false);
      }
    };

    loadChapters();

    return () => {
      isMounted = false;
    };
  }, [bookId, targetSeriesId, accessToken, isConnected, cacheKey]);

  return (
    <View>
      {isLoading ? (
        <FlatList
          data={[1, 2, 3]}
          keyExtractor={(item) => String(item)}
          renderItem={() => <NextChapterCardSkelly />}
          numColumns={1}
          scrollEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            gap: 12,
          }}
        />
      ) : (
        <FlatList
          data={nextChapters}
          keyExtractor={(item) => String(item._id || item.title)}
          renderItem={renderContentCard}
          numColumns={1}
          scrollEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            gap: 12,
          }}
        />
      )}
    </View>
  );
};

export default NextChapter;

const styles = StyleSheet.create({
  queueItem: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  queueWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  queueThumbContainer: {
    width: 54,
    height: 54,
    position: "relative",
    borderRadius: 10,
    overflow: "hidden",
  },
  queueThumb: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  queueCardBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderBottomLeftRadius: 6,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  queueInfo: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 14.5,
    fontWeight: "600",
    color: colors.textWhite,
    marginBottom: 2,
  },
  queueAuthor: {
    fontSize: 11.5,
    color: colors.textGray,
    marginBottom: 4,
  },
  pages: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2dd4bf",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
