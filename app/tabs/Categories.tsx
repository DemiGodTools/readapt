import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Dimensions,
  Vibration,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Path } from "react-native-svg";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";

import { api, ROOT_API_BASE } from "../../lib/api";
import CachedImage, {
  isRenderableUrl,
  prefetchImages,
} from "../../components/props/CachedImage";
import { ICategory, ISubCategory } from "../../types/Category";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import pallete from "../../lib/Colors";

// Enable Hardware Layout Animations for Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const Shimmer = createShimmerPlaceholder(LinearGradient);
const CACHE_KEY = "@cached_categories_tree";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Clean, bouncy-free LayoutAnimation preset
const smoothExpandAnim = {
  duration: 300,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

const CategoryCard = memo(({ 
  category, 
  isExpanded, 
  onToggleExpand, 
  onSubCategoryPress,
  priority = "normal",
}: { 
  category: ICategory; 
  isExpanded: boolean; 
  onToggleExpand: (category: ICategory) => void; 
  onSubCategoryPress: (category: ICategory, sub: ISubCategory) => void;
  priority?: "low" | "normal" | "high";
}) => {
  const subCats = category.subCategories || [];
  
  // Only animate the rotation manually (LayoutAnimation handles the rest)
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  const categoryImageUrl = isRenderableUrl(category.image) ? category.image : null;

  // Chevron Rotation
  useEffect(() => {
    // Smooth bezier curve guarantees no bounce/spring
    const smoothEasing = Easing.bezier(0.4, 0.0, 0.2, 1);

    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      easing: smoothEasing,
      useNativeDriver: true,
    }).start();
  }, [isExpanded, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.cardContainer}>
      <Pressable
        style={styles.card}
        android_ripple={{ color: "rgba(255,255,255,0.06)" }}
        onPressIn={() => prefetchImages(subCats.map((sub) => sub.image))}
        onPress={() => onToggleExpand(category)}>
        <CachedImage
          uri={categoryImageUrl}
          label={category.name}
          style={styles.cardImage}
          priority={priority}
          letterSize={64}
        />

        <LinearGradient
          colors={[
            "rgba(10, 6, 20, 0.15)",
            "rgba(10, 6, 20, 0.75)",
            "rgba(10, 6, 20, 0.98)",
          ]}
          style={styles.gradientOverlay}
        />

        <View style={styles.cardBody}>
          <View style={styles.topMetaRow}>
            <View style={styles.subCatCountBadge}>
              <Text style={styles.subCatCountBadgeText}>
                {subCats.length}{" "}
                {subCats.length === 1 ? "SUB-CATEGORY" : "SUB-CATEGORIES"}
              </Text>
            </View>
          </View>

          <Text style={styles.categoryName} numberOfLines={2}>
            {category.name}
          </Text>

          {category.description ? (
            <Text style={styles.categoryDesc} numberOfLines={2}>
              {category.description}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            <View style={{ flex: 1 }} />
            <View style={styles.expandIconBtn}>
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M6 9L12 15L18 9"
                    stroke="#2dd4bf"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Animated.View>
            </View>
          </View>
        </View>
      </Pressable>

      {/* Expanded Accordion Body */}
      {isExpanded && (
        <View style={styles.subCatSection}>
          
          {/* Deep static glassmorphic gradient overlay */}
          <LinearGradient
            colors={["rgba(16, 12, 30, 0.75)", "rgba(12, 8, 24, 0.98)"]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <View style={styles.subCatSectionHeader}>
            <Text style={styles.subCatHeading}>SUB-CATEGORIES</Text>
            <Text style={styles.subCatCountLabel}>
              {subCats.length} {subCats.length === 1 ? "topic" : "topics"}
            </Text>
          </View>

          {subCats.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              contentContainerStyle={styles.subCatScroll}>
              {subCats.map((sub: ISubCategory) => {
                return (
                  <TouchableOpacity
                    key={sub._id}
                    style={styles.subCatCard169}
                    activeOpacity={0.85}
                    onPress={() => onSubCategoryPress(category, sub)}>
                    <View style={styles.subCatImageWrapper}>
                      <CachedImage
                        uri={isRenderableUrl(sub.image) ? sub.image : null}
                        label={sub.name}
                        style={styles.subCatImage169}
                        letterSize={34}
                      />
                      <LinearGradient
                        colors={["transparent", "rgba(10, 6, 20, 0.75)"]}
                        style={StyleSheet.absoluteFillObject}
                      />
                      <View style={styles.subCatPillBadge}>
                        <Text style={styles.subCatPillBadgeText}>
                          {sub.counts?.total || 0} ITEMS
                        </Text>
                      </View>
                    </View>
                    <View style={styles.subCatCardInfo}>
                      <Text style={styles.subCatCardTitle} numberOfLines={1}>
                        {sub.name}
                      </Text>
                      <View style={styles.subCatViewRow}>
                        <Text style={styles.subCatViewText}>Explore</Text>
                        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                          <Path
                            d="M9 18L15 12L9 6"
                            stroke="#2dd4bf"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Svg>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.emptySubCatState}>
              <View style={styles.grayscaleIconContainer}>
                <Svg
                  width={26}
                  height={26}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <Path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <Path d="M9 14l6-6" stroke="#64748b" strokeWidth={1.5} />
                </Svg>
              </View>
              <Text style={styles.emptySubCatTitle}>
                No Sub-categories Available
              </Text>
              <Text style={styles.emptySubCatSubtitle}>
                All content in this category is directly available
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

const augmentCategoryCounts = (cats: ICategory[], feedSeries: any[]): ICategory[] => {
  if (!Array.isArray(cats) || !Array.isArray(feedSeries) || feedSeries.length === 0) {
    return cats;
  }

  return cats.map((cat) => {
    let catTotalExtra = 0;
    const catId = String(cat._id || "");

    const augmentedSubCats = (cat.subCategories || []).map((sub) => {
      const subId = String(sub._id || "");
      const subName = (sub.name || "").trim().toLowerCase();

      const matchingSeries = feedSeries.filter((s: any) => {
        const sSubId = String(s?.subCategory?._id || s?.subCategory || s?.subCategoryId || "");
        const sSubName = (s?.subCategory?.name || "").trim().toLowerCase();
        return (subId && sSubId === subId) || (subName && sSubName === subName);
      });

      const currentTotal = sub.counts?.total || 0;
      const seriesAlreadyCounted = (sub.counts as any)?.series || 0;
      const extraSeries = Math.max(0, matchingSeries.length - seriesAlreadyCounted);

      if (extraSeries > 0) {
        catTotalExtra += extraSeries;
        return {
          ...sub,
          counts: {
            total: currentTotal + extraSeries,
            pdf: sub.counts?.pdf || 0,
            audio: sub.counts?.audio || 0,
            series: seriesAlreadyCounted + extraSeries,
          },
        };
      }
      return sub;
    });

    return {
      ...cat,
      counts: {
        total: (cat.counts?.total || 0) + catTotalExtra,
        pdf: cat.counts?.pdf || 0,
        audio: cat.counts?.audio || 0,
        series: ((cat.counts as any)?.series || 0) + catTotalExtra,
      },
      subCategories: augmentedSubCats,
    };
  });
};

const Categories = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const warmMainCovers = useCallback((list: ICategory[]) => {
    prefetchImages(list.map((cat) => cat.image));
  }, []);

  const [categories, setCategories] = useState<ICategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const loadCategories = useCallback(async (isPullToRefresh = false) => {
    if (isFetchingRef.current && !isPullToRefresh) return;
    isFetchingRef.current = true;
    if (isPullToRefresh) setRefreshing(true);

    let cachedFeedSeries: any[] = [];
    try {
      const rawFeed = await AsyncStorage.getItem("cached_feed_data");
      if (rawFeed) {
        const parsed = JSON.parse(rawFeed);
        if (Array.isArray(parsed?.series)) {
          cachedFeedSeries = parsed.series;
        }
      }
    } catch {}

    try {
      if (!isPullToRefresh) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const augmented = augmentCategoryCounts(parsed, cachedFeedSeries);
              setCategories(augmented);
              setLoading(false);
              warmMainCovers(augmented);
            }
          } catch {}
        }
      }

      let res: any = null;
      try {
        res = await api.get("/category", { timeout: 25000 });
      } catch (userApiErr) {
        try {
          res = await api.get(`${ROOT_API_BASE}/category`, { timeout: 25000 });
        } catch {}
      }

      if (res?.data?.success && Array.isArray(res.data.data)) {
        const freshList: ICategory[] = augmentCategoryCounts(res.data.data, cachedFeedSeries);
        setCategories(freshList);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(freshList));
        warmMainCovers(freshList);
      }
    } catch (err: any) {
      if (err?.message !== "canceled") {
        console.warn("Categories fetch notice:", err?.message || "Network request failed");
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [warmMainCovers]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleToggleExpand = useCallback((category: ICategory) => {
    try {
      Vibration.vibrate(8);
    } catch {}

    prefetchImages((category.subCategories || []).map((sub) => sub.image));

    // Fire layout animation exactly before updating the state
    LayoutAnimation.configureNext(smoothExpandAnim);
    setExpandedCategoryId((prev) => (prev === category._id ? null : category._id));
  }, []);

  const handleSubCategoryPress = useCallback((category: ICategory, sub: ISubCategory) => {
    try {
      Vibration.vibrate(8);
    } catch {}

    navigation.navigate("SubCategoryOverview", {
      subCategoryId: sub._id,
      categoryId: category._id,
      categoryName: category.name,
      subCategory: sub,
    });
  }, [navigation]);

  const filteredCategories = useMemo(() => {
    if (!selectedCategoryFilter) return categories;
    return categories.filter((c) => c._id === selectedCategoryFilter);
  }, [categories, selectedCategoryFilter]);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top + 16, 28) }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 100 + insets.bottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadCategories(true)}
            tintColor="#01796F"
            colors={["#01796F"]}
          />
        }>
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Explore Categories</Text>
          <Text style={styles.headerSubtitle}>
            Dive deep into curated subjects, specialized topics, and interactive materials
          </Text>
        </View>

        {categories.length > 0 && (
          <View style={styles.chipsSection}>
            <Text style={styles.popularCategoriesHeading}>Popular Categories</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterBar}>
              {categories.map((cat) => {
                const isSelected = selectedCategoryFilter === cat._id;
                return (
                  <TouchableOpacity
                    key={cat._id}
                    style={[
                      styles.filterChip,
                      isSelected && styles.filterChipActive,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => {
                      try {
                        Vibration.vibrate(8);
                      } catch {}
                      setSelectedCategoryFilter(isSelected ? null : cat._id);
                    }}>
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected && styles.filterChipTextActive,
                      ]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {loading && categories.length === 0 ? (
          <View style={styles.skeletonContainer}>
            {[1, 2, 3].map((key) => (
              <View key={key} style={styles.skeletonCard}>
                <Shimmer
                  shimmerColors={["#191525", "#262038", "#191525"]}
                  style={styles.skeletonBanner}
                />
                <View style={styles.skeletonBody}>
                  <Shimmer
                    shimmerColors={["#191525", "#262038", "#191525"]}
                    style={styles.skeletonTitle}
                  />
                  <Shimmer
                    shimmerColors={["#191525", "#262038", "#191525"]}
                    style={styles.skeletonDesc}
                  />
                  <View style={styles.skeletonRow}>
                    <Shimmer
                      shimmerColors={["#191525", "#262038", "#191525"]}
                      style={styles.skeletonPill}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : filteredCategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No categories found</Text>
            <Text style={styles.emptySubtitle}>
              Try refreshing or check your internet connection
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => loadCategories(true)}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cardsList}>
            {filteredCategories.map((category, index) => (
              <CategoryCard
                key={category._id}
                category={category}
                isExpanded={expandedCategoryId === category._id}
                onToggleExpand={handleToggleExpand}
                onSubCategoryPress={handleSubCategoryPress}
                priority={index < 3 ? "high" : "normal"}
              />
            ))}
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
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 4,
    lineHeight: 18,
  },
  chipsSection: {
    marginBottom: 16,
  },
  popularCategoriesHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.3,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  filterBar: {
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    backgroundColor: "#15102a",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  filterChipActive: {
    backgroundColor: "rgba(1, 121, 111, 0.32)",
    borderColor: "#01796F",
  },
  filterChipText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#2dd4bf",
    fontWeight: "700",
  },
  skeletonContainer: {
    gap: 16,
  },
  skeletonCard: {
    height: 180,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#130f24",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  skeletonBanner: {
    width: "100%",
    height: 110,
  },
  skeletonBody: {
    padding: 12,
    gap: 8,
  },
  skeletonTitle: {
    width: "60%",
    height: 18,
    borderRadius: 4,
  },
  skeletonDesc: {
    width: "85%",
    height: 12,
    borderRadius: 4,
  },
  skeletonRow: {
    flexDirection: "row",
    gap: 8,
  },
  skeletonPill: {
    width: 90,
    height: 20,
    borderRadius: 10,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: "#01796F",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  cardsList: {
    gap: 20,
  },
  cardContainer: {
    backgroundColor: "#120e24",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  card: {
    height: 185,
    position: "relative",
    justifyContent: "flex-end",
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  cardBody: {
    padding: 16,
    zIndex: 2,
  },
  topMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  subCatCountBadge: {
    backgroundColor: "rgba(1, 121, 111, 0.4)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.35)",
  },
  subCatCountBadgeText: {
    color: "#2dd4bf",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  categoryName: {
    fontSize: 21,
    fontWeight: "800",
    color: "#ffffff",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  categoryDesc: {
    fontSize: 12,
    color: "#cbd5e1",
    marginTop: 2,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  expandIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  subCatSection: {
    position: "relative",
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  subCatSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    zIndex: 2,
  },
  subCatHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: "#cbd5e1",
    letterSpacing: 0.8,
  },
  subCatCountLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
  },
  subCatScroll: {
    gap: 12,
    zIndex: 2,
  },
  subCatCard169: {
    width: 200,
    backgroundColor: "rgba(20, 15, 38, 0.6)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  subCatImageWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    position: "relative",
    backgroundColor: "rgba(19, 15, 36, 0.5)",
  },
  subCatImage169: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  subCatPillBadge: {
    position: "absolute",
    bottom: 6,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  subCatPillBadgeText: {
    color: "#2dd4bf",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  subCatCardInfo: {
    padding: 10,
  },
  subCatCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  subCatViewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  subCatViewText: {
    fontSize: 11,
    color: "#2dd4bf",
    fontWeight: "600",
  },
  emptySubCatState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "rgba(14, 10, 26, 0.4)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderStyle: "dashed",
    zIndex: 2,
  },
  grayscaleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptySubCatTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#e2e8f0",
    marginBottom: 3,
  },
  emptySubCatSubtitle: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center",
  },
});

export default Categories;