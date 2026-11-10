import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRoute, RouteProp } from "@react-navigation/native";
import Svg, { Path, Rect, Line } from "react-native-svg";

import { api, ROOT_API_BASE } from "../../lib/api";
import { ISubCategory } from "../../types/Category";
import { ISeries } from "../../types/Series";
import { IChapter } from "../../types/Chapter";
import ContentCard from "../../components/props/ContentCard";
import SeriesCard from "../../components/props/SeriesCard";
import ChapterCardSkelly from "../../components/props/ChapterCardSkelly";
import pallete from "../../lib/Colors";
import { useNetworkStatus } from "../../hooks/useNetwork";
import CachedImage, { prefetchImages } from "../../components/props/CachedImage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PADDING_SIDE = 18;
const GRID_GAP = 12;
const COLUMN_WIDTH = (SCREEN_WIDTH - PADDING_SIDE * 2 - GRID_GAP) / 2;

type RouteParams = {
  SubCategoryOverview: {
    subCategoryId: string;
    categoryId?: string;
    categoryName?: string;
    subCategory?: ISubCategory;
  };
};

const SubCategoryOverview: React.FC<any> = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RouteParams, "SubCategoryOverview">>();
  const { isConnected } = useNetworkStatus();

  const {
    subCategoryId,
    categoryId: rawCategoryId,
    categoryName,
    subCategory: initialSubCat,
  } = route.params || {};

  const [subCategory, setSubCategory] = useState<ISubCategory | null>(
    initialSubCat || null
  );
  const [books, setBooks] = useState<IChapter[]>([]);
  const [series, setSeries] = useState<ISeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const effectiveCategoryId =
    rawCategoryId ||
    (initialSubCat as any)?.parentCategory ||
    (subCategory as any)?.parentCategory;

  const contentCacheKey = `@subcat_content_${subCategoryId || effectiveCategoryId || "general"}`;

  const fetchContent = useCallback(
    async (isPullToRefresh = false) => {
      if (isPullToRefresh) {
        setRefreshing(true);
      }

      // 1. FAST PATH: Instant paint from disk cache on cold mount
      if (!isPullToRefresh) {
        try {
          const cachedRaw = await AsyncStorage.getItem(contentCacheKey);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (Array.isArray(parsed?.books) || Array.isArray(parsed?.series)) {
              setBooks(parsed.books || []);
              setSeries(parsed.series || []);
              setLoading(false);
            }
          }
        } catch {}
      }

      try {
        let fetchedBooks: any[] = [];
        let fetchedSeries: any[] = [];

        // Helper to accurately classify series vs standalone content
        const isSeriesItem = (item: any): boolean =>
          item?.entityType === "series_container" ||
          item?.type === "series" ||
          item?.type === "framework" ||
          item?.totalChapters !== undefined ||
          (Array.isArray(item?.chapters) && item.chapters.length > 0) ||
          Boolean(item?.isFramework);

        if (effectiveCategoryId) {
          const url = subCategoryId
            ? `${ROOT_API_BASE}/category/${effectiveCategoryId}/content?subCategoryId=${subCategoryId}`
            : `${ROOT_API_BASE}/category/${effectiveCategoryId}/content`;

          try {
            const res = await api.get(url, { timeout: 8000 });
            const data = res?.data?.data;
            if (Array.isArray(data)) {
              data.forEach((item: any) => {
                if (isSeriesItem(item)) {
                  fetchedSeries.push(item);
                } else {
                  fetchedBooks.push(item);
                }
              });
            } else if (data && typeof data === "object") {
              if (Array.isArray(data.books || data.chapters)) {
                fetchedBooks = [...fetchedBooks, ...(data.books || data.chapters)];
              }
              if (Array.isArray(data.series)) {
                fetchedSeries = [...fetchedSeries, ...data.series];
              }
            }
          } catch (err) {
            console.warn("Subcategory content fetch warning:", err);
          }
        }

        // 2. Scan cached feed for series or books matching this subcategory/category
        try {
          let feedSeriesPool: any[] = [];
          let feedBooksPool: any[] = [];
          const cachedFeed = await AsyncStorage.getItem("cached_feed_data");
          if (cachedFeed) {
            try {
              const parsed = JSON.parse(cachedFeed);
              if (Array.isArray(parsed?.series)) feedSeriesPool = parsed.series;
              if (Array.isArray(parsed?.trending)) feedBooksPool.push(...parsed.trending);
              if (Array.isArray(parsed?.personalized)) feedBooksPool.push(...parsed.personalized);
              if (Array.isArray(parsed?.all)) feedBooksPool.push(...parsed.all);
            } catch {}
          }

          const subNameLower = subCategory?.name?.trim().toLowerCase() || "";
          const matchedSeries = feedSeriesPool.filter((s: any) => {
            const sSub = String(s?.subCategory?._id || s?.subCategory || s?.subCategoryId || "").toLowerCase();
            const sSubName = String(s?.subCategory?.name || "").toLowerCase();
            const sCat = String(s?.category?._id || s?.category || "").toLowerCase();

            const matchesSub =
              (subCategoryId && sSub === subCategoryId.toLowerCase()) ||
              (subNameLower && sSubName === subNameLower);
            const matchesCat =
              effectiveCategoryId && sCat === String(effectiveCategoryId).toLowerCase();

            return matchesSub || (!sSub && matchesCat);
          });

          const seriesMap = new Map<string, any>();
          fetchedSeries.forEach((s) => seriesMap.set(String(s._id || s.id), s));
          matchedSeries.forEach((s) => {
            const sid = String(s._id || s.id);
            if (!seriesMap.has(sid)) {
              seriesMap.set(sid, s);
            }
          });
          fetchedSeries = Array.from(seriesMap.values());

          // If standalone books are empty from API, supplement from matched feed items
          if (fetchedBooks.length === 0 && feedBooksPool.length > 0) {
            const matchedBooks = feedBooksPool.filter((b: any) => {
              if (isSeriesItem(b)) return false;
              const bSub = String(b?.subCategory?._id || b?.subCategory || b?.subCategoryId || "").toLowerCase();
              const bSubName = String(b?.subCategory?.name || "").toLowerCase();
              return (
                (subCategoryId && bSub === subCategoryId.toLowerCase()) ||
                (subNameLower && bSubName === subNameLower)
              );
            });
            const bookMap = new Map<string, any>();
            matchedBooks.forEach((b) => bookMap.set(String(b._id || b.id), b));
            fetchedBooks = Array.from(bookMap.values());
          }
        } catch (seriesErr) {
          console.warn("Series matching warning:", seriesErr);
        }

        // Only overwrite if we actually got items, or if it was a pull-to-refresh
        if (fetchedBooks.length > 0 || fetchedSeries.length > 0 || isPullToRefresh) {
          setBooks(fetchedBooks);
          setSeries(fetchedSeries);

          // Save fresh content to disk cache
          AsyncStorage.setItem(
            contentCacheKey,
            JSON.stringify({ books: fetchedBooks, series: fetchedSeries })
          ).catch(() => {});
        }

        // Warm artwork in parallel
        prefetchImages([
          subCategory?.image,
          ...fetchedSeries.map((s: any) => s?.cover),
          ...fetchedBooks.slice(0, 12).map((b: any) => b?.cover || b?.image),
        ]);
      } catch (err) {
        console.error("SubCategoryOverview load error:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [effectiveCategoryId, subCategoryId, subCategory?.name, contentCacheKey]
  );

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const totalCount = useMemo(() => {
    if (subCategory?.counts?.total !== undefined && subCategory.counts.total > 0) {
      return subCategory.counts.total;
    }
    return books.length + series.length;
  }, [subCategory?.counts?.total, books.length, series.length]);

  const pdfCount = useMemo(() => {
    if (subCategory?.counts?.pdf !== undefined && subCategory.counts.pdf > 0) {
      return subCategory.counts.pdf;
    }
    return books.filter((b) => b?.type === "pdf").length;
  }, [subCategory?.counts?.pdf, books]);

  const audioCount = useMemo(() => {
    if (subCategory?.counts?.audio !== undefined && subCategory.counts.audio > 0) {
      return subCategory.counts.audio;
    }
    return books.filter((b) => b?.type === "audio").length;
  }, [subCategory?.counts?.audio, books]);

  const seriesCount = useMemo(() => {
    return series.length;
  }, [series]);

  const coverUrl =
    subCategory?.image && subCategory.image.trim() !== "" ? subCategory.image : null;

  const subName = subCategory?.name || "Sub-Category";
  const subDesc =
    subCategory?.description && subCategory.description.trim() !== ""
      ? subCategory.description
      : `Explore curated books, audiobooks, and series collections in ${subName}.`;

  const ICON_COLOR = "#94a3b8"; 

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        removeClippedSubviews={true}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 70 + insets.top, paddingBottom: 100 + insets.bottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchContent(true)}
            tintColor="#38bdf8"
            colors={["#38bdf8"]}
          />
        }>
        
        <View style={styles.heroContainer}>
          <CachedImage
            uri={coverUrl}
            label={subCategory?.name || "Sub-Category"}
            style={styles.heroImage}
            letterSize={90}
            priority="high"
          />
          <LinearGradient
            colors={[
              "rgba(5, 6, 20, 0.05)",
              "rgba(5, 6, 20, 0.5)",
              pallete.bgmain,
            ]}
            locations={[0, 0.65, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          {categoryName ? (
            <View style={styles.parentCatBadge}>
              <Text style={styles.parentCatText}>{categoryName}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.subCategoryTitle}>{subName}</Text>
          <Text style={styles.subCategoryDesc}>{subDesc}</Text>
        </View>

        {/* Clean, Uniform Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <View style={styles.statIconWrap}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Rect x="3" y="3" width="7" height="7" rx="1.5" fill={ICON_COLOR} />
                <Rect x="14" y="3" width="7" height="7" rx="1.5" fill={ICON_COLOR} />
                <Rect x="3" y="14" width="7" height="7" rx="1.5" fill={ICON_COLOR} />
                <Rect x="14" y="14" width="7" height="7" rx="1.5" fill={ICON_COLOR} />
              </Svg>
            </View>
            <Text style={styles.statNumber}>{totalCount}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <View style={styles.statIconWrap}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={ICON_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <Path d="M14 2v6h6" />
                <Line x1="16" y1="13" x2="8" y2="13" />
                <Line x1="16" y1="17" x2="8" y2="17" />
                <Line x1="10" y1="9" x2="8" y2="9" />
              </Svg>
            </View>
            <Text style={styles.statNumber}>{pdfCount}</Text>
            <Text style={styles.statLabel}>PDFs</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <View style={styles.statIconWrap}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={ICON_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </Svg>
            </View>
            <Text style={styles.statNumber}>{audioCount}</Text>
            <Text style={styles.statLabel}>Audio</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <View style={styles.statIconWrap}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={ICON_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <Line x1="8" y1="6" x2="21" y2="6" />
                <Line x1="8" y1="12" x2="21" y2="12" />
                <Line x1="8" y1="18" x2="21" y2="18" />
                <Line x1="3" y1="6" x2="3.01" y2="6" />
                <Line x1="3" y1="12" x2="3.01" y2="12" />
                <Line x1="3" y1="18" x2="3.01" y2="18" />
              </Svg>
            </View>
            <Text style={styles.statNumber}>{seriesCount}</Text>
            <Text style={styles.statLabel}>Series</Text>
          </View>
        </View>

        {/* Books & Chapters */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </Svg>
            <Text style={styles.sectionTitle}>Books & Chapters</Text>
          </View>
          <Text style={styles.sectionCountText}>
            {books.length} {books.length === 1 ? "book" : "books"}
          </Text>
        </View>

        {loading && books.length === 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sliderContent}>
            {[1, 2, 3].map((key) => (
              <View key={key} style={styles.skeletonChapterWrap}>
                <ChapterCardSkelly />
              </View>
            ))}
          </ScrollView>
        ) : books.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            removeClippedSubviews={true}
            contentContainerStyle={styles.sliderContent}>
            {books.map((book, index) => (
              <ContentCard key={book._id || index} book={book} index={index} />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptySectionCard}>
            <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <Line x1="10" y1="8" x2="16" y2="8" />
              <Line x1="10" y1="12" x2="14" y2="12" />
            </Svg>
            <Text style={styles.emptySectionTitle}>No books available</Text>
            <Text style={styles.emptySectionSubtitle}>
              New books are regularly added to this topic
            </Text>
          </View>
        )}

        {/* Series Section */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <View style={styles.sectionTitleRow}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Line x1="8" y1="6" x2="21" y2="6" />
              <Line x1="8" y1="12" x2="21" y2="12" />
              <Line x1="8" y1="18" x2="21" y2="18" />
              <Line x1="3" y1="6" x2="3.01" y2="6" />
              <Line x1="3" y1="12" x2="3.01" y2="12" />
              <Line x1="3" y1="18" x2="3.01" y2="18" />
            </Svg>
            <Text style={styles.sectionTitle}>Series Collections</Text>
          </View>
          <Text style={styles.sectionCountText}>
            {series.length} {series.length === 1 ? "series" : "series"}
          </Text>
        </View>

        {loading && series.length === 0 ? (
          <View style={styles.seriesGrid}>
            {[1, 2].map((k) => (
              <View key={k} style={[styles.seriesGridItemSkeleton, { width: COLUMN_WIDTH }]} />
            ))}
          </View>
        ) : series.length > 0 ? (
          <View style={styles.seriesGrid}>
            {series.map((item) => {
              const firstChapter = item.chapters?.find(
                (ch) => ch?.contentModel === "Chapter"
              );
              const seriesAuthor =
                item.author ||
                (firstChapter?.content as IChapter)?.author ||
                "READAPT";
              const count =
                item.chapters?.filter((ch) => ch?.contentModel === "Chapter")
                  .length || 0;

              return (
                <View key={item._id} style={{ width: COLUMN_WIDTH }}>
                  <SeriesCard
                    id={item._id}
                    title={item.title}
                    author={seriesAuthor}
                    cover={item.cover}
                    type={item.type}
                    chapterCount={count}
                    cardWidth={COLUMN_WIDTH}
                  />
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptySectionCard}>
            <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <Rect x="3" y="3" width="18" height="18" rx="3" />
              <Line x1="9" y1="3" x2="9" y2="21" />
            </Svg>
            <Text style={styles.emptySectionTitle}>No series available</Text>
            <Text style={styles.emptySectionSubtitle}>
              Serialized collections for this sub-category will appear here
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },
  heroContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    position: "relative",
    backgroundColor: "#110c22",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  parentCatBadge: {
    position: "absolute",
    top: 14,
    left: PADDING_SIDE,
    backgroundColor: "rgba(56, 189, 248, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.4)",
  },
  parentCatText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerInfo: {
    paddingHorizontal: PADDING_SIDE,
    marginTop: -16,
    zIndex: 10,
  },
  subCategoryTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  subCategoryDesc: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 6,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: PADDING_SIDE,
    marginTop: 20,
    marginBottom: 24,
    paddingVertical: 12,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
  },
  statLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PADDING_SIDE,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  sectionCountText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  sliderContent: {
    paddingHorizontal: PADDING_SIDE,
    gap: 12,
  },
  skeletonChapterWrap: {
    width: 170,
  },
  seriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: PADDING_SIDE,
    rowGap: 18,
  },
  seriesGridItemSkeleton: {
    height: 160,
    borderRadius: 16,
    backgroundColor: "#161228",
  },
  emptySectionCard: {
    marginHorizontal: PADDING_SIDE,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 12, 32, 0.5)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    borderStyle: "dashed",
    gap: 6,
  },
  emptySectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#94a3b8",
    marginTop: 4,
  },
  emptySectionSubtitle: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },
});

export default SubCategoryOverview;