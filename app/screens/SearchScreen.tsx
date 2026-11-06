import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Dimensions,
  Vibration,
  BackHandler,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";

import pallete from "../../lib/Colors";
import CachedImage, { isRenderableUrl } from "../../components/props/CachedImage";
import { api } from "../../lib/api";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { canUserAccessChapter } from "../../lib/entitlements";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import SeriesCard from "../../components/props/SeriesCard";
import { ISeries } from "../../types/Series";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Geometry for 3-column Books grid and 2-column Series grid
const HORIZONTAL_PADDING = 16;
const BOOK_GAP = 10;
const BOOK_CARD_WIDTH = Math.floor(
  (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - BOOK_GAP * 2) / 3
);
const BOOK_COVER_HEIGHT = Math.round(BOOK_CARD_WIDTH * 1.45);

const SERIES_GAP = 12;
const SERIES_CARD_WIDTH = Math.floor(
  (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - SERIES_GAP) / 2
);

const RECENT_SEARCHES_KEY = "@readapt_recent_searches";

const DEFAULT_SUGGESTIONS = [
  "Self Improvement",
  "Productivity",
  "Business",
  "Emotional Intelligence",
  "Technology",
  "Health & Wellness",
  "Mindset",
  "Leadership",
  "Psychology",
  "Atomic Habits",
];

const FILTER_TABS = ["All", "Books", "Series", "Frameworks"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

// Helper Functions
const getOptimizedThumb = (url?: string, width = 160, height = 220): string => {
  if (!url) {
    return "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=300&auto=format&fit=crop";
  }
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", `/upload/c_fill,w_${width},h_${height},q_auto,f_auto/`);
  }
  return url;
};

// SVG Icons
const BackIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path
      d="M19 12H5M5 12L12 19M5 12L12 5"
      stroke="#ffffff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SearchIcon = ({ color = "#9ca3af", size = 18 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={2} />
    <Path
      d="M20 20L16.5 16.5"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

const ClearIcon = ({ size = 18 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" fill="#334155" />
    <Path
      d="M15 9L9 15M9 9L15 15"
      stroke="#ffffff"
      strokeWidth={1.75}
      strokeLinecap="round"
    />
  </Svg>
);

const ClockIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke="#9ca3af" strokeWidth={2} />
    <Path d="M12 7V12L15 14" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const ChevronRightIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 18L15 12L9 6"
      stroke="#64748b"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const ChevronDownIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 9L12 15L18 9"
      stroke="#9ca3af"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SmallCloseIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
    <Path
      d="M18 6L6 18M6 6L18 18"
      stroke="#94a3b8"
      strokeWidth={2.2}
      strokeLinecap="round"
    />
  </Svg>
);

// Custom subtle loading animation
const FindingResultsLoader = () => {
  const pulseAnim1 = useRef(new Animated.Value(0.85)).current;
  const pulseAnim2 = useRef(new Animated.Value(0.7)).current;
  const textFadeAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse1 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim1, {
          toValue: 1.35,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim1, {
          toValue: 0.85,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    const pulse2 = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(pulseAnim2, {
          toValue: 1.5,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim2, {
          toValue: 0.7,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    const textPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(textFadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(textFadeAnim, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    pulse1.start();
    pulse2.start();
    textPulse.start();

    return () => {
      pulse1.stop();
      pulse2.stop();
      textPulse.stop();
    };
  }, [pulseAnim1, pulseAnim2, textFadeAnim]);

  return (
    <View style={loaderStyles.container}>
      <View style={loaderStyles.auraWrap}>
        <Animated.View
          style={[
            loaderStyles.pulseRing,
            {
              transform: [{ scale: pulseAnim1 }],
              opacity: pulseAnim1.interpolate({
                inputRange: [0.85, 1.35],
                outputRange: [0.5, 0],
              }),
            },
          ]}
        />
        <Animated.View
          style={[
            loaderStyles.pulseRingOuter,
            {
              transform: [{ scale: pulseAnim2 }],
              opacity: pulseAnim2.interpolate({
                inputRange: [0.7, 1.5],
                outputRange: [0.35, 0],
              }),
            },
          ]}
        />
        <View style={loaderStyles.centerBadge}>
          <SearchIcon color="#2dd4bf" size={24} />
        </View>
      </View>

      <Animated.Text style={[loaderStyles.titleText, { opacity: textFadeAnim }]}>
        Finding the best results for you...
      </Animated.Text>
      <Text style={loaderStyles.subText}>
        Scanning books, series & frameworks
      </Text>
    </View>
  );
};

const loaderStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 70,
  },
  auraWrap: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    position: "relative",
  },
  pulseRing: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "#2dd4bf",
    backgroundColor: "rgba(45, 212, 191, 0.08)",
  },
  pulseRingOuter: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1.5,
    borderColor: "#38bdf8",
    backgroundColor: "rgba(56, 189, 248, 0.05)",
  },
  centerBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#161d2d",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.3)",
    elevation: 4,
    shadowColor: "#2dd4bf",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  titleText: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  subText: {
    fontSize: 12.5,
    color: "#94a3b8",
  },
});

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "SearchScreen">>();
  const { user } = useUser();
  const { showToast } = useToast();

  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState(route.params?.initialQuery || "");
  const [activeSearchTerm, setActiveSearchTerm] = useState(route.params?.initialQuery || "");
  const [screenMode, setScreenMode] = useState<"typing" | "results">(
    route.params?.initialQuery ? "results" : "typing"
  );
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [isSearching, setIsSearching] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [feedData, setFeedData] = useState<any>(null);

  // Load Recent Searches
  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setRecentSearches(parsed);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const saveRecentSearch = useCallback(async (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setRecentSearches((prev) => {
      const updated = [
        clean,
        ...prev.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
      ].slice(0, 10);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const removeRecentSearch = useCallback(async (termToRemove: string) => {
    try {
      Vibration.vibrate(6);
    } catch {}
    setRecentSearches((prev) => {
      const updated = prev.filter((item) => item !== termToRemove);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearAllRecentSearches = useCallback(async () => {
    try {
      Vibration.vibrate(6);
    } catch {}
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_KEY).catch(() => {});
  }, []);

  // Hydrate library dataset
  useEffect(() => {
    AsyncStorage.getItem("cached_feed_data")
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            setFeedData(parsed);
          } catch {}
        }
      })
      .catch(() => {});

    api.get("/feed")
      .then((res) => {
        const payload = res?.data?.data ?? res?.data;
        if (payload) {
          setFeedData(payload);
          AsyncStorage.setItem("cached_feed_data", JSON.stringify(payload)).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // Strict Standalone Check (Same as Home tab)
  const seriesChapterIdsSet = useMemo(() => {
    const ids = new Set<string>();
    const allSeriesList: any[] = [...(feedData?.series || [])];

    allSeriesList.forEach((s) => {
      if (Array.isArray(s.chapters)) {
        s.chapters.forEach((ch: any) => {
          const chId = ch?.content?._id || ch?.content || ch?._id;
          if (chId) ids.add(String(chId));
        });
      }
    });
    return ids;
  }, [feedData?.series]);

  const isStrictlyStandalone = useCallback(
    (item: any): boolean => {
      if (!item || !item._id) return false;
      if (seriesChapterIdsSet.has(String(item._id))) return false;
      if (Array.isArray(item.chapters) && item.chapters.length > 0) return false;
      if (item.contentModel && item.contentModel !== "Chapter") return false;
      if (typeof item.series === "string" && item.series.trim() !== "") return false;
      if (item.series && typeof item.series === "object") return false;
      return true;
    },
    [seriesChapterIdsSet]
  );

  // Execute Search for a term
  const handlePerformSearch = useCallback(
    (searchTerm: string) => {
      const clean = searchTerm.trim();
      if (!clean) return;
      try {
        Vibration.vibrate(6);
      } catch {}

      setQuery(clean);
      setActiveSearchTerm(clean);
      saveRecentSearch(clean);
      setScreenMode("results");
      setIsSearching(true);

      setTimeout(() => {
        setIsSearching(false);
      }, 420);
    },
    [saveRecentSearch]
  );

  // Hardware back
  useEffect(() => {
    const onBackPress = () => {
      if (screenMode === "results") {
        setScreenMode("typing");
        return true;
      }
      navigation.goBack();
      return true;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => backHandler.remove();
  }, [screenMode, navigation]);

  // Initial query trigger
  useEffect(() => {
    if (route.params?.initialQuery) {
      handlePerformSearch(route.params.initialQuery);
    }
  }, [route.params?.initialQuery, handlePerformSearch]);

  // Advanced scoring search system
  const { filteredBooks, filteredSeries, filteredFrameworks, totalCount } = useMemo(() => {
    if (!activeSearchTerm.trim() || !feedData) {
      return { filteredBooks: [], filteredSeries: [], filteredFrameworks: [], totalCount: 0 };
    }

    const term = activeSearchTerm.toLowerCase().trim();
    const queryTokens = term.split(/\s+/).filter(Boolean);

    const computeRelevance = (item: any): number => {
      let score = 0;
      const title = (item.title || "").toLowerCase();
      const author = (item.author || "").toLowerCase();
      const desc = (item.description || item.details || item.shortDescription || "").toLowerCase();
      const cat = typeof item.category === "string" ? item.category.toLowerCase() : "";

      if (title === term) score += 100;
      else if (title.startsWith(term)) score += 70;
      else if (title.includes(term)) score += 50;

      queryTokens.forEach((token: string) => {
        if (title.includes(token)) score += 20;
        if (author.includes(token)) score += 15;
        if (cat.includes(token)) score += 10;
        if (desc.includes(token)) score += 5;
      });

      return score;
    };

    const rawBooksPool: any[] = [];
    const seenBookIds = new Set<string>();

    const pushBook = (book: any) => {
      if (!book) return;
      const b = book.content || book;
      const id = String(b._id || "");
      if (id && !seenBookIds.has(id) && isStrictlyStandalone(b)) {
        seenBookIds.add(id);
        rawBooksPool.push(b);
      }
    };

    (feedData.trending || []).forEach(pushBook);
    (feedData.personalized || []).forEach(pushBook);
    (feedData.available || []).forEach(pushBook);

    const matchedBooks = rawBooksPool
      .map((b) => ({ item: b, score: computeRelevance(b) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

    const rawSeriesPool: ISeries[] = feedData.series || [];
    const matchedAllSeries = rawSeriesPool
      .map((s) => ({ item: s, score: computeRelevance(s) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

    const matchedRegularSeries = matchedAllSeries.filter((s) => s.type !== "framework");
    const matchedFrameworks = matchedAllSeries.filter((s) => s.type === "framework");

    const total = matchedBooks.length + matchedRegularSeries.length + matchedFrameworks.length;

    return {
      filteredBooks: matchedBooks,
      filteredSeries: matchedRegularSeries,
      filteredFrameworks: matchedFrameworks,
      totalCount: total,
    };
  }, [activeSearchTerm, feedData, isStrictlyStandalone]);

  // Navigate to ReadBook / AudioRdr
  const handleBookPress = (book: any) => {
    const targetId = book?._id;
    if (!targetId) {
      showToast({ title: "Unable to load chapter" });
      return;
    }

    const accessCheck = canUserAccessChapter(user, book?.for ?? 0);
    if (!accessCheck.allowed) {
      showToast({
        title: accessCheck.reason || "Upgrade your subscription to access this content.",
      });
      return;
    }

    const mediaType = book?.type ?? "pdf";
    if (mediaType === "pdf") {
      navigation.navigate("ReadBook", {
        bookId: String(targetId),
        initialBookData: book,
      } as any);
    } else {
      navigation.navigate("AudioRdr", {
        bookId: String(targetId),
        initialBookData: book,
      } as any);
    }
  };

  const visibleSuggestions = useMemo(() => {
    if (!query.trim()) return DEFAULT_SUGGESTIONS;
    const lower = query.toLowerCase();
    const matches = DEFAULT_SUGGESTIONS.filter((s) => s.toLowerCase().includes(lower));
    return matches.length > 0 ? matches : [query, ...DEFAULT_SUGGESTIONS.slice(0, 5)];
  }, [query]);

  const handleHeaderBack = () => {
    try {
      Vibration.vibrate(6);
    } catch {}
    if (screenMode === "results") {
      setScreenMode("typing");
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header Bar (NO FILTER ICON) */}
      <View style={styles.topHeaderBar}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={handleHeaderBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <BackIcon />
        </TouchableOpacity>

        <Pressable
          style={styles.headerInputWrapper}
          onPress={() => {
            if (screenMode === "results") {
              setScreenMode("typing");
            }
          }}>
          <SearchIcon color="#94a3b8" size={18} />
          <TextInput
            ref={inputRef}
            style={styles.headerTextInput}
            placeholder="Search for books, series, topics..."
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={(txt) => {
              setQuery(txt);
              if (screenMode === "results") {
                setScreenMode("typing");
              }
            }}
            autoFocus={screenMode === "typing"}
            returnKeyType="search"
            autoCapitalize="none"
            onSubmitEditing={() => handlePerformSearch(query)}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery("");
                if (screenMode === "results") {
                  setScreenMode("typing");
                }
              }}
              style={styles.clearBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <ClearIcon size={16} />
            </TouchableOpacity>
          )}
        </Pressable>
      </View>

      {/* Typing View (Screen 4) */}
      {screenMode === "typing" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.typingScrollContent, { paddingBottom: insets.bottom + 40 }]}>
          {recentSearches.length > 0 && (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionTitleLeft}>
                  <ClockIcon />
                  <Text style={styles.sectionTitleText}>Recent Searches</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={clearAllRecentSearches}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.clearAllBtnText}>Clear All</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.recentChipsWrap}>
                {recentSearches.map((term, index) => (
                  <TouchableOpacity
                    key={`${term}-${index}`}
                    style={styles.recentChip}
                    activeOpacity={0.75}
                    onPress={() => handlePerformSearch(term)}>
                    <Text style={styles.recentChipText}>{term}</Text>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        removeRecentSearch(term);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.chipDeleteBtn}>
                      <SmallCloseIcon />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Suggested Searches */}
          <View style={styles.sectionWrap}>
            <View style={styles.sectionTitleLeft}>
              <SearchIcon color="#94a3b8" size={17} />
              <Text style={styles.sectionTitleText}>Suggested Searches</Text>
            </View>

            <View style={styles.suggestedListWrap}>
              {visibleSuggestions.map((item, index) => (
                <TouchableOpacity
                  key={`${item}-${index}`}
                  style={styles.suggestedItemRow}
                  activeOpacity={0.65}
                  onPress={() => handlePerformSearch(item)}>
                  <View style={styles.suggestedItemLeft}>
                    <SearchIcon color="#64748b" size={16} />
                    <Text style={styles.suggestedItemText}>{item}</Text>
                  </View>
                  <ChevronRightIcon />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Results View (Screen 2) */}
      {screenMode === "results" && (
        <View style={styles.resultsContainer}>
          {/* Filter Chips Bar (All, Books, Series, Frameworks) */}
          <View style={styles.filterChipsRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsScroll}>
              {FILTER_TABS.map((tab) => {
                const isActive = activeFilter === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.filterTabPill,
                      isActive && styles.filterTabPillActive,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => {
                      try {
                        Vibration.vibrate(6);
                      } catch {}
                      setActiveFilter(tab);
                    }}>
                    <Text
                      style={[
                        styles.filterTabPillText,
                        isActive && styles.filterTabPillTextActive,
                      ]}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Results Summary Header */}
          <View style={styles.resultsMetaBar}>
            <Text style={styles.resultsCountText}>
              {totalCount} {totalCount === 1 ? "result" : "results"} for "{activeSearchTerm}"
            </Text>
            <View style={styles.sortSelector}>
              <Text style={styles.sortSelectorText}>Sort by: Relevance</Text>
              <ChevronDownIcon />
            </View>
          </View>

          {/* Results Content Body or Loading Animation */}
          {isSearching ? (
            <FindingResultsLoader />
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.resultsScrollContent,
                { paddingBottom: insets.bottom + 50 },
              ]}>
              {totalCount === 0 ? (
                <View style={styles.emptyStateContainer}>
                  <View style={styles.emptyIconCircle}>
                    <SearchIcon color="#2dd4bf" size={34} />
                  </View>
                  <Text style={styles.emptyTitle}>No results found</Text>
                  <Text style={styles.emptySubtitle}>
                    We couldn't find any books, series, or frameworks matching "{activeSearchTerm}". Try another keyword or topic.
                  </Text>
                </View>
              ) : (
                <>
                  {/* 1. BOOKS SECTION (3 Columns Grid) */}
                  {(activeFilter === "All" || activeFilter === "Books") &&
                    filteredBooks.length > 0 && (
                      <View style={styles.resultsSection}>
                        <View style={styles.gridHeaderRow}>
                          <Text style={styles.gridHeaderTitle}>
                            Books ({filteredBooks.length})
                          </Text>
                        </View>

                        <View style={styles.booksGridWrap}>
                          {filteredBooks.map((book: any, idx: number) => {
                            const isAudio = book.type === "audio";

                            return (
                              <TouchableOpacity
                                key={book._id || idx}
                                style={styles.bookCard}
                                activeOpacity={0.8}
                                onPress={() => handleBookPress(book)}>
                                <View style={styles.bookCoverWrapper}>
                                  <CachedImage
                                    uri={
                                      isRenderableUrl(book.cover)
                                        ? getOptimizedThumb(book.cover, 180, 260)
                                        : null
                                    }
                                    label={book.title}
                                    style={styles.bookCoverImage}
                                    letterSize={38}
                                  />
                                  <View
                                    style={[
                                      styles.bookTypeBadge,
                                      isAudio && styles.audioBadge,
                                    ]}>
                                    <Text style={styles.bookTypeBadgeText}>
                                      {isAudio ? "Audio" : "Book"}
                                    </Text>
                                  </View>
                                </View>

                                <Text style={styles.bookTitle} numberOfLines={2}>
                                  {book.title}
                                </Text>
                                <Text style={styles.bookAuthor} numberOfLines={1}>
                                  {book.author || "READAPT"}
                                </Text>
                                {book.total ? (
                                  <Text style={styles.bookMeta} numberOfLines={1}>
                                    {book.total} pages
                                  </Text>
                                ) : null}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                  {/* 2. SERIES SECTION (2 Columns Grid with Real SeriesCard Component) */}
                  {(activeFilter === "All" || activeFilter === "Series") &&
                    filteredSeries.length > 0 && (
                      <View style={styles.resultsSection}>
                        <View style={styles.gridHeaderRow}>
                          <Text style={styles.gridHeaderTitle}>
                            Series ({filteredSeries.length})
                          </Text>
                        </View>

                        <View style={styles.seriesGridWrap}>
                          {filteredSeries.map((series: ISeries, idx: number) => {
                            const chaptersCount =
                              series.chapters?.filter(
                                (c: any) => c?.contentModel === "Chapter"
                              ).length || 0;

                            return (
                              <View key={series._id || idx} style={{ width: SERIES_CARD_WIDTH, marginBottom: 14 }}>
                                <SeriesCard
                                  id={String(series._id)}
                                  title={series.title}
                                  author={series.author || "READAPT"}
                                  cover={series.cover}
                                  chapterCount={chaptersCount}
                                  type={series.type}
                                  cardWidth={SERIES_CARD_WIDTH}
                                />
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}

                  {/* 3. FRAMEWORKS SECTION (2 Columns Grid with Real SeriesCard Component) */}
                  {(activeFilter === "All" || activeFilter === "Frameworks") &&
                    filteredFrameworks.length > 0 && (
                      <View style={styles.resultsSection}>
                        <View style={styles.gridHeaderRow}>
                          <Text style={styles.gridHeaderTitle}>
                            Frameworks ({filteredFrameworks.length})
                          </Text>
                        </View>

                        <View style={styles.seriesGridWrap}>
                          {filteredFrameworks.map((series: ISeries, idx: number) => {
                            const chaptersCount =
                              series.chapters?.filter(
                                (c: any) => c?.contentModel === "Chapter"
                              ).length || 0;

                            return (
                              <View key={series._id || idx} style={{ width: SERIES_CARD_WIDTH, marginBottom: 14 }}>
                                <SeriesCard
                                  id={String(series._id)}
                                  title={series.title}
                                  author={series.author || "READAPT"}
                                  cover={series.cover}
                                  chapterCount={chaptersCount}
                                  type="framework"
                                  cardWidth={SERIES_CARD_WIDTH}
                                />
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain,
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  headerInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#131927",
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  headerTextInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14.5,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  typingScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  sectionWrap: {
    marginBottom: 28,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionTitleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  clearAllBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2dd4bf",
  },
  recentChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171d2d",
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    gap: 6,
  },
  recentChipText: {
    fontSize: 13,
    color: "#e2e8f0",
    fontWeight: "500",
  },
  chipDeleteBtn: {
    padding: 2,
  },
  suggestedListWrap: {
    gap: 2,
  },
  suggestedItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  suggestedItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  suggestedItemText: {
    fontSize: 14.5,
    color: "#e2e8f0",
    fontWeight: "500",
  },
  resultsContainer: {
    flex: 1,
  },
  filterChipsRow: {
    paddingVertical: 6,
  },
  filterChipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTabPill: {
    backgroundColor: "#161d2d",
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  filterTabPillActive: {
    backgroundColor: "#2dd4bf",
    borderColor: "#2dd4bf",
  },
  filterTabPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
  },
  filterTabPillTextActive: {
    color: "#090314",
    fontWeight: "700",
  },
  resultsMetaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  resultsCountText: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "500",
  },
  sortSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sortSelectorText: {
    fontSize: 12.5,
    color: "#94a3b8",
    fontWeight: "500",
  },
  resultsScrollContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 10,
  },
  resultsSection: {
    marginBottom: 26,
  },
  gridHeaderRow: {
    marginBottom: 12,
  },
  gridHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  booksGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: BOOK_GAP,
  },
  bookCard: {
    width: BOOK_CARD_WIDTH,
    marginBottom: 14,
  },
  bookCoverWrapper: {
    width: BOOK_CARD_WIDTH,
    height: BOOK_COVER_HEIGHT,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#161329",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  bookCoverImage: {
    width: "100%",
    height: "100%",
  },
  bookTypeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(2, 132, 199, 0.9)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  audioBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.9)",
  },
  bookTypeBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  bookTitle: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#ffffff",
    marginTop: 6,
    lineHeight: 16,
  },
  bookAuthor: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  bookMeta: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },
  seriesGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SERIES_GAP,
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(45, 212, 191, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 20,
  },
});
