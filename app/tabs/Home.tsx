import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
  Vibration,
} from "react-native";
import pallete from "../../lib/Colors";
import useAuth from "../../hooks/useAuth";
import Carousel from "react-native-reanimated-carousel";
import ContentCard from "../../components/props/ContentCard";
import SeriesCard from "../../components/props/SeriesCard";
import Svg, { Path, Rect, Line } from "react-native-svg";
import { api } from "../../lib/api";
import ChapterCardSkelly from "../../components/props/ChapterCardSkelly";
import SeriesCardSkelly from "../../components/props/SeriesCardSkelly";
import { ISeries } from "../../types/Series";
import { IChapter } from "../../types/Chapter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useUser } from "../../hooks/useUser";
import PopButton from "../../components/props/PopButton";
import Contentprogress from "../../components/props/ContentProgress";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { useNetworkStatus } from "../../hooks/useNetwork";
import Offline from "../../components/state/Offline";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get("window");
const CARD_GAP = 5;
const SIDE_PADDING = 22;
const CARD_WIDTH = (width - SIDE_PADDING * 2 - CARD_GAP) / 2;

const AvailableIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24">
    <Rect x="3" y="3" width="7" height="7" rx="1.5" fill="#FFCA00" />
    <Rect x="14" y="3" width="7" height="7" rx="1.5" fill="#FFCA00" />
    <Rect x="3" y="14" width="7" height="7" rx="1.5" fill="#FFCA00" />
    <Rect x="14" y="14" width="7" height="7" rx="1.5" fill="#FFCA00" />
  </Svg>
);

const SeriesIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Line x1="8" y1="6" x2="21" y2="6" stroke="#01796F" strokeWidth={2.5} strokeLinecap="round" />
    <Line x1="8" y1="12" x2="21" y2="12" stroke="#01796F" strokeWidth={2.5} strokeLinecap="round" />
    <Line x1="8" y1="18" x2="21" y2="18" stroke="#01796F" strokeWidth={2.5} strokeLinecap="round" />
    <Line x1="3" y1="6" x2="3.01" y2="6" stroke="#01796F" strokeWidth={2.5} strokeLinecap="round" />
    <Line x1="3" y1="12" x2="3.01" y2="12" stroke="#01796F" strokeWidth={2.5} strokeLinecap="round" />
    <Line x1="3" y1="18" x2="3.01" y2="18" stroke="#01796F" strokeWidth={2.5} strokeLinecap="round" />
  </Svg>
);

const ContinueIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 640 640">
    <Path
      fill="#4ade80"
      d="M175.3 160C161.3 160 148.8 169.2 144.7 182.6L102.4 320L256 320C273.7 320 288 334.3 288 352L352 352C352 334.3 366.3 320 384 320L537.6 320L495.3 182.6C491.2 169.2 478.8 160 464.7 160L432 160C414.3 160 400 145.7 400 128C400 110.3 414.3 96 432 96L464.7 96C506.8 96 544.1 123.5 556.5 163.8L601.9 311.3C606 324.5 608 338.2 608 352L608 448C608 501 565 544 512 544L448 544C395 544 352 501 352 448L352 416L288 416L288 448C288 501 245 544 192 544L128 544C75 544 32 501 32 448L32 352C32 338.2 34.1 324.5 38.1 311.3L83.5 163.8C95.9 123.5 133.1 96 175.3 96L208 96C225.7 96 240 110.3 240 128C240 145.7 225.7 160 208 160L175.3 160z"
    />
  </Svg>
);

const TrendingIcon = () => (
  <Svg viewBox="0 0 640 640" width={18} height={18} fill="#f97316">
    <Path d="M281.6 93.9L297.6 72.6C301.6 67.2 308 64 314.7 64C326.4 64 336 73.6 336 85.3L336 107.4C336 120.5 341.4 133.1 350.9 142.1L435.6 223C484.4 269.6 512 334.2 512 401.7C512 498 434 576 337.7 576L320 576C214 576 128 490 128 384L128 380.2C128 331.4 147.4 284.6 181.9 250.1L185.4 246.6C189.6 242.4 195.4 240 201.4 240C213.9 240 224 250.1 224 262.6L224 352C224 387.3 252.7 416 288 416C323.3 416 352 387.3 352 352L352 348.1C352 330.1 344.8 312.8 332.1 300.1L293.5 261.5C269.5 237.5 256 204.8 256 170.8C256 143.1 265 116 281.6 93.9z" />
  </Svg>
);

const YourFeedIcon = () => (
  <Svg viewBox="0 0 640 640" width={18} height={18} fill="#60a5fa">
    <Path d="M128 128C128 92.7 156.7 64 192 64L448 64C483.3 64 512 92.7 512 128L512 545.1C512 570.7 483.5 585.9 462.2 571.7L320 476.8L177.8 571.7C156.5 585.9 128 570.6 128 545.1L128 128zM192 112C183.2 112 176 119.2 176 128L176 515.2L293.4 437C309.5 426.3 330.5 426.3 346.6 437L464 515.2L464 128C464 119.2 456.8 112 448 112L192 112z" />
  </Svg>
);

function ContentSlider({ data }: { data: any[] }) {
  return (
    <Carousel
      loop={false}
      width={CARD_WIDTH + CARD_GAP}
      height={300}
      style={{ width }}
      data={data}
      pagingEnabled
      snapEnabled
      mode="parallax"
      onConfigurePanGesture={(gestureChain) =>
        gestureChain.activeOffsetX([-15, 15]).failOffsetY([-10, 10])
      }
      modeConfig={{
        parallaxScrollingScale: 0.92,
        parallaxScrollingOffset: 0,
      }}
      renderItem={({ item, index }) => (
        <View
          style={{
            width: CARD_WIDTH + CARD_GAP,
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}>
          <View style={{ width: CARD_WIDTH, height: "100%" }}>
            <ContentCard
              book={item}
              index={index}
              seriesType="standalone"
              isLiked={Boolean(item.isLiked)}
            />
          </View>
        </View>
      )}
    />
  );
}

function SkellyCrousel() {
  return (
    <Carousel
      loop={false}
      width={CARD_WIDTH + CARD_GAP}
      height={260}
      style={{ width }}
      data={[1, 2, 3, 4]}
      pagingEnabled
      snapEnabled
      onConfigurePanGesture={(gestureChain) =>
        gestureChain.activeOffsetX([-15, 15]).failOffsetY([-10, -10])
      }
      mode="parallax"
      modeConfig={{
        parallaxScrollingScale: 0.96,
        parallaxScrollingOffset: 0,
      }}
      renderItem={() => (
        <View style={{ width: CARD_WIDTH, marginLeft: SIDE_PADDING }}>
          <ChapterCardSkelly />
        </View>
      )}
    />
  );
}

const HomeScreen = () => {
  const { accessToken } = useAuth();
  const [feedData, setFeedData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seriesData, setSeriesData] = useState<ISeries | null>(null);
  const { user, reload } = useUser();
  const [completeChapters, setCompleteChapters] = useState(0);
  const [continueReading, setContinueReading] = useState<any[] | null>(null);
  const hasVibratedAtEnd = useRef(false);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isConnected } = useNetworkStatus();

  // 1. Liked IDs Set
  const likedIdsSet = useMemo(() => {
    const ids = new Set<string>();
    const userLikes =
      (user as any)?.likedChapters ||
      (user as any)?.liked ||
      (user as any)?.likes ||
      [];
    userLikes.forEach((item: any) => {
      const id = typeof item === "string" ? item : item?._id;
      if (id) ids.add(String(id));
    });
    return ids;
  }, [user]);

  // Global series chapters filter
  const seriesChapterIdsSet = useMemo(() => {
    const ids = new Set<string>();
    const allSeriesList: any[] = [...(feedData?.series || [])];
    if (seriesData) allSeriesList.push(seriesData);

    allSeriesList.forEach((s) => {
      if (Array.isArray(s.chapters)) {
        s.chapters.forEach((ch: any) => {
          const chId = ch?.content?._id || ch?.content || ch?._id;
          if (chId) ids.add(String(chId));
        });
      }
    });
    return ids;
  }, [feedData?.series, seriesData]);

  const isStrictlyStandalone = useCallback(
    (item: any): boolean => {
      if (!item || !item._id) return false;
      if (seriesChapterIdsSet.has(String(item._id))) return false;
      if (Array.isArray(item.chapters) && item.chapters.length > 0) return false;
      if (item.contentModel && item.contentModel !== "Chapter") return false;
      if (typeof item.series === "string" && item.series.trim() !== "") return false;
      if (item.series && typeof item.series === "object") {
        if (item.series._id) return false;
        if (Object.keys(item.series).length > 0) return false;
      }
      if (item.seriesId && String(item.seriesId).trim() !== "") return false;
      if (item.parentSeries && String(item.parentSeries).trim() !== "") return false;
      if (item.isSeriesContent || item.isSeriesChapter || item.isSeries) return false;
      return true;
    },
    [seriesChapterIdsSet]
  );

  const loadRecentReads = useCallback(async () => {
    try {
      const readChapters = await AsyncStorage.getItem("recentReads");
      if (!readChapters) {
        setContinueReading(null);
        return;
      }

      const recentReads: any[] = JSON.parse(readChapters);
      const sorted = recentReads.sort((a, b) => {
        const timeA = a.readAt ? new Date(a.readAt).getTime() : 0;
        const timeB = b.readAt ? new Date(b.readAt).getTime() : 0;
        return timeB - timeA;
      });

      const validReads = sorted
        .filter((item) => item?.content?._id)
        .slice(0, 3)
        .map((item) => ({
          ...item,
          readtill:
            item.readtill ??
            item.progress ??
            item.currentTime ??
            item.position ??
            "0",
          total:
            item.content?.duration ||
            item.content?.totalDuration ||
            item.content?.total ||
            item.total ||
            item.duration ||
            "0",
        }));

      LayoutAnimation.configureNext({
        duration: 220,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.spring, springDamping: 0.85 },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });

      setContinueReading(validReads.length > 0 ? validReads : null);

      if (seriesData?.chapters) {
        const chapterIdsInSeries = seriesData.chapters.map(
          (item: any) => item.content?._id || item.content
        );
        const readChaptersInSeries = recentReads.filter((readChapter) =>
          chapterIdsInSeries.includes(readChapter.content._id)
        );
        setCompleteChapters(readChaptersInSeries.length);
      }
    } catch {
      setContinueReading(null);
    }
  }, [seriesData?.chapters]);

  useFocusEffect(
    useCallback(() => {
      loadRecentReads();
      reload().catch(() => {});
    }, [loadRecentReads, reload])
  );

  // Native Instant Load: Cache Read
  useEffect(() => {
    AsyncStorage.getItem("cached_feed_data")
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          setFeedData(parsed);
          setLoading(false);
        }
      })
      .catch(() => {});
  }, []);

  // Network Fetch with Cache update
  useEffect(() => {
    const fetchFeed = async () => {
      if (!accessToken) return;
      try {
        const res = await api.get("/feed", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const payload = res?.data?.data ?? res?.data;
        if (payload) {
          setFeedData(payload);
          AsyncStorage.setItem("cached_feed_data", JSON.stringify(payload)).catch(() => {});
        }
      } catch (err: any) {
        console.error("Feed API Error Detail:", err?.message);
      } finally {
        setLoading(false);
      }
    };
    fetchFeed();
  }, [accessToken, isConnected]);

  useEffect(() => {
    const getSeries = async () => {
      if (user && user?.joinedSeries && accessToken) {
        try {
          const data = await api.get(`/series/${user.joinedSeries}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          setSeriesData(data?.data?.data || null);
        } catch (error) {
          console.error("Error fetching joined series:", error);
        }
      }
    };
    getSeries();
  }, [user, accessToken, isConnected]);

  // Section 1: Available
  const availableStandalone = useMemo(() => {
    return (feedData?.available || [])
      .filter(isStrictlyStandalone)
      .map((item: any) => ({
        ...item,
        isLiked: likedIdsSet.has(item._id),
      }));
  }, [feedData?.available, isStrictlyStandalone, likedIdsSet]);

  // Section 2: Trending Now (Strictly Max 5 Cards)
  const trendingStandaloneFive = useMemo(() => {
    return (feedData?.trending || [])
      .filter(isStrictlyStandalone)
      .slice(0, 5)
      .map((item: any) => ({
        ...item,
        isLiked: likedIdsSet.has(item._id),
      }));
  }, [feedData?.trending, isStrictlyStandalone, likedIdsSet]);

  // Section 3: Series Section (Max 5 Series with Min 2 Framework Priority)
  const prioritizedSeriesFive = useMemo(() => {
    const rawSeries: ISeries[] = feedData?.series || [];
    if (!rawSeries.length) return [];

    const frameworks = rawSeries.filter((s) => s.type === "framework");
    const regulars = rawSeries.filter((s) => s.type !== "framework");

    const selected: ISeries[] = [];

    // Min 2 Framework guarantee (agar available hain)
    frameworks.slice(0, 2).forEach((f) => selected.push(f));

    // Remaining slots filled with regulars/frameworks up to max 5
    const remainingPool = [...frameworks.slice(2), ...regulars];
    for (const item of remainingPool) {
      if (selected.length >= 5) break;
      if (!selected.some((s) => s._id === item._id)) {
        selected.push(item);
      }
    }

    return selected.slice(0, 5);
  }, [feedData?.series]);

  // Section 4: Your Feed (Intelligent Sorting based on Category & Sub-Category, Max 4)
  const feedPersonalizedFour = useMemo(() => {
    const pool = (feedData?.personalized || feedData?.available || []).filter(isStrictlyStandalone);
    const userCategories = new Set(
      ((user as any)?.preferredCategories || (user as any)?.interests || []).map((c: any) =>
        String(typeof c === "string" ? c : c?._id || c?.name).toLowerCase()
      )
    );

    const ranked = [...pool].sort((a, b) => {
      const aCat = String(a?.category?.name || a?.category || "").toLowerCase();
      const aSub = String(a?.subCategory?.name || a?.subCategory || "").toLowerCase();
      const bCat = String(b?.category?.name || b?.category || "").toLowerCase();
      const bSub = String(b?.subCategory?.name || b?.subCategory || "").toLowerCase();

      const aScore = (userCategories.has(aCat) ? 2 : 0) + (userCategories.has(aSub) ? 1 : 0);
      const bScore = (userCategories.has(bCat) ? 2 : 0) + (userCategories.has(bSub) ? 1 : 0);
      return bScore - aScore;
    });

    return ranked.slice(0, 4).map((item: any) => ({
      ...item,
      isLiked: likedIdsSet.has(item._id),
    }));
  }, [feedData?.personalized, feedData?.available, isStrictlyStandalone, user, likedIdsSet]);

  // Section 5: Feed Series Slider (Max 4 Series)
  const feedSeriesFour = useMemo(() => {
    return (feedData?.series || []).slice(0, 4);
  }, [feedData?.series]);

  // End of scroll haptic feedback
  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 30;

    if (isCloseToBottom && !hasVibratedAtEnd.current) {
      hasVibratedAtEnd.current = true;
      Vibration.vibrate(40);
    } else if (!isCloseToBottom && hasVibratedAtEnd.current) {
      hasVibratedAtEnd.current = false;
    }
  };

  const renderSeries = ({ item }: { item: ISeries }) => {
    const firstChapter = item.chapters?.find((ch) => ch.contentModel === "Chapter");
    const seriesAuthor = item.author || (firstChapter?.content as IChapter)?.author || "READAPT";

    return (
      <SeriesCard
        id={item._id}
        title={item.title}
        author={seriesAuthor}
        cover={item.cover}
        type={item.type}
        chapterCount={
          item.chapters?.filter((ch) => ch.contentModel === "Chapter").length || 0
        }
      />
    );
  };

  if (!seriesData && !feedData && !isConnected) {
    return (
      <View style={styles.container}>
        <Offline />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            {"Good to see you again.".toUpperCase()}
          </Text>
          <Text style={styles.heroSubtitle}>
            Discover stories that matter. Continue where you left off.
          </Text>
        </View>

        {/* Joined Series Overview Progress */}
        {user?.joinedSeries && seriesData && (
          <View style={styles.section}>
            <PopButton
              onPress={() => {
                navigation.navigate("SeriesOverview", {
                  seriesId: user?.joinedSeries || "",
                });
              }}>
              <View style={styles.progressCard}>
                <View style={styles.progressContent}>
                  <Text style={styles.progressTitle} numberOfLines={1} ellipsizeMode="tail">
                    {seriesData.title}
                  </Text>

                  <Text style={styles.progressMeta}>
                    {seriesData?.type === "framework" ? "Level" : "Chapter"}{" "}
                    {completeChapters} •{" "}
                    <Text
                      style={[
                        styles.accentText,
                        seriesData?.type === "framework" && { color: "#38bdf8" },
                      ]}>
                      {(
                        (completeChapters /
                          Math.max(
                            1,
                            seriesData?.chapters?.filter(
                              (item) => item.contentModel === "Chapter"
                            ).length || 1
                          )) *
                        100
                      ).toFixed(0)}
                      % Complete
                    </Text>
                  </Text>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(
                            100,
                            (completeChapters /
                              Math.max(
                                1,
                                seriesData?.chapters?.filter(
                                  (item) => item.contentModel === "Chapter"
                                ).length || 1
                              )) *
                              100
                          )}%`,
                          backgroundColor:
                            seriesData?.type === "framework"
                              ? "#38bdf8"
                              : pallete.accent,
                        },
                      ]}
                    />
                  </View>
                </View>

                <Svg width={20} height={20} viewBox="0 0 16 16" fill="none">
                  <Path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M10.853 7.647a.5.5 0 0 1 0 .706l-5 5a.5.5 0 0 1-.706-.706L9.793 8 5.147 3.353a.5.5 0 0 1 .706-.706l5 5Z"
                    fill={pallete.textwhite}
                  />
                </Svg>
              </View>
            </PopButton>
          </View>
        )}

        {/* Continue Learning */}
        {continueReading && continueReading.length > 0 && (
          <SectionHeader title="Continue Learning" icon={<ContinueIcon />} />
        )}

        {continueReading && continueReading.length > 0 && (
          <View style={styles.continueSectionContainer}>
            {continueReading.map((item) => (
              <Contentprogress
                key={item.content._id}
                id={item.content._id}
                cover={item.content.cover}
                title={item.content.title}
                readtill={item.readtill}
                total={item.total}
                type={item.content.type}
                author={item.content.author}
                learWidth={(width / 100) * 85}
              />
            ))}
          </View>
        )}

        {/* Available For You */}
        <SectionHeader title="Available for you" icon={<AvailableIcon />} />
        {loading ? (
          <SkellyCrousel />
        ) : (
          <ContentSlider data={availableStandalone} />
        )}

        {/* Series Section (Max 5, min 2 Framework) */}
        <SectionHeader title="Series" icon={<SeriesIcon />} />
        {loading ? (
          <Carousel
            loop={false}
            width={280 + 16}
            height={260}
            style={{ ...styles.horizontalList, width }}
            data={[1, 2, 3, 4]}
            pagingEnabled
            snapEnabled
            mode="parallax"
            modeConfig={{ parallaxScrollingScale: 0.96, parallaxScrollingOffset: 0 }}
            renderItem={() => (
              <View style={{ width: 280, marginLeft: SIDE_PADDING }}>
                <SeriesCardSkelly />
              </View>
            )}
          />
        ) : (
          <Carousel
            loop={false}
            width={280 + 16}
            height={260}
            style={{ ...styles.horizontalList, width }}
            data={prioritizedSeriesFive}
            pagingEnabled
            snapEnabled
            mode="parallax"
            modeConfig={{ parallaxScrollingScale: 0.96, parallaxScrollingOffset: 0 }}
            renderItem={({ item }: { item: any }) => (
              <View style={{ width: "100%", marginHorizontal: 0 }}>
                {renderSeries({ item: item as ISeries })}
              </View>
            )}
          />
        )}

        {/* Trending Now (Max 5 Cards) */}
        <SectionHeader title="Trending Now" icon={<TrendingIcon />} />
        {loading ? (
          <SkellyCrousel />
        ) : (
          <ContentSlider data={trendingStandaloneFive} />
        )}

        {/* Your Feed: Exactly Max 4 Content Cards (Dynamic Category/Subcategory Intelligence) */}
        <SectionHeader title="Your Feed" icon={<YourFeedIcon />} />
        <View style={styles.gridSectionWrap}>
          {loading ? (
            <View style={styles.gridContainer}>
              {[1, 2, 3, 4].map((k) => (
                <View key={k} style={styles.gridCardWrapper}>
                  <ChapterCardSkelly />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.gridContainer}>
              {feedPersonalizedFour.map((item: any, idx: number) => (
                <View key={item._id || idx} style={styles.gridCardWrapper}>
                  <ContentCard
                    book={item}
                    index={idx}
                    seriesType="standalone"
                    isLiked={Boolean(item.isLiked)}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Feed Series Slider: Exactly Max 4 Series inside Feed */}
        {feedSeriesFour && feedSeriesFour.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Carousel
              loop={false}
              width={280 + 16}
              height={260}
              style={{ ...styles.horizontalList, width }}
              data={feedSeriesFour}
              pagingEnabled
              snapEnabled
              mode="parallax"
              modeConfig={{ parallaxScrollingScale: 0.96, parallaxScrollingOffset: 0 }}
              renderItem={({ item }: { item: any }) => (
                <View style={{ width: "100%", marginHorizontal: 0 }}>
                  {renderSeries({ item: item as ISeries })}
                </View>
              )}
            />
          </View>
        )}

        {/* End of Feed Screen Indicator */}
        <View style={styles.endOfFeedContainer}>
          <Text style={styles.endOfFeedText}>You're all caught up!</Text>
        </View>
      </ScrollView>
    </View>
  );
};

function SectionHeader({
  title,
  icon,
}: {
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.left}>
        {icon}
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain,
    paddingTop: 100,
  },
  hero: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  heroTitle: {
    fontFamily: "Bebas Neue",
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "700",
    color: "#fff",
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 24,
    color: "#9ca3af",
    width: "85%",
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginTop: 22,
    marginBottom: 14,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#F5F5F5",
  },
  horizontalList: {
    paddingLeft: 24,
    paddingRight: 16,
    paddingBottom: 10,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  section: {
    width: "100%",
  },
  progressCard: {
    marginHorizontal: pallete.paddingside,
    marginVertical: 10,
    backgroundColor: pallete.bgcard,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  progressContent: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: pallete.textwhite,
    marginBottom: 4,
  },
  progressMeta: {
    fontSize: 12,
    color: pallete.textgray,
    marginBottom: 12,
  },
  accentText: {
    color: pallete.accent,
    fontWeight: "700",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: pallete.accent,
    borderRadius: 10,
  },
  continueSectionContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 16,
  },
  gridSectionWrap: {
    paddingHorizontal: SIDE_PADDING,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridCardWrapper: {
    width: CARD_WIDTH,
    marginBottom: 16,
  },
  endOfFeedContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
  },
  endOfFeedText: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});

export default HomeScreen;