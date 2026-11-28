import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
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
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import axios from "axios";
import CachedImage from "./CachedImage";
import { ProfessionIcon } from "./ProfessionIcon";
import { StreakBadge } from "./StreakBadge";
import { api, LOCAL_API_BASE } from "../../lib/api";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const THEME = {
  bgMain: "#070B0D",
  bgSheet: "#0F161A",
  bgCard: "#141D22",
  border: "rgba(255, 255, 255, 0.08)",
  borderTeal: "rgba(0, 210, 180, 0.25)",
  tealPrimary: "#00D2B4",
  tealLight: "#5EEAD4",
  tealDeep: "#01796F",
  textPrimary: "#FFFFFF",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  amberAccent: "#F59E0B",
};

export interface PublicUserProfile {
  _id: string;
  name: string;
  userId: string;
  image?: string;
  bio?: string;
  profession?: string;
  visibility: "Public" | "Private";
  isPrivate: boolean;
  streak: number;
  isCompletedToday?: boolean;
  joinedSeries?: {
    _id: string;
    title: string;
    cover: string;
    type: "framework" | "normal";
    totalChapters: number;
    completedChapters: number;
  } | null;
}

// In-memory client-side cache (TTL: 10 minutes) for 0ms instant renders with zero DB hammering
const profileClientCache = new Map<string, { data: PublicUserProfile; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

type Props = {
  visible: boolean;
  onClose: () => void;
  userIdentifier?: string | null;
  initialUser?: {
    _id?: string;
    name?: string;
    userId?: string;
    handle?: string;
    image?: string;
    profession?: string;
    bio?: string;
    streak?: number;
    isCompletedToday?: boolean;
    visibility?: "Public" | "Private";
    isPrivate?: boolean;
  } | null;
};

export default function UserProfileSheet({
  visible,
  onClose,
  userIdentifier,
  initialUser,
}: Props) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Draggable animation values (Flutter/Native grade 60/120fps)
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const startY = useSharedValue(0);
  const isClosingRef = useRef(false);

  const safeFinishClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    onClose();
  }, [onClose]);

  const closeWithAnimation = useCallback(() => {
    if (isClosingRef.current) return;
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: 180 }, (finished) => {
      if (finished) runOnJS(safeFinishClose)();
    });
  }, [safeFinishClose, translateY]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withSpring(0, { damping: 80, stiffness: 320, mass: 0.9 });
    } else {
      translateY.value = SCREEN_HEIGHT;
    }
  }, [visible, translateY]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          startY.value = translateY.value;
        })
        .onUpdate((event) => {
          const nextY = startY.value + event.translationY;
          translateY.value = Math.max(0, nextY);
        })
        .onEnd((event) => {
          if (event.translationY > 85 || event.velocityY > 580) {
            translateY.value = withTiming(SCREEN_HEIGHT, { duration: 180 }, (finished) => {
              if (finished) runOnJS(safeFinishClose)();
            });
          } else {
            translateY.value = withSpring(0, { damping: 80, stiffness: 320, mass: 0.9 });
          }
        }),
    [safeFinishClose, startY, translateY]
  );

  const animatedBackdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.45],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Determine lookup key: prioritize 24-character ObjectId if available
  const idCandidate =
    initialUser?._id && /^[0-9a-fA-F]{24}$/.test(initialUser._id) ? initialUser._id : null;
  const rawKey =
    idCandidate ||
    userIdentifier ||
    initialUser?.userId ||
    initialUser?.handle ||
    initialUser?._id ||
    "";
  const lookupKey = rawKey.replace(/^@+/, "").trim();

  useEffect(() => {
    if (!visible || !lookupKey) {
      if (!visible) setProfile(null);
      return;
    }

    // 1. Instant RAM Cache hit (0ms paint)
    const cached =
      profileClientCache.get(lookupKey.toLowerCase()) ||
      profileClientCache.get(lookupKey);
    const isCacheFresh = cached && Date.now() - cached.timestamp < CACHE_TTL_MS;

    if (cached) {
      setProfile(cached.data);
      if (isCacheFresh) return; // Zero network call, zero DB hammering
    } else if (initialUser) {
      // Paint initial known data immediately with 0ms delay while background fetching
      const initIsPrivate = Boolean(
        initialUser.isPrivate || initialUser.visibility === "Private"
      );
      setProfile({
        _id: initialUser._id || "",
        name: initialUser.name || "Reader",
        userId: (initialUser.userId || initialUser.handle || "reader").replace(/^@+/, "").trim(),
        image: initialUser.image || "",
        bio: initialUser.bio || "",
        profession: initialUser.profession || "",
        visibility: initIsPrivate ? "Private" : "Public",
        isPrivate: initIsPrivate,
        streak: Number(initialUser.streak ?? 0),
        isCompletedToday: Boolean(initialUser.isCompletedToday),
        joinedSeries: null,
      });
    }

    // 2. Fetch fresh profile from server
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(!cached);

    (async () => {
      try {
        let res: any = null;
        try {
          res = await api.get(`/profile/${encodeURIComponent(lookupKey)}`, {
            signal: controller.signal,
            timeout: 6000,
          });
        } catch (apiErr: any) {
          if (apiErr?.name === "CanceledError" || apiErr?.message === "canceled") return;
          // In DEV, if remote server returns 404 or fails, fallback to local dev server
          if (__DEV__ && LOCAL_API_BASE) {
            try {
              res = await axios.get(
                `${LOCAL_API_BASE}/user/profile/${encodeURIComponent(lookupKey)}`,
                {
                  signal: controller.signal,
                  timeout: 5000,
                }
              );
            } catch (_) {}
          }
          if (!res) throw apiErr;
        }

        if (res?.data?.success && res?.data?.data) {
          const freshData: PublicUserProfile = res.data.data;
          setProfile(freshData);

          // Seed memory cache with all lookup keys for instant future opens
          const cacheEntry = { data: freshData, timestamp: Date.now() };
          profileClientCache.set(lookupKey, cacheEntry);
          profileClientCache.set(lookupKey.toLowerCase(), cacheEntry);
          if (freshData.userId) {
            profileClientCache.set(freshData.userId.toLowerCase(), cacheEntry);
          }
          if (freshData._id) {
            profileClientCache.set(freshData._id, cacheEntry);
          }
        }
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.message === "canceled") return;
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [visible, lookupKey, initialUser]);

  if (!visible) return null;

  const displayName = profile?.name || initialUser?.name || "Reader";
  const rawHandle = profile?.userId || initialUser?.userId || initialUser?.handle || "reader";
  const cleanHandle = rawHandle.replace(/^@+/, "").trim();

  // Multi-res resilient avatar: NEVER lose initial image if profile image is empty
  const displayImage =
    (profile?.image && profile.image.trim().length > 0)
      ? profile.image.trim()
      : (initialUser?.image && initialUser.image.trim().length > 0)
      ? initialUser.image.trim()
      : "";

  const displayProfession = profile?.profession || initialUser?.profession || "";
  const displayBio = profile?.bio || initialUser?.bio || "";
  const streakCount = profile?.streak ?? initialUser?.streak ?? 0;
  const isCompletedToday = Boolean(
    profile ? profile.isCompletedToday : initialUser?.isCompletedToday
  );
  const isPrivate = profile
    ? profile.isPrivate
    : Boolean(initialUser?.isPrivate || initialUser?.visibility === "Private");
  const joinedSeries = profile?.joinedSeries;

  const totalCh = joinedSeries?.totalChapters || 0;
  const compCh = joinedSeries?.completedChapters || 0;
  const progressPercent = totalCh > 0 ? Math.round((compCh / totalCh) * 100) : 0;
  const isFramework = joinedSeries?.type === "framework";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === "android"}
      onRequestClose={closeWithAnimation}
    >
      <GestureHandlerRootView style={styles.rootGestureContainer}>
        {/* Animated backdrop with fade */}
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeWithAnimation} />
        </Animated.View>

        {/* Draggable animated sheet */}
        <Animated.View
          style={[
            styles.sheetContainer,
            animatedSheetStyle,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
          ]}
        >
          {/* Pan Gesture Drag Handle (Header & Grabber) */}
          <GestureDetector gesture={panGesture}>
            <View style={styles.dragHandleArea}>
              <View style={styles.grabberWrap}>
                <View style={styles.grabber} />
              </View>

              {/* Close Button Row */}
              <View style={styles.topActionRow}>
                <TouchableOpacity
                  onPress={closeWithAnimation}
                  style={styles.closeBtn}
                  activeOpacity={0.75}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2.4} strokeLinecap="round">
                    <Path d="M18 6 6 18M6 6l12 12" />
                  </Svg>
                </TouchableOpacity>
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
            {/* Header: Avatar, Name, Handle + Small Streak Badge, Private Tag, Profession Chip */}
            <View style={styles.profileHeader}>
              <View style={styles.avatarWrap}>
                <CachedImage
                  key={displayImage || displayName}
                  uri={displayImage}
                  label={displayName}
                  style={styles.avatar}
                  letterSize={30}
                  transition={0}
                />
              </View>

              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>

              {/* Username + Streak Badge + Private Pill inline row */}
              <View style={styles.handleStreakRow}>
                <Text style={styles.handle} numberOfLines={1}>
                  @{cleanHandle}
                </Text>
                <StreakBadge
                  streak={streakCount}
                  isCompletedToday={isCompletedToday}
                  size="small"
                  onPress={() => {}}
                />
                {isPrivate ? (
                  <View style={styles.privateTag}>
                    <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </Svg>
                    <Text style={styles.privateTagText}>Private</Text>
                  </View>
                ) : null}
              </View>

              {displayProfession ? (
                <View style={styles.professionChip}>
                  <ProfessionIcon
                    type={displayProfession}
                    color={THEME.tealPrimary}
                    size={13}
                  />
                  <Text style={styles.professionText} numberOfLines={1}>
                    {displayProfession}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Bio (if present) */}
            {displayBio ? (
              <View style={styles.bioCard}>
                <Text style={styles.bioText}>{displayBio}</Text>
              </View>
            ) : null}

            {/* Loading Indicator for detailed data */}
            {loading && !profile ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={THEME.tealPrimary} />
              </View>
            ) : null}

            {/* Joined Series Learning Progress OR Private Lock Card */}
            {isPrivate ? (
              /* Private Profile Lock Banner */
              <View style={styles.privateCard}>
                <View style={styles.lockIconCircle}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </Svg>
                </View>
                <Text style={styles.privateTitle}>This profile is private</Text>
                <Text style={styles.privateSub}>
                  Learning progress and series details are kept private by the user.
                </Text>
              </View>
            ) : joinedSeries && totalCh > 0 ? (
              /* Public Mode: Joined Series Learning Progress */
              <View style={styles.seriesCard}>
                <View style={styles.seriesHeaderRow}>
                  <Text style={styles.seriesSectionLabel}>CURRENT LEARNING</Text>
                  <View
                    style={[
                      styles.seriesTypeBadge,
                      isFramework && styles.seriesTypeBadgeFramework,
                    ]}
                  >
                    <Text
                      style={[
                        styles.seriesTypeBadgeText,
                        isFramework && styles.seriesTypeBadgeTextFramework,
                      ]}
                    >
                      {isFramework ? "Framework" : "Series"}
                    </Text>
                  </View>
                </View>

                <View style={styles.seriesContentRow}>
                  {joinedSeries.cover ? (
                    <CachedImage
                      key={joinedSeries.cover}
                      uri={joinedSeries.cover}
                      label={joinedSeries.title}
                      style={styles.seriesCover}
                      letterSize={16}
                      transition={0}
                    />
                  ) : null}
                  <View style={styles.seriesMeta}>
                    <Text style={styles.seriesTitle} numberOfLines={2}>
                      {joinedSeries.title}
                    </Text>
                    <Text style={styles.seriesProgressText}>
                      {isFramework
                        ? `Level ${Math.min(compCh + 1, Math.max(1, totalCh))} of ${totalCh}`
                        : `${compCh} of ${totalCh} chapters completed`}
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.min(100, Math.max(0, progressPercent))}%` },
                      isFramework && styles.progressBarFillFramework,
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rootGestureContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  sheetContainer: {
    backgroundColor: THEME.bgSheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.09)",
    maxHeight: "82%",
    paddingTop: 4,
  },
  dragHandleArea: {
    width: "100%",
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabberWrap: {
    alignItems: "center",
    paddingVertical: 4,
  },
  grabber: {
    width: 42,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  topActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    marginTop: -8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 24,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  avatarWrap: {
    marginBottom: 10,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2.5,
    borderColor: THEME.tealPrimary,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  name: {
    color: THEME.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  handleStreakRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  handle: {
    color: THEME.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  privateTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  privateTagText: {
    color: "#F59E0B",
    fontSize: 11,
    fontWeight: "700",
  },
  professionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 210, 180, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(0, 210, 180, 0.28)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  professionText: {
    color: THEME.tealPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  bioCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  bioText: {
    color: "rgba(241, 245, 249, 0.9)",
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
  },
  loadingWrap: {
    paddingVertical: 12,
    alignItems: "center",
  },
  privateCard: {
    backgroundColor: "rgba(255, 255, 255, 0.025)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 12,
  },
  lockIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  privateTitle: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  privateSub: {
    color: THEME.textMuted,
    fontSize: 12.5,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  seriesCard: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  seriesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  seriesSectionLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  seriesTypeBadge: {
    backgroundColor: "rgba(0, 210, 180, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  seriesTypeBadgeFramework: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  seriesTypeBadgeText: {
    color: THEME.tealPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  seriesTypeBadgeTextFramework: {
    color: THEME.amberAccent,
  },
  seriesContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  seriesCover: {
    width: 44,
    height: 58,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  seriesMeta: {
    flex: 1,
  },
  seriesTitle: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 4,
  },
  seriesProgressText: {
    color: THEME.tealLight,
    fontSize: 12,
    fontWeight: "600",
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: THEME.tealPrimary,
    borderRadius: 3,
  },
  progressBarFillFramework: {
    backgroundColor: THEME.amberAccent,
  },
});
