import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Dimensions, FlatList, StyleSheet, Text, RefreshControl, DeviceEventEmitter } from "react-native";
import ContentCard from "../../../components/props/ContentCard";
import { useUser } from "../../../hooks/useUser";
import pallete from "../../../lib/Colors";

import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../components/nav/MainNavigation";
import { Path, Svg } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Offline from "../../../components/state/Offline";
import { useNetworkStatus } from "../../../hooks/useNetwork";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../../lib/api";
import { LikeManager } from "../../../lib/likeManager";

type Props = NativeStackScreenProps<RootStackParamList, "LikedContent">;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const HORIZONTAL_PADDING = 16;
const GRID_GAP = 10;
const CARD_WIDTH = Math.floor(
  (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS
);

/**
 * Extracts all rich chapter objects from cached feed data (zero network, instant in-memory lookup)
 */
const extractFeedChapterMap = (rawFeed: string | null): Map<string, any> => {
  const map = new Map<string, any>();
  if (!rawFeed) return map;
  try {
    const parsed = JSON.parse(rawFeed);

    const registerChapter = (raw: any) => {
      if (!raw) return;
      const ch = raw.content && typeof raw.content === "object" ? raw.content : raw;
      const id = String(ch._id || ch.id || "");
      if (id && !map.has(id)) {
        map.set(id, ch);
      }
    };

    // 1. Categories chapters
    if (Array.isArray(parsed.categories)) {
      parsed.categories.forEach((cat: any) => {
        if (Array.isArray(cat?.chapters)) cat.chapters.forEach(registerChapter);
      });
    }

    // 2. Series chapters
    if (Array.isArray(parsed.series)) {
      parsed.series.forEach((s: any) => {
        if (Array.isArray(s?.chapters)) s.chapters.forEach(registerChapter);
      });
    }

    // 3. Standalone books
    if (Array.isArray(parsed.standalones)) parsed.standalones.forEach(registerChapter);

    // 4. Continue reading
    if (Array.isArray(parsed.continueReading)) parsed.continueReading.forEach(registerChapter);

    // 5. Trending books
    if (Array.isArray(parsed.trending)) parsed.trending.forEach(registerChapter);
  } catch (_) {}
  return map;
};

const LikedContent = ({ route, navigation }: Props) => {
  const { user, loadingUser, reload } = useUser();
  const insets = useSafeAreaInsets();
  const { isConnected } = useNetworkStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [resolvedLikes, setResolvedLikes] = useState<any[]>([]);

  const navHeaderPadding = Math.max(insets.top + 55, 75);

  // 1. Refresh user on screen focus so liked changes always reflect immediately
  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
    }, [reload])
  );

  // 2. Real-time local update when like event fires anywhere across the app (no /get-self reload storm)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("like-updated", (event: any) => {
      const evId = String(event?.chapterId || "");
      if (!evId) return;
      if (event?.liked === false) {
        setResolvedLikes((prev) => prev.filter((it) => String(it?._id || it?.id) !== evId));
      } else if (event?.liked === true) {
        setResolvedLikes((prev) => {
          const exists = prev.some((it) => String(it?._id || it?.id) === evId);
          if (!exists) {
            void reload().catch(() => {});
            return prev;
          }
          if (typeof event?.count === "number") {
            return prev.map((it) =>
              String(it?._id || it?.id) === evId
                ? { ...it, likes: event.count, isLiked: true }
                : it
            );
          }
          return prev;
        });
      }
    });
    return () => sub.remove();
  }, [reload]);

  // 3. Fast, zero-DB-load resolution of liked content with real like counts
  useEffect(() => {
    let isMounted = true;

    const resolveLikes = async () => {
      await LikeManager.init();

      if (!user?.likes || !Array.isArray(user.likes)) {
        if (isMounted) setResolvedLikes([]);
        return;
      }

      // Fast in-memory map from cached feed (instant, zero DB calls)
      let feedMap = new Map<string, any>();
      try {
        const rawFeed = await AsyncStorage.getItem("cached_feed_data");
        feedMap = extractFeedChapterMap(rawFeed);
      } catch (_) {}

      const resolvedList: any[] = [];
      const missingIds: string[] = [];

      for (const rawItem of user.likes) {
        if (!rawItem) continue;
        const item = rawItem as any;
        const id = typeof item === "string" ? String(item).trim() : String(item?._id || item?.id || "").trim();
        if (!id) continue;

        // Try local feed cache first, then item object if populated
        let bookData = feedMap.get(id);
        if (!bookData && typeof item === "object" && (item.title || item.cover)) {
          bookData = item;
        }

        if (bookData) {
          // Compute real like count
          const lmEntry = LikeManager.get(id);
          const rawLikes = bookData.likes;
          const dataCount = Array.isArray(rawLikes)
            ? rawLikes.length
            : typeof rawLikes === "number"
            ? rawLikes
            : 0;

          // Confirmed count: highest known count, at least 1 since user liked it!
          const realCount = Math.max(1, lmEntry?.count || 0, dataCount);

          // Keep LikeManager cache synchronized
          LikeManager.set(id, true, realCount, false);

          resolvedList.push({
            ...bookData,
            _id: id,
            likes: realCount,
            isLiked: true,
          });
        } else {
          missingIds.push(id);
        }
      }

      // If any string IDs were not in feed cache, check local per-chapter storage via batched multiGet
      if (missingIds.length > 0) {
        const remainingToFetch: string[] = [];

        try {
          const pairs = await AsyncStorage.multiGet(
            missingIds.map((id) => `cached_ch_${id}`)
          );
          pairs.forEach(([, chRaw], idx) => {
            const id = missingIds[idx];
            if (chRaw) {
              try {
                const parsed = JSON.parse(chRaw);
                const lmEntry = LikeManager.get(id);
                const dataCount = Array.isArray(parsed.likes)
                  ? parsed.likes.length
                  : typeof parsed.likes === "number"
                  ? parsed.likes
                  : 0;
                const realCount = Math.max(1, lmEntry?.count || 0, dataCount);
                LikeManager.set(id, true, realCount, false);

                resolvedList.push({
                  ...parsed,
                  _id: id,
                  likes: realCount,
                  isLiked: true,
                });
                return;
              } catch (_) {}
            }
            remainingToFetch.push(id);
          });
        } catch {
          remainingToFetch.push(...missingIds);
        }

        // Batch fetch unknown chapters in a single request instead of N+1 individual GETs
        if (remainingToFetch.length > 0 && isConnected) {
          let batchResolved = false;
          try {
            const batchRes = await api.post(
              "/chapter/by-IDs",
              { ids: remainingToFetch, mode: "card" },
              { timeout: 10000 }
            );
            const batchChapters = batchRes?.data?.chapters || batchRes?.data?.data;
            if (Array.isArray(batchChapters)) {
              batchResolved = true;
              const cachePairs: [string, string][] = [];
              batchChapters.forEach((ch: any) => {
                const id = String(ch?._id || ch?.id || "");
                if (!id) return;
                const lmEntry = LikeManager.get(id);
                const dataCount = Array.isArray(ch.likes)
                  ? ch.likes.length
                  : typeof ch.likes === "number"
                  ? ch.likes
                  : 0;
                const realCount = Math.max(1, lmEntry?.count || 0, dataCount);
                LikeManager.set(id, true, realCount, false);
                cachePairs.push([`cached_ch_${id}`, JSON.stringify(ch)]);
                resolvedList.push({
                  ...ch,
                  _id: id,
                  likes: realCount,
                  isLiked: true,
                });
              });
              if (cachePairs.length > 0) {
                await AsyncStorage.multiSet(cachePairs).catch(() => {});
              }
            }
          } catch (_) {}

          if (!batchResolved) {
            const fetchPromises = remainingToFetch.map(async (id) => {
              try {
                const res = await api.get(`/chapter/${id}`, { timeout: 6000 });
                const ch = res?.data?.data || res?.data?.chapter || res?.data;
                if (ch && (ch.title || ch._id)) {
                  const lmEntry = LikeManager.get(id);
                  const dataCount = Array.isArray(ch.likes)
                    ? ch.likes.length
                    : typeof ch.likes === "number"
                    ? ch.likes
                    : 0;
                  const realCount = Math.max(1, lmEntry?.count || 0, dataCount);
                  LikeManager.set(id, true, realCount, false);

                  await AsyncStorage.setItem(`cached_ch_${id}`, JSON.stringify(ch)).catch(() => {});

                  return {
                    ...ch,
                    _id: id,
                    likes: realCount,
                    isLiked: true,
                  };
                }
              } catch (_) {}
              return null;
            });

            const fetchedResults = await Promise.all(fetchPromises);
            fetchedResults.forEach((ch) => {
              if (ch) resolvedList.push(ch);
            });
          }
        }
      }

      // Deduplicate by chapter _id
      const uniqueMap = new Map<string, any>();
      resolvedList.forEach((it) => {
        const itId = String(it._id || it.id);
        if (itId && !uniqueMap.has(itId)) {
          uniqueMap.set(itId, it);
        }
      });

      if (isMounted) {
        setResolvedLikes(Array.from(uniqueMap.values()));
      }
    };

    resolveLikes();
    return () => {
      isMounted = false;
    };
  }, [user?.likes, isConnected]);

  const sortedLikes = useMemo(() => {
    return [...resolvedLikes].sort((a: any, b: any) => {
      const timeB = new Date(b?.updatedAt || b?.likedAt || b?.createdAt || 0).getTime();
      const timeA = new Date(a?.updatedAt || a?.likedAt || a?.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return 0;
    });
  }, [resolvedLikes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } catch {}
    setRefreshing(false);
  }, [reload]);

  const renderContentCard = ({ item, index }: { item: any; index: number }) => {
    return (
      <ContentCard
        key={String(item?._id || item?.id || index)}
        book={item}
        index={index}
        isLiked={true}
        compact={true}
        cardWidth={CARD_WIDTH}
      />
    );
  };

  if (!user && !isConnected) {
    return (
      <View style={[styles.container, { paddingTop: navHeaderPadding, paddingBottom: insets.bottom }]}>
        <Offline />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: navHeaderPadding, paddingBottom: insets.bottom }]}>
      {sortedLikes && !loadingUser && (
        <FlatList
          key="liked-grid-3-col"
          data={sortedLikes}
          keyExtractor={(item: any, index) => String(item?._id || (item as any)?.id || index)}
          renderItem={renderContentCard}
          numColumns={NUM_COLUMNS}
          scrollEnabled={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={pallete.accent || "#01796F"}
              colors={[pallete.accent || "#01796F"]}
            />
          }
          columnWrapperStyle={{
            gap: GRID_GAP,
          }}
          ListHeaderComponent={<Text style={styles.title}>Liked Content</Text>}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingHorizontal: HORIZONTAL_PADDING,
              paddingBottom: insets.bottom + 24,
            },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyLikedBox}>
              <View style={styles.emptyIconCircle}>
                <Svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill={pallete.accent || "#01796F"}>
                  <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </Svg>
              </View>

              <Text style={styles.emptyTitleText}>No Liked Content</Text>
              <Text style={styles.emptySubText}>
                Books and audios you like will appear here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain || "#090314",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
    color: pallete.textwhite,
    marginTop: 12,
    marginBottom: 20,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  emptyLikedBox: {
    flex: 1,
    paddingVertical: 60,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(1, 121, 111, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(1, 121, 111, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 6,
    textAlign: "center",
  },
  emptySubText: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 18,
    maxWidth: 240,
    textAlign: "center",
  },
});

export default LikedContent;
