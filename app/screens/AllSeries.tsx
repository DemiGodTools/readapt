import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  DeviceEventEmitter,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CachedImage, { isRenderableUrl } from "../../components/props/CachedImage";
import SeriesCard from "../../components/props/SeriesCard";
import Svg, { Path, Line, Circle } from "react-native-svg";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import pallete from "../../lib/Colors";
import { api, ROOT_API_BASE } from "../../lib/api";
import useAuth from "../../hooks/useAuth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { ISeries } from "../../types/Series";

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HORIZONTAL_PADDING = 14;
const ITEM_GAP = 10;
const CARD_WIDTH = Math.floor((width - HORIZONTAL_PADDING * 2 - ITEM_GAP * 2) / 3);

// --- Icons ---
const BackIcon = memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M19 12H5M5 12L12 19M5 12L12 5"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
));

const FilterSortIcon = memo(({ hasActiveFilter }: { hasActiveFilter: boolean }) => (
  <View style={styles.iconWrapper}>
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="6" x2="20" y2="6" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="4" y1="12" x2="20" y2="12" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="4" y1="18" x2="20" y2="18" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <Circle cx="8" cy="6" r="2.5" fill="#090314" stroke="#00D2B4" strokeWidth={2} />
      <Circle cx="16" cy="12" r="2.5" fill="#090314" stroke="#00D2B4" strokeWidth={2} />
      <Circle cx="10" cy="18" r="2.5" fill="#090314" stroke="#00D2B4" strokeWidth={2} />
    </Svg>
    {hasActiveFilter && <View style={styles.filterActiveDot} />}
  </View>
));

const UsersIcon = memo(() => (
  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#00D2B4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <Path d="M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
));

const CheckIcon = memo(() => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#00D2B4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
));

// Fast number formatter
const formatCompactNumber = (number: number) => {
  if (number < 1000) return number.toString();
  if (number >= 1000 && number < 1000000) return (number / 1000).toFixed(1) + "K";
  return (number / 1000000).toFixed(1) + "M";
};

// Thumbnail helper
const getOptimizedThumb = (url?: string) => {
  if (!url) return "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=240&q=80";
  if (url.includes("unsplash.com")) {
    return `${url.split("?")[0]}?auto=format&fit=crop&w=240&h=320&q=80`;
  }
  return url;
};

// Joined member count extraction
const getSeriesJoinedCount = (s: any): number => {
  if (Array.isArray(s?.joinedBy)) return s.joinedBy.length;
  if (typeof s?.joinedBy === "number") return s.joinedBy;
  if (Array.isArray(s?.usersJoined)) return s.usersJoined.length;
  if (typeof s?.joinedCount === "number") return s.joinedCount;
  return 0;
};

// Total chapter/level count extraction
const getSeriesUnitCount = (s: any): number => {
  if (Array.isArray(s?.chapters)) {
    return s.chapters.filter((ch: any) => ch?.contentModel === "Chapter" || ch?.content).length;
  }
  return Number(s?.episodes) || 0;
};

type SortOption = "relevance" | "most_joined" | "recent" | "content";
type TypeFilter = "all" | "standard" | "framework";

export default function AllSeries() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { accessToken } = useAuth();

  const [seriesList, setSeriesList] = useState<ISeries[]>([]);
  const [loading, setLoading] = useState(true);

  // Sorting and Filtering States (Access Plan removed per requirements)
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // Bottom Sheet State
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetOpenRef = useRef(false);

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const startY = useSharedValue(0);

  const [refreshing, setRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  // Fetch series
  const fetchSeries = useCallback(async (isPull = false) => {
    if (isFetchingRef.current && !isPull) return;
    isFetchingRef.current = true;
    if (isPull) setRefreshing(true);

    try {
      if (!isPull) {
        const rawCache = await AsyncStorage.getItem("cached_feed_data");
        if (rawCache) {
          try {
            const parsed = JSON.parse(rawCache);
            if (Array.isArray(parsed?.series) && parsed.series.length > 0) {
              setSeriesList(parsed.series);
              setLoading(false);
            }
          } catch {}
        }
      }

      let seriesResult: any[] = [];
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      try {
        const res = await api.get("/feed", { headers, timeout: 25000 });
        const payload = res?.data?.data ?? res?.data;
        if (Array.isArray(payload?.series)) {
          seriesResult = payload.series;
        }
      } catch (feedErr) {
        // Fallback to standalone series endpoint
        try {
          const sRes = await api.get(`${ROOT_API_BASE}/series`, { timeout: 25000 });
          if (Array.isArray(sRes?.data?.data)) {
            seriesResult = sRes.data.data;
          }
        } catch {}
      }

      if (seriesResult.length > 0) {
        setSeriesList(seriesResult);
      }
    } catch (err: any) {
      if (err?.message !== "canceled") {
        console.warn("All series sync notice:", err?.message || "Network request failed");
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      fetchSeries();
    }, [fetchSeries])
  );

  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener("SERIES_JOINED", () => fetchSeries());
    const sub2 = DeviceEventEmitter.addListener("SERIES_EXITED", () => fetchSeries());
    const sub3 = DeviceEventEmitter.addListener("CHAPTER_QNA_COMPLETED", () => fetchSeries());
    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, [fetchSeries]);

  // Bottom Sheet Animation handlers - Silky smooth timing with zero bounce
  const openSheet = () => {
    sheetOpenRef.current = true;
    setSheetOpen(true);
    translateY.value = SCREEN_HEIGHT;
    translateY.value = withTiming(0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  };

  const closeSheet = () => {
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 200, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(() => {
            sheetOpenRef.current = false;
            setSheetOpen(false);
          })();
        }
      }
    );
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const newY = startY.value + event.translationY;
      translateY.value = Math.max(0, newY);
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 550) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  // Filtering & Sorting Process
  const filteredAndSortedSeries = useMemo(() => {
    let result = [...seriesList];

    // Filter by Type
    if (typeFilter === "framework") {
      result = result.filter((s) => s.type === "framework");
    } else if (typeFilter === "standard") {
      result = result.filter((s) => s.type !== "framework");
    }

    // Sort
    if (sortBy === "most_joined") {
      result.sort((a, b) => getSeriesJoinedCount(b) - getSeriesJoinedCount(a));
    } else if (sortBy === "recent") {
      result.sort((a, b) => {
        const timeA = new Date(a.updatedAt || 0).getTime();
        const timeB = new Date(b.updatedAt || 0).getTime();
        return timeB - timeA;
      });
    } else if (sortBy === "content") {
      result.sort((a, b) => getSeriesUnitCount(b) - getSeriesUnitCount(a));
    } else {
      // Relevance (Curated: frameworks first, then highest joined)
      result.sort((a, b) => {
        const aFw = a.type === "framework" ? 1 : 0;
        const bFw = b.type === "framework" ? 1 : 0;
        if (bFw !== aFw) return bFw - aFw;
        return getSeriesJoinedCount(b) - getSeriesJoinedCount(a);
      });
    }

    return result;
  }, [seriesList, typeFilter, sortBy]);

  const hasActiveFilter = sortBy !== "relevance" || typeFilter !== "all";

  const renderCard = useCallback(
    ({ item }: { item: ISeries }) => {
      const firstChapter = item.chapters?.find(
        (ch: any) => ch?.contentModel === "Chapter"
      );
      const seriesAuthor =
        item.author ||
        (firstChapter?.content as any)?.author ||
        "READAPT";
      const unitCount = getSeriesUnitCount(item);

      return (
        <View style={{ width: CARD_WIDTH }}>
          <SeriesCard
            id={item._id}
            title={item.title}
            author={seriesAuthor}
            cover={item.cover}
            type={item.type}
            chapterCount={unitCount}
            cardWidth={CARD_WIDTH}
          />
        </View>
      );
    },
    []
  );

  const resetFilters = () => {
    setSortBy("relevance");
    setTypeFilter("all");
  };

  return (
    <View style={styles.container}>
      {/* HEADER: Exactly like Trending Now with back arrow, center title/sub, right filter icon */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 16, 38) }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          android_ripple={{ color: "rgba(255,255,255,0.1)", borderless: true, radius: 20 }}
        >
          <BackIcon />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>All Series</Text>
          <Text style={styles.headerSubTitle}>Explore structured learning paths</Text>
        </View>

        <Pressable
          onPress={openSheet}
          style={styles.filterButton}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          android_ripple={{ color: "rgba(0, 210, 180, 0.2)", borderless: true, radius: 20 }}
        >
          <FilterSortIcon hasActiveFilter={hasActiveFilter} />
        </Pressable>
      </View>

      {/* Active Filter Pills Bar (if filter active) */}
      {hasActiveFilter && (
        <View style={styles.activeFilterBanner}>
          <Text style={styles.activeFilterBannerText} numberOfLines={1}>
            {sortBy === "most_joined"
              ? "Most Joined"
              : sortBy === "recent"
              ? "Recently Added"
              : sortBy === "content"
              ? "Most Content"
              : "Curated"}{" "}
            •{" "}
            {typeFilter === "framework"
              ? "Frameworks"
              : typeFilter === "standard"
              ? "Series"
              : "All Types"}
          </Text>
          <Pressable onPress={resetFilters} hitSlop={10}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        </View>
      )}

      {/* 3 COLUMNS GRID */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00D2B4" />
        </View>
      ) : filteredAndSortedSeries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Series Found</Text>
          <Text style={styles.emptyText}>
            No series match the selected filter criteria.
          </Text>
          <Pressable style={styles.resetBtn} onPress={resetFilters}>
            <Text style={styles.resetBtnText}>Reset Filters</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedSeries}
          keyExtractor={(item) => item._id}
          renderItem={renderCard}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={styles.columnWrapper}
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchSeries(true)}
              tintColor="#38bdf8"
              colors={["#38bdf8"]}
            />
          }
        />
      )}

      {/* DRAGGABLE DARK BOTTOM SHEET (SMOOTH TIMING, NO BOUNCE) */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="none"
        hardwareAccelerated
        statusBarTranslucent
        navigationBarTranslucent={Platform.OS === "android"}
        onRequestClose={closeSheet}
      >
        <GestureHandlerRootView style={styles.modalRoot}>
          {/* Backdrop */}
          <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          </Animated.View>

          {/* Draggable Panel */}
          <Animated.View style={[styles.sheetPanel, panelAnimatedStyle]}>
            <GestureDetector gesture={panGesture}>
              <View style={styles.sheetHandleArea}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Sort & Filter</Text>
                  {hasActiveFilter && (
                    <Pressable onPress={resetFilters}>
                      <Text style={styles.sheetResetText}>Reset</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </GestureDetector>

            <View style={styles.sheetContent}>
              {/* SECTION 1: SORT BY */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionLabel}>SORT BY</Text>
                <View style={styles.chipsRow}>
                  <Chip
                    label="Relevance"
                    active={sortBy === "relevance"}
                    onPress={() => setSortBy("relevance")}
                  />
                  <Chip
                    label="Most Joined"
                    active={sortBy === "most_joined"}
                    onPress={() => setSortBy("most_joined")}
                  />
                  <Chip
                    label="Recently Added"
                    active={sortBy === "recent"}
                    onPress={() => setSortBy("recent")}
                  />
                  <Chip
                    label="Most Content"
                    active={sortBy === "content"}
                    onPress={() => setSortBy("content")}
                  />
                </View>
              </View>

              {/* SECTION 2: CONTENT TYPE */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionLabel}>CONTENT TYPE</Text>
                <View style={styles.chipsRow}>
                  <Chip
                    label="All Types"
                    active={typeFilter === "all"}
                    onPress={() => setTypeFilter("all")}
                  />
                  <Chip
                    label="Series"
                    active={typeFilter === "standard"}
                    onPress={() => setTypeFilter("standard")}
                  />
                  <Chip
                    label="Frameworks"
                    active={typeFilter === "framework"}
                    onPress={() => setTypeFilter("framework")}
                  />
                </View>
              </View>

              {/* Apply Button */}
              <Pressable style={styles.applyButton} onPress={closeSheet}>
                <Text style={styles.applyButtonText}>
                  Show {filteredAndSortedSeries.length} Series
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

// Compact Filter Chip Component
interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

const Chip = memo(({ label, active, onPress }: ChipProps) => (
  <Pressable
    onPress={onPress}
    style={[styles.chip, active && styles.chipActive]}
    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
  >
    {active && (
      <View style={{ marginRight: 5 }}>
        <CheckIcon />
      </View>
    )}
    <Text style={[styles.chipText, active && styles.chipTextActive]}>
      {label}
    </Text>
  </Pressable>
));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05020B",
  },

  // Header matching Trending Now
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#05020B",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTextWrap: {
    flex: 1,
    alignItems: "center",
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  headerSubTitle: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  filterButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  iconWrapper: {
    position: "relative",
  },
  filterActiveDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#00D2B4",
  },

  // Active filter status
  activeFilterBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(0, 210, 180, 0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 210, 180, 0.15)",
  },
  activeFilterBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#00D2B4",
    fontWeight: "600",
  },
  clearText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    marginLeft: 8,
  },

  // List layout
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 14,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: "flex-start",
    gap: ITEM_GAP,
    marginBottom: 16,
  },

  // States
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 16,
  },
  resetBtn: {
    backgroundColor: "rgba(0, 210, 180, 0.15)",
    borderWidth: 1,
    borderColor: "#00D2B4",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  resetBtnText: {
    color: "#00D2B4",
    fontSize: 13,
    fontWeight: "600",
  },

  // Modal / Draggable Bottom Sheet
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  sheetPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0D071A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  sheetHandleArea: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  sheetHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  sheetResetText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#00D2B4",
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  sectionWrap: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#6b7280",
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  chipActive: {
    backgroundColor: "rgba(0, 210, 180, 0.14)",
    borderColor: "#00D2B4",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9ca3af",
  },
  chipTextActive: {
    color: "#00D2B4",
    fontWeight: "700",
  },
  applyButton: {
    marginTop: 24,
    backgroundColor: "#00D2B4",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#05020B",
    letterSpacing: 0.3,
  },
});

