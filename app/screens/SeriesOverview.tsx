import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  FlatList,
  ActivityIndicator,
} from "react-native";
import axios from "axios";
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Svg, { Path, Circle, Polyline, Line, G } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { ISeries, ISeriesContent } from "../../types/Series";
import { IChapter } from "../../types/Chapter";
import PopButton from "../../components/props/PopButton";
import useAuth from "../../hooks/useAuth";
import { api } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

const { width } = Dimensions.get("window");

import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import pallete from "../../lib/Colors";
import ContentCard from "../../components/props/ContentCard";
import { useModal } from "../../hooks/useModal";
import { IUser } from "../../types/User";
import { IRecentRead } from "../../types/Storage";
import { useUser } from "../../hooks/useUser";
import Offline from "../../components/state/Offline";
import { useNetworkStatus } from "../../hooks/useNetwork";

const SHEET_HEIGHT = 320;

const activeSeriesRequests = new Map<string, Promise<any>>();

interface DetailsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  data?: {
    chapters?: ISeriesContent[];
    published?: string;
    description?: string;
  };
}

const DetailsPanel = ({ isOpen, onClose, data }: DetailsPanelProps) => {
  const translateY = useSharedValue(SHEET_HEIGHT);

  useEffect(() => {
    if (isOpen) {
      translateY.value = withSpring(0, { damping: 100 });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT);
    }
  }, [isOpen]);

  const handleClose = () => {
    translateY.value = withTiming(SHEET_HEIGHT, {}, () => {
      runOnJS(onClose)();
    });
  };

  const dragGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 500) {
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, { damping: 105 });
      }
    });

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  type ChapterItem = Extract<ISeriesContent, { contentModel: "Chapter" }>;

  const { totalChapters, totalPdfChapters, totalAudioChapters } = useMemo(() => {
    const chapters: ChapterItem[] =
      (data?.chapters?.filter(
        (item): item is ChapterItem => item.contentModel === "Chapter"
      ) as ChapterItem[]) ?? [];

    const pdfs = chapters.filter((item) => item.content?.type === "pdf");
    const audios = chapters.filter((item) => item.content?.type === "audio");

    return {
      totalChapters: chapters,
      totalPdfChapters: pdfs,
      totalAudioChapters: audios,
    };
  }, [data?.chapters]);

  if (!isOpen) return null;

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <TouchableOpacity
        style={panelStyles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      <GestureDetector gesture={dragGesture}>
        <Animated.View style={[panelStyles.detailsPanel, animatedStyles]}>
          <View style={panelStyles.dragHandle} />

          <View style={panelStyles.panelSRow}>
            <TouchableOpacity activeOpacity={0.8} style={panelStyles.pItem}>
              <Text style={panelStyles.pVal}>{totalChapters.length}</Text>
              <Text style={panelStyles.pLabel}>Chapters</Text>
            </TouchableOpacity>

            <View style={panelStyles.pDivider} />

            <TouchableOpacity activeOpacity={0.8} style={panelStyles.pItem}>
              <Text style={panelStyles.pVal}>{totalPdfChapters.length}</Text>
              <Text style={panelStyles.pLabel}>PDFs</Text>
            </TouchableOpacity>

            <View style={panelStyles.pDivider} />

            <TouchableOpacity activeOpacity={0.8} style={panelStyles.pItem}>
              <Text style={panelStyles.pVal}>{totalAudioChapters.length}</Text>
              <Text style={panelStyles.pLabel}>Audios</Text>
            </TouchableOpacity>

            <View style={panelStyles.pDivider} />

            <TouchableOpacity activeOpacity={0.8} style={panelStyles.pItem}>
              <Text style={panelStyles.pVal}>{data?.published}</Text>
              <Text style={panelStyles.pLabel}>Published</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity activeOpacity={0.9}>
            <Text style={panelStyles.panelDescription}>
              {data?.description ??
                "This comprehensive series covers everything from fundamentals to advanced analysis."}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const panelStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  detailsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: pallete.panelbg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: pallete.paddingside,
    paddingTop: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 20,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 10,
    alignSelf: "center",
    position: "absolute",
    top: 10,
  },
  panelSRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    marginTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 16,
  },
  pItem: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  pVal: {
    fontSize: 14,
    fontWeight: "700",
    color: pallete.textwhite,
  },
  pLabel: {
    fontSize: 10,
    color: pallete.textgray,
    textTransform: "uppercase",
  },
  pDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  panelDescription: {
    fontSize: 13,
    lineHeight: 20.8,
    color: "#d1d5db",
  },
});

interface SeriesOverviewProps {
  route: {
    params: {
      seriesId?: string;
    };
  };
}

const SeriesOverview = ({ route }: SeriesOverviewProps) => {
  const navigation = useNavigation();
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const { showModal } = useModal();
  const { user, reload } = useUser();
  const { isConnected } = useNetworkStatus();

  const currentSeriesId = route.params?.seriesId;

  const [seriesData, setSeriesData] = useState<ISeries | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [completeChapters, setCompleteChapters] = useState(0);
  const [isJoined, setIsJoined] = useState(false);
  const [joinedSeriesTitle, setJoinedSeriesTitle] = useState<string | null>(null);
  const [recommendedChapter, setRecommendedChapter] = useState<IChapter | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
    }, [reload])
  );

  const loadSeries = useCallback(async () => {
    if (!currentSeriesId) return;

    const cacheKey = `cache_series_${currentSeriesId}`;

    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && isMountedRef.current) {
        const parsed: ISeries = JSON.parse(cached);
        setSeriesData(parsed);
      }
    } catch {}

    if (!accessToken || !isConnected) return;

    if (activeSeriesRequests.has(currentSeriesId)) {
      try {
        const data = await activeSeriesRequests.get(currentSeriesId);
        if (data && isMountedRef.current) {
          setSeriesData(data);
        }
      } catch {}
      return;
    }

    const fetchPromise = api
      .get(`/series/${currentSeriesId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then((res) => {
        const fresh = res?.data?.data;
        if (fresh) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => {});
          if (isMountedRef.current) {
            setSeriesData(fresh);
          }
        }
        return fresh;
      })
      .catch((err) => {
        if (!axios.isCancel(err)) {
          console.warn("Background series sync failed:", err?.message);
        }
        return null;
      })
      .finally(() => {
        activeSeriesRequests.delete(currentSeriesId);
      });

    activeSeriesRequests.set(currentSeriesId, fetchPromise);
  }, [currentSeriesId, accessToken, isConnected]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  useEffect(() => {
    setIsJoined(user?.joinedSeries === seriesData?._id);
  }, [user?.joinedSeries, seriesData?._id]);

  useEffect(() => {
    let cancel = false;
    const fetchCurrentJoinedSeries = async () => {
      if (
        user?.joinedSeries &&
        user.joinedSeries !== seriesData?._id &&
        accessToken &&
        isConnected
      ) {
        try {
          const cacheTitleKey = `series_title_${user.joinedSeries}`;
          const cachedTitle = await AsyncStorage.getItem(cacheTitleKey);
          if (cachedTitle && !cancel) {
            setJoinedSeriesTitle(cachedTitle);
            return;
          }

          const { data } = await api.get(`/series/${user.joinedSeries}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (data?.data?.title && !cancel) {
            setJoinedSeriesTitle(data.data.title);
            AsyncStorage.setItem(cacheTitleKey, data.data.title).catch(() => {});
          }
        } catch {}
      } else {
        if (!cancel) setJoinedSeriesTitle(null);
      }
    };

    fetchCurrentJoinedSeries();
    return () => {
      cancel = true;
    };
  }, [user?.joinedSeries, seriesData?._id, accessToken, isConnected]);

  const chapterItems = useMemo(() => {
    return (
      seriesData?.chapters?.filter((item) => item.contentModel === "Chapter") || []
    );
  }, [seriesData?.chapters]);

  const totalChapters = chapterItems.length;

  const chapterIdsSet = useMemo(() => {
    const ids = new Set<string>();
    chapterItems.forEach((item) => {
      if (item.content?._id) ids.add(item.content._id);
    });
    return ids;
  }, [chapterItems]);

  useEffect(() => {
    if (chapterIdsSet.size === 0) return;
    let cancel = false;

    const calcProgress = async () => {
      try {
        const readChapters = await AsyncStorage.getItem("recentReads");
        if (!readChapters || cancel) return;
        const recentReads: IRecentRead[] = JSON.parse(readChapters);
        let completed = 0;
        recentReads.forEach((r) => {
          if (r.content?._id && chapterIdsSet.has(r.content._id)) {
            completed++;
          }
        });
        if (!cancel) setCompleteChapters(completed);
      } catch {}
    };

    calcProgress();
    return () => {
      cancel = true;
    };
  }, [chapterIdsSet]);

  const joinedCount = seriesData?.joinedBy?.length || 0;
  const coverUrl = seriesData?.cover;

  const renderFormattedTitle = () => {
    const raw = seriesData?.title || "";
    const cleanTitle = raw
      .replace(/^learn\s+/i, "")
      .replace(/\s+\d+-\d+$/i, "")
      .trim();

    if (seriesData?.type === "framework") {
      return (
        <Text style={styles.seriesTitle}>
          <Text style={{ color: pallete.textwhite }}>LEARN </Text>
          <Text style={{ color: "#38bdf8" }}>{cleanTitle.toUpperCase()} </Text>
          <Text style={{ color: pallete.textwhite }}>1-{totalChapters}</Text>
        </Text>
      );
    }

    return <Text style={styles.seriesTitle}>{cleanTitle}</Text>;
  };

  const joinSeries = async () => {
    if (!isConnected) {
      showToast({ title: "You are offline! Please connect to the Internet" });
      return;
    }
    try {
      setIsJoined(true);
      const data = await api.post(
        "/series/join",
        { seriesId: seriesData?._id },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!data.data.success) {
        setIsJoined(false);
        showToast({ title: "Something went wrong" });
        return;
      }
      reload();
    } catch {
      setIsJoined(false);
      showToast({ title: "Something went wrong" });
    }
  };

  const exitSeries = async () => {
    if (!isConnected) {
      showToast({ title: "You are offline! Please connect to the Internet" });
      return;
    }
    try {
      setIsJoined(false);
      const data = await api.post(
        "/series/exit",
        { seriesId: seriesData?._id },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!data.data.success) {
        setIsJoined(true);
        showToast({ title: data.data.message || "Something went wrong" });
        return;
      }
      reload();
    } catch {
      setIsJoined(true);
      showToast({ title: "Something went wrong" });
    }
  };

  const renderContentCard = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const rawContent = item?.content;
      const isPopulated = typeof rawContent === "object" && rawContent !== null;
      const realChapterId =
        (isPopulated && rawContent._id) ||
        (typeof rawContent === "string" && rawContent) ||
        item?._id;

      const chapterData: any = isPopulated
        ? {
            ...rawContent,
            _id: String(realChapterId),
            series: rawContent.series || seriesData?._id || seriesData,
          }
        : {
            ...item,
            _id: String(realChapterId),
            series: seriesData?._id || seriesData,
          };

      return (
        <ContentCard
          key={chapterData?._id || index}
          book={chapterData}
          index={index}
          seriesType={seriesData?.type === "framework" ? "framework" : "normal"}
        />
      );
    },
    [seriesData]
  );

  const renderRecommendationCard = useCallback(() => {
    if (seriesData?.type !== "framework") return null;

    const firstChapter = seriesData?.chapters?.find(
      (item) => item.contentModel === "Chapter"
    );
    const fallbackCover =
      (firstChapter?.content as IChapter)?.cover || coverUrl;

    const recText =
      (seriesData as any)?.recommendationText ||
      "Explore another perspective on Power.";
    const recCover = recommendedChapter?.cover || fallbackCover;
    const recTitle =
      recommendedChapter?.title || "Recommended Reading";

    return (
      <View style={styles.recommendationSection}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={styles.recommendCard}
          onPress={() => {
            const rawRec = (seriesData as any)?.recommendationBookId;
            const recId =
              recommendedChapter?._id ||
              (typeof rawRec === "object" ? rawRec?._id : rawRec);

            const recData =
              recommendedChapter || (typeof rawRec === "object" ? rawRec : null);

            if (recId) {
              (navigation as any).navigate("ReadBook", {
                bookId: String(recId),
                initialBookData: recData,
              });
            } else {
              showToast({ title: "Content coming soon" });
            }
          }}>
          <View style={styles.recommendBgAmbient}>
            <Image
              source={{ uri: recCover }}
              style={styles.ambientImage}
              blurRadius={6}
            />
            <LinearGradient
              colors={[
                "rgba(5, 10, 24, 0.94)",
                "rgba(7, 18, 38, 0.82)",
                "rgba(10, 25, 47, 0.65)",
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.recommendBgOverlay}
            />
          </View>

          <View style={styles.recommendCoverWrap}>
            <Image
              source={{ uri: recCover }}
              style={styles.recommendCover}
              resizeMode="cover"
            />
          </View>

          <View style={styles.recommendInfo}>
            <Text style={styles.recommendTag}>RECOMMENDATION READING</Text>
            <Text style={styles.recommendTitle} numberOfLines={1}>
              {recTitle}
            </Text>
            <Text style={styles.recommendDesc} numberOfLines={2}>
              {recText}
            </Text>
          </View>

          <View style={styles.recommendArrow}>
            <Svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <Polyline points="9 18 15 12 9 6" />
            </Svg>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [
    seriesData?.type,
    seriesData?.chapters,
    seriesData?.recommendationText,
    seriesData?.recommendationBookId,
    coverUrl,
    recommendedChapter,
    navigation,
    showToast,
  ]);

  if (!seriesData && !isConnected) {
    return (
      <View
        style={[
          styles.body,
          { paddingTop: 100, alignItems: "center", justifyContent: "center" },
        ]}>
        <Offline />
      </View>
    );
  }

  if (!seriesData) {
    return (
      <View
        style={[
          styles.body,
          { paddingTop: 100, alignItems: "center", justifyContent: "center" },
        ]}>
        <ActivityIndicator color={pallete.accent} />
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <ScrollView style={styles.body} bounces={true}>
        <View style={styles.seriesHero}>
          <Image
            source={{ uri: coverUrl }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(5, 5, 5, 0.4)", pallete.bgmain]}
            locations={[0, 0.6, 1]}
            style={styles.heroOverlay}
          />
        </View>

        <View style={styles.seriesInfo}>
          {renderFormattedTitle()}

          <Text style={styles.seriesAuthor}>
            by {seriesData?.author || (seriesData?.chapters?.[0]?.content as IChapter)?.author || "READAPT"}
          </Text>

          <PopButton
            styles={styles.joinedBadge}
            activeStyles={styles.joinedBadgeActive}>
            <Svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={seriesData?.type === "framework" ? "#38bdf8" : pallete.accent}
              strokeWidth="2">
              <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <Circle cx="9" cy="7" r="4" />
              <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </Svg>
            <Text style={styles.badgeText}>
              {joinedCount}{" "}
              <Text style={{ color: pallete.textgray }}>Joined</Text>
            </Text>
          </PopButton>
        </View>

        <PopButton styles={styles.progressBox}>
          <Text style={styles.progressText}>
            {completeChapters} of {totalChapters}{" "}
            <Text
              style={{
                color:
                  seriesData?.type === "framework"
                    ? "#38bdf8"
                    : pallete.textwhite,
                fontWeight: "700",
              }}>
              {seriesData?.type === "framework" ? "levels" : "chapters"}
            </Text>{" "}
            complete
          </Text>

          <View style={styles.progressBarContainer}>
            <View style={styles.pBarTrack}>
              <View
                style={[
                  styles.pBarFill,
                  {
                    width: `${
                      totalChapters > 0
                        ? (completeChapters / totalChapters) * 100
                        : 0
                    }%`,
                    backgroundColor:
                      seriesData?.type === "framework"
                        ? "#38bdf8"
                        : pallete.accent,
                  },
                ]}
              />
            </View>

            <View style={styles.actionIcons}>
              <PopButton
                styles={styles.actBtn}
                onPress={() => {
                  setIsDetailOpen(true);
                }}>
                <Svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={pallete.textgray}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <Circle cx="12" cy="12" r="10" />
                  <Line x1="12" y1="16" x2="12" y2="12" />
                  <Line x1="12" y1="8" x2="12.01" y2="8" />
                </Svg>
              </PopButton>

              {user?.joinedSeries === seriesData?._id ? (
                <PopButton
                  styles={[styles.actBtn, styles.exitBtn]}
                  onPress={() =>
                    showModal({
                      title: "Are you sure to exit from this series?",
                      onConfirm: exitSeries,
                    })
                  }>
                  <Svg fill="none" width="18" height="18" viewBox="0 0 16 16">
                    <G id="SVGRepo_bgCarrier" strokeWidth="0" />
                    <G
                      id="SVGRepo_tracerCarrier"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <G id="SVGRepo_iconCarrier">
                      <G fill={pallete.false}>
                        <Path d="M1 8a6 6 0 018.514-5.45.75.75 0 01-.629 1.363 4.5 4.5 0 100 8.175.75.75 0 11.63 1.361A6 6 0 011 8z" />
                        <Path d="M11.245 4.695a.75.75 0 00-.05 1.06l1.36 1.495H6.75a.75.75 0 000 1.5h5.805l-1.36 1.495a.75.75 0 001.11 1.01l2.5-2.75a.748.748 0 00-.002-1.012l-2.498-2.748a.75.75 0 00-1.06-.05z" />
                      </G>
                    </G>
                  </Svg>
                </PopButton>
              ) : (
                <PopButton
                  styles={[styles.actBtn, styles.joinBtn]}
                  onPress={() => {
                    const confirmMsg = joinedSeriesTitle
                      ? `Joining this series will automatically remove you from "${joinedSeriesTitle}". Do you want to proceed?`
                      : "Are you sure you want to join this series?";

                    showModal({
                      title: confirmMsg,
                      onConfirm: joinSeries,
                    });
                  }}>
                  <Svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={pallete.true}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <Polyline points="10 17 15 12 10 7" />
                    <Line x1="15" y1="12" x2="3" y2="12" />
                  </Svg>
                </PopButton>
              )}
            </View>
          </View>
        </PopButton>

        <View style={styles.gridSection}>
          <View style={styles.booksGrid}>
            <FlatList
              data={chapterItems}
              renderItem={renderContentCard}
              keyExtractor={(item, idx) => item?.content?._id || idx.toString()}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={{
                justifyContent: "space-between",
                paddingHorizontal: 15,
              }}
              contentContainerStyle={{
                paddingHorizontal: 0,
              }}
              ListFooterComponent={renderRecommendationCard}
            />
          </View>
        </View>
      </ScrollView>

      <DetailsPanel
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
        }}
        data={{
          chapters: seriesData?.chapters,
          published: (seriesData as any)?.createdAt
            ? new Date((seriesData as any).createdAt).toLocaleDateString()
            : "",
          description: seriesData?.description,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: pallete.bgmain,
  },
  seriesHero: {
    marginTop: 70,
    width: "100%",
    height: 220,
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  seriesInfo: {
    paddingHorizontal: pallete.paddingside,
    marginTop: -20,
    position: "relative",
    zIndex: 10,
  },
  seriesTitle: {
    fontFamily: "Bebas Neue",
    fontSize: 36,
    lineHeight: 36,
    color: pallete.textwhite,
    marginBottom: 4,
  },
  seriesAuthor: {
    color: pallete.textgray,
    fontSize: 14,
    marginBottom: 12,
  },
  joinedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignSelf: "flex-start",
    marginBottom: 24,
  },
  joinedBadgeActive: {
    backgroundColor: "#ffffff1f",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#e5e7eb",
  },
  progressBox: {
    backgroundColor: pallete.bgcard,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: pallete.paddingside,
    marginBottom: 30,
  },
  progressText: {
    fontSize: 14,
    color: pallete.textwhite,
    marginBottom: 12,
    fontWeight: "500",
  },
  progressBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  pBarTrack: {
    flex: 1,
    height: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    overflow: "hidden",
  },
  pBarFill: {
    height: "100%",
    backgroundColor: pallete.accent,
    borderRadius: 10,
  },
  actionIcons: {
    flexDirection: "row",
    gap: 10,
  },
  actBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  joinBtn: {
    backgroundColor: "rgba(113, 251, 182, 0.2)",
    borderColor: pallete.true,
  },
  exitBtn: {
    backgroundColor: "rgba(251, 113, 133, 0.2)",
    borderColor: pallete.false,
  },
  gridSection: {
    paddingHorizontal: 4,
    marginBottom: 40,
  },
  booksGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    gap: 16,
  },
  recommendationSection: {
    width: "100%",
    paddingHorizontal: 15,
    marginTop: 10,
    marginBottom: 40,
  },
  recommendCard: {
    position: "relative",
    width: "100%",
    backgroundColor: "#0b1120",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8,
  },
  recommendBgAmbient: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  ambientImage: {
    width: "100%",
    height: "100%",
    opacity: 0.42,
    transform: [{ scale: 1.1 }],
  },
  recommendBgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  recommendCoverWrap: {
    width: 60,
    height: 80,
    borderRadius: 6,
    overflow: "hidden",
  },
  recommendCover: {
    width: "100%",
    height: "100%",
  },
  recommendInfo: {
    flex: 1,
  },
  recommendTag: {
    color: pallete.accent,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 4,
  },
  recommendTitle: {
    color: pallete.textwhite,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  recommendDesc: {
    color: pallete.textgray,
    fontSize: 12,
  },
  recommendArrow: {
    justifyContent: "center",
  },
});

export default SeriesOverview;