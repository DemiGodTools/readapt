import React, { useEffect, useState, useCallback, memo, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  Dimensions, 
  ActivityIndicator, 
  FlatList,
  Animated,
  ScrollView,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CachedImage, { isRenderableUrl } from '../../components/props/CachedImage';
import Svg, { Path } from 'react-native-svg';
import pallete from '../../lib/Colors'; 
import { api } from '../../lib/api';
import useAuth from '../../hooks/useAuth';
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get('window');
const TAB_CONTAINER_WIDTH = width - 40; 
const TAB_WIDTH = TAB_CONTAINER_WIDTH / 2;

// Exact geometry constants for 0-lag FlatList virtualization
const CARD_HEIGHT = 96; 
const ITEM_SEPARATOR_HEIGHT = 12;
const LIST_PADDING_TOP = 6;
const LIST_PADDING_BOTTOM = 40;

// --- Clean Memoized SVG Icons ---
const BackIcon = memo(() => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const HeartIcon = memo(() => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#00D2B4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </Svg>
));

const ChatIcon = memo(() => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </Svg>
));

const UsersIcon = memo(() => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#00D2B4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <Path d="M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
));

// Helper for real joined member counts
const getSeriesJoinedCount = (s: any): number => {
  if (Array.isArray(s?.joinedBy)) return s.joinedBy.length;
  if (typeof s?.joinedBy === 'number') return s.joinedBy;
  if (Array.isArray(s?.usersJoined)) return s.usersJoined.length;
  if (typeof s?.joinedCount === 'number') return s.joinedCount;
  return 0;
};

// Fast number formatter
const formatCompactNumber = (number: number) => {
  if (number < 1000) return number.toString();
  if (number >= 1000 && number < 1000000) return (number / 1000).toFixed(1) + 'K';
  return (number / 1000000).toFixed(1) + 'M';
};

// Thumbnail helper: prevents 4K Unsplash decode on UI thread
const getOptimizedThumb = (url?: string, w = 180, h = 240) => {
  if (!url) return "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=200&q=80";
  if (url.includes("unsplash.com")) {
    return `${url.split('?')[0]}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;
  }
  return url;
};

// Subtle same-color rank variants
const getRankColor = (rank: number) => {
  switch (rank) {
    case 1: return 'rgba(0, 210, 180, 0.28)';
    case 2: return 'rgba(0, 210, 180, 0.18)';
    case 3: return 'rgba(0, 210, 180, 0.10)';
    default: return '#120E1E';
  }
};
const getRankTextColor = (rank: number) => rank <= 3 ? '#00D2B4' : '#6b7280';

// Fixed list separator (zero margin collapse bugs)
const ListSeparator = memo(() => <View style={styles.separator} />);

// --- Memoized Book Card (Native Ripple + 0ms Touch Slop) ---
interface BookCardProps {
  item: any;
  rank: number;
  onPress: (id: string) => void;
}

const BookCard = memo(({ item, rank, onPress }: BookCardProps) => {
  const likesCount = Array.isArray(item.likes) ? item.likes.length : (item.likes || 0);
  const commentsCount = Array.isArray(item.comments) ? item.comments.length : (item.comments || 0);

  const handlePress = useCallback(() => {
    onPress(item._id);
  }, [item._id, onPress]);

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.cardContainer,
        pressed && Platform.OS === 'ios' && styles.cardPressed
      ]}
      android_ripple={{ color: 'rgba(0, 210, 180, 0.12)', foreground: true }}
      onPress={handlePress}
    >
      <View style={[styles.rankBlock, { backgroundColor: getRankColor(rank) }]}>
        <Text style={[styles.rankBlockText, { color: getRankTextColor(rank) }]}>{rank}</Text>
      </View>
      
      <View style={styles.cardContent}>
        <View style={styles.bookCoverWrapper}>
          <CachedImage
            uri={isRenderableUrl(item.cover) ? getOptimizedThumb(item.cover, 120, 160) : null}
            label={item.title}
            style={styles.coverImage}
            letterSize={34}
          />
        </View>
        
        <View style={styles.infoContainer}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.author} numberOfLines={1}>{item.author || "READAPT"}</Text>
          <Text style={styles.tagText} numberOfLines={1}>
            {item.categories?.join("  •  ") || "Book"}
          </Text>
        </View>
        
        <View style={styles.rightSectionStacked}>
          <View style={styles.statBadge}>
            <HeartIcon />
            <Text style={styles.statText}>{formatCompactNumber(likesCount)}</Text>
          </View>
          <View style={styles.statBadgeMuted}>
            <ChatIcon />
            <Text style={styles.statTextMuted}>{formatCompactNumber(commentsCount)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

// --- Memoized Series Card (Native Ripple + 0ms Touch Slop) ---
interface SeriesCardProps {
  item: any;
  rank: number;
  onPress: (id: string) => void;
}

const SeriesCard = memo(({ item, rank, onPress }: SeriesCardProps) => {
  const isFramework = String(item.type || "").toLowerCase() === "framework";
  const count = Array.isArray(item.chapters) ? item.chapters.length : (Number(item.episodes) || 0);
  const unitLabel = isFramework ? (count === 1 ? "Level" : "Levels") : (count === 1 ? "Chapter" : "Chapters");
  const joinedCount = getSeriesJoinedCount(item);

  const handlePress = useCallback(() => {
    onPress(item._id);
  }, [item._id, onPress]);

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.cardContainer,
        pressed && Platform.OS === 'ios' && styles.cardPressed
      ]}
      android_ripple={{ color: 'rgba(0, 210, 180, 0.12)', foreground: true }}
      onPress={handlePress}
    >
      <View style={[styles.rankBlock, { backgroundColor: getRankColor(rank) }]}>
        <Text style={[styles.rankBlockText, { color: getRankTextColor(rank) }]}>{rank}</Text>
      </View>
      
      <View style={styles.cardContent}>
        <View style={styles.seriesCoverWrapper}>
          <CachedImage
            uri={isRenderableUrl(item.cover) ? getOptimizedThumb(item.cover, 160, 120) : null}
            label={item.title}
            style={styles.coverImage}
            letterSize={34}
          />
          {isFramework && (
            <View style={styles.frameworkBadge}>
              <Text style={styles.frameworkBadgeText}>FRAMEWORK</Text>
            </View>
          )}
        </View>
        
        <View style={styles.infoContainer}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.author} numberOfLines={1}>{item.author || "READAPT"}</Text>
          <Text style={styles.tagText}>
            {count} {unitLabel}
          </Text>
        </View>
        
        <View style={styles.rightSectionCentered}>
          <View style={styles.joinedPill}>
            <UsersIcon />
            <Text style={styles.joinedText}>{formatCompactNumber(joinedCount)} Joined</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

export default function TrendingBooks() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { accessToken } = useAuth();
  
  // Single atomic data state to prevent double-tick re-renders
  const [data, setData] = useState<{ books: any[]; series: any[] }>({
    books: [],
    series: []
  });
  const [loading, setLoading] = useState(true);

  // ⚡ 100% NATIVE DRIVER ANIMATION STATE
  // scrollX is allocated once and runs directly inside Android NativeAnimatedNodesManager / iOS CADisplayLink
  const scrollX = useRef(new Animated.Value(0)).current;
  const pagerRef = useRef<ScrollView>(null);

  // ⚡ Animated.event with useNativeDriver: true
  // ZERO JavaScript bridge messages are sent during scrolling.
  // The native scroll view updates the transform node directly on the GPU compositor!
  const onPagerScroll = useRef(
    Animated.event(
      [{ nativeEvent: { contentOffset: { x: scrollX } } }],
      { useNativeDriver: true }
    )
  ).current;

  // ⚡ Tab Tap: Triggers native platform smooth scrolling.
  // The native momentum naturally feeds onPagerScroll with ZERO worklet race condition.
  const switchTab = useCallback((index: 0 | 1) => {
    pagerRef.current?.scrollTo({ x: index * width, y: 0, animated: true });
  }, []);

  // ⚡ Pure Native Driver Indicator Translation
  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, width],
    outputRange: [0, TAB_WIDTH],
    extrapolate: 'clamp',
  });

  // ⚡ Native Driver Text Cross-Fade Opacities
  // (Core Animated's useNativeDriver does not support string color interpolation.
  // Cross-fading active/inactive text opacity is 100% native-driven and 120FPS smooth!)
  const chaptersActiveOpacity = scrollX.interpolate({
    inputRange: [0, width],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const chaptersInactiveOpacity = scrollX.interpolate({
    inputRange: [0, width],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const seriesActiveOpacity = scrollX.interpolate({
    inputRange: [0, width],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const seriesInactiveOpacity = scrollX.interpolate({
    inputRange: [0, width],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Strict standalone book filter helper
  const isStrictlyStandalone = useCallback((item: any, seriesChapterIdsSet: Set<string>): boolean => {
    if (!item || !item._id) return false;
    const idStr = String(item._id);
    if (seriesChapterIdsSet.has(idStr)) return false;
    if (Array.isArray(item.chapters) && item.chapters.length > 0) return false;
    if (item.contentModel && item.contentModel !== "Chapter") return false;
    if (item.series) {
      if (typeof item.series === "string" && item.series.trim() !== "" && item.series !== "null" && item.series !== "undefined") return false;
      if (typeof item.series === "object") {
        if (item.series._id) return false;
        if (Object.keys(item.series).length > 0) return false;
      }
    }
    if (item.seriesId && String(item.seriesId).trim() !== "") return false;
    if (item.parentSeries && String(item.parentSeries).trim() !== "") return false;
    if (item.isSeriesContent || item.isSeriesChapter || item.isSeries) return false;
    if (item.type === "series") return false;
    return true;
  }, []);

  const processPayload = useCallback((payload: any) => {
    if (!payload) return;
    
    const rawSeries = payload.series || [];
    // Only series that have at least 1 real joined member show up in trending series
    const validSeries = rawSeries.filter((s: any) => getSeriesJoinedCount(s) > 0);

    const topSeries = [...validSeries]
      .sort((a, b) => getSeriesJoinedCount(b) - getSeriesJoinedCount(a))
      .slice(0, 15);

    let topBooks: any[] = [];
    if (payload.trending) {
      const seriesChapterIdsSet = new Set<string>();
      rawSeries.forEach((s: any) => {
        if (Array.isArray(s.chapters)) {
          s.chapters.forEach((ch: any) => {
            const chId = ch?.content?._id || ch?.content || ch?._id;
            if (chId) seriesChapterIdsSet.add(String(chId));
          });
        }
      });
      
      // STRICT standalone books only - never include series chapters
      const strictStandalone = payload.trending.filter((item: any) => isStrictlyStandalone(item, seriesChapterIdsSet));
      
      const validBooks = strictStandalone.filter((b: any) => {
        const likes = Array.isArray(b.likes) ? b.likes.length : (b.likes || 0);
        const comments = Array.isArray(b.comments) ? b.comments.length : (b.comments || 0);
        return (likes + comments) > 0;
      });

      let booksCandidate = validBooks;
      if (booksCandidate.length < 5) {
        const remainingStandalone = strictStandalone.filter(
          (b: any) => !booksCandidate.some((c: any) => String(c._id) === String(b._id))
        );
        booksCandidate = [...booksCandidate, ...remainingStandalone];
      }

      topBooks = booksCandidate
        .sort((a: any, b: any) => {
          const likesA = Array.isArray(a.likes) ? a.likes.length : (a.likes || 0);
          const likesB = Array.isArray(b.likes) ? b.likes.length : (b.likes || 0);
          return likesB - likesA;
        })
        .slice(0, 15);
    }

    // Atomic update: only re-render if data has fundamentally changed
    setData(prev => {
      const sameBooks = prev.books.length === topBooks.length && prev.books[0]?._id === topBooks[0]?._id;
      const sameSeries = prev.series.length === topSeries.length && prev.series[0]?._id === topSeries[0]?._id;
      if (sameBooks && sameSeries && prev.books.length > 0) return prev;
      return { books: topBooks, series: topSeries };
    });
    setLoading(false);
  }, [isStrictlyStandalone]);

  useEffect(() => {
    let isMounted = true;
    const fetchTrendingData = async () => {
      try {
        const rawCache = await AsyncStorage.getItem("cached_feed_data");
        if (rawCache && isMounted) {
          processPayload(JSON.parse(rawCache));
        }
        
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const res = await api.get("/feed", { headers });
        const payload = res?.data?.data ?? res?.data;
        if (isMounted) {
          processPayload(payload);
        }
      } catch (error) {
        console.error("Error fetching top trending:", error);
        if (isMounted) setLoading(false);
      }
    };
    
    fetchTrendingData();
    return () => { isMounted = false; };
  }, [accessToken, processPayload]);

  const handleBookPress = useCallback((bookId: string) => {
    (navigation as any).navigate("ReadBook", { bookId });
  }, [navigation]);

  const handleSeriesPress = useCallback((seriesId: string) => {
    (navigation as any).navigate("SeriesOverview", { seriesId });
  }, [navigation]);

  const renderBookItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <BookCard item={item} rank={index + 1} onPress={handleBookPress} />
  ), [handleBookPress]);

  const renderSeriesItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <SeriesCard item={item} rank={index + 1} onPress={handleSeriesPress} />
  ), [handleSeriesPress]);

  // ⚡ 1. OPTIMIZED getItemLayout (O(1) exact math; eliminates onLayout measurement lag)
  // Total item height = CARD_HEIGHT (96) + ITEM_SEPARATOR_HEIGHT (12) = 108
  // Offset = LIST_PADDING_TOP (6) + (108 * index)
  const getItemLayout = useCallback((_: any, index: number) => ({
    length: CARD_HEIGHT,
    offset: LIST_PADDING_TOP + (CARD_HEIGHT + ITEM_SEPARATOR_HEIGHT) * index,
    index,
  }), []);

  // ⚡ 2. STABLE keyExtractor (Prevents inline lambda re-allocations)
  const keyExtractor = useCallback((item: any, index: number) => {
    return item?._id ? `tb-${item._id}` : `idx-${index}`;
  }, []);

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 16, 38) }]}>
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: true, radius: 20 }}
        >
          <BackIcon />
        </Pressable>
        
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Trending Now</Text>
          <Text style={styles.headerSubTitle}>Explore the most loved content.</Text>
        </View>
        
        <View style={{ width: 40 }} />
      </View>

      {/* ⚡ 100% NATIVE-DRIVEN TAB BAR */}
      <View style={styles.filterContainer}>
        {/* Hardware-accelerated sliding indicator */}
        <Animated.View 
          style={[
            styles.activeTabIndicator, 
            { transform: [{ translateX: indicatorTranslateX }] }
          ]} 
        />
        
        {/* Chapters Tab with Native Cross-Fade */}
        <Pressable 
          style={styles.filterTab}
          onPress={() => switchTab(0)}
        >
          <View style={styles.tabTextWrapper}>
            <Animated.Text style={[styles.filterTextActive, { opacity: chaptersActiveOpacity }]}>
              Chapters
            </Animated.Text>
            <Animated.Text style={[styles.filterTextInactive, { opacity: chaptersInactiveOpacity }]}>
              Chapters
            </Animated.Text>
          </View>
        </Pressable>

        {/* Series Tab with Native Cross-Fade */}
        <Pressable 
          style={styles.filterTab}
          onPress={() => switchTab(1)}
        >
          <View style={styles.tabTextWrapper}>
            <Animated.Text style={[styles.filterTextActive, { opacity: seriesActiveOpacity }]}>
              Series
            </Animated.Text>
            <Animated.Text style={[styles.filterTextInactive, { opacity: seriesInactiveOpacity }]}>
              Series
            </Animated.Text>
          </View>
        </Pressable>
      </View>

      {/* ⚡ HORIZONTAL PAGER DRIVEN ON NATIVE THREAD */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={pallete.accent} />
        </View>
      ) : (
        <Animated.ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          scrollEventThrottle={16}
          directionalLockEnabled={true}
          onScroll={onPagerScroll}
          style={{ flex: 1 }}
        >
          {/* PAGE 1: CHAPTERS / BOOKS */}
          <View style={{ width }}>
            {data.books.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Not Available Yet</Text>
                <Text style={styles.emptyText}>Not enough engagements</Text>
              </View>
            ) : (
              <FlatList
                data={data.books}
                keyExtractor={keyExtractor}
                renderItem={renderBookItem}
                getItemLayout={getItemLayout}
                ItemSeparatorComponent={ListSeparator}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                
                // ⚡ FLATLIST PERFORMANCE OPTIMIZATIONS:
                initialNumToRender={6}          // Only render initial viewport items on launch
                maxToRenderPerBatch={4}          // Limit batch render to prevent UI thread starvation
                windowSize={5}                   // Clamp virtual window (default 21 is a memory hog)
                updateCellsBatchingPeriod={30}   // Batch updates in 30ms windows
                nestedScrollEnabled={true}       // Allows Android to scroll vertically inside pager
                removeClippedSubviews={Platform.OS === 'android' ? false : true} // Avoids Android blank view drop bug
              />
            )}
          </View>

          {/* PAGE 2: SERIES */}
          <View style={{ width }}>
            {data.series.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Not Available Yet</Text>
                <Text style={styles.emptyText}>Not enough engagements.</Text>
              </View>
            ) : (
              <FlatList
                data={data.series}
                keyExtractor={keyExtractor}
                renderItem={renderSeriesItem}
                getItemLayout={getItemLayout}
                ItemSeparatorComponent={ListSeparator}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                
                // ⚡ FLATLIST PERFORMANCE OPTIMIZATIONS:
                initialNumToRender={6}
                maxToRenderPerBatch={4}
                windowSize={5}
                updateCellsBatchingPeriod={30}
                nestedScrollEnabled={true}
                removeClippedSubviews={Platform.OS === 'android' ? false : true}
              />
            )}
          </View>
        </Animated.ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05020B",
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#05020B",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
    marginTop: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  headerSubTitle: {
    fontSize: 12,
    color: '#9ca3af',
  },

  // Tabs
  filterContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  activeTabIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: TAB_WIDTH,
    height: '100%',
    backgroundColor: 'rgba(0, 210, 180, 0.12)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 180, 0.5)',
  },
  filterTab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  tabTextWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterTextActive: {
    fontSize: 14,
    fontWeight: '700',
    color: '#00D2B4',
  },
  filterTextInactive: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9ca3af',
    position: 'absolute',
  },

  // List States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: LIST_PADDING_TOP,
    paddingBottom: LIST_PADDING_BOTTOM,
  },
  separator: {
    height: ITEM_SEPARATOR_HEIGHT,
  },

  // Card Styles
  cardContainer: {
    height: CARD_HEIGHT,
    flexDirection: 'row',
    backgroundColor: "#0C0814",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    overflow: 'hidden', 
  },
  cardPressed: {
    opacity: 0.82,
    backgroundColor: "#130C20",
  },
  
  // Rank Block
  rankBlock: {
    width: 42,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 210, 180, 0.12)',
  },
  rankBlockText: {
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
  },

  // Card Internal Layout
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  // Cover Image
  bookCoverWrapper: {
    width: 50,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  seriesCoverWrapper: {
    width: 78,
    height: 50,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  frameworkBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(245, 158, 11, 0.92)',
    paddingVertical: 1.5,
    alignItems: 'center',
  },
  frameworkBadgeText: {
    fontSize: 6.5,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },

  // Info Container
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f9fafb',
    marginBottom: 3,
    lineHeight: 18,
  },
  author: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#00D2B4',
    fontWeight: '600',
  },

  // Right Section
  rightSectionStacked: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 6,
  },
  rightSectionCentered: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  
  // Badges
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 210, 180, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 54,
    justifyContent: 'center',
  },
  statBadgeMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 54,
    justifyContent: 'center',
  },
  statText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00D2B4',
  },
  statTextMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
  },
  joinedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 210, 180, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 180, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  joinedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00D2B4',
  }
});