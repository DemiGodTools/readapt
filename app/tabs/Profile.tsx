import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import pallete from "../../lib/Colors";
import useAuth from "../../hooks/useAuth";
import { useUser } from "../../hooks/useUser";
import { api } from "../../lib/api";
import { ISeries } from "../../types/Series";
import CachedImage from "../../components/props/CachedImage";
import ProfileSkeleton from "../../components/props/ProfileSkeleton";
import ProfileEditSheet from "../../components/props/ProfileEditSheet";
import UpgradeSheet from "../../components/props/UpgradeSheet";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { useToast } from "../../hooks/useToast";
import { getLevelTitle } from "../../lib/levels";
import { useStreak } from "../../hooks/useStreak";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { getRecentReadsKey } from "../../lib/userStorage";
import { useQuery } from "../../lib/queryCache";
import { copyText } from "../../lib/safeNative";
import {
  avatarUri,
  createAvatarVariants,
  ImageValidationError,
  uploadAvatarVariants,
  validateImageAsset,
} from "../../lib/imageUpload";

const { width } = Dimensions.get("window");
const PREVIEW_SIZE = Math.min(width * 0.82, 330);
const ACCENT = "#00D2B4";
const AMBER = "#f59e0b";
const DANGER = "#ef4444";

const LEVEL_COLORS: Record<string, string> = {
  Novice: "#4ade80",
  Scholar: "#38bdf8",
  Awakened: "#fbbf24",
  Strategist: "#a78bfa",
};

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";

type JoinedSeriesRef = string | { _id?: string; id?: string } | null | undefined;

const normalizeSeriesId = (raw: JoinedSeriesRef): string | null => {
  if (!raw) return null;
  const value = typeof raw === "string" ? raw : raw?._id || raw?.id;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[object Object]") return null;
  return trimmed;
};

const initialsCode = (input?: string) => {
  const clean = (input || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return clean.slice(0, 4).padEnd(2, "X");
};

/* -------------------------------------------------------------------------
 * Small pieces
 * ---------------------------------------------------------------------- */

const ChevronRight = ({ color = "rgba(255,255,255,0.55)", size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="9 18 15 12 9 6" />
  </Svg>
);

const CircularProgress = ({ progress }: { progress: number }) => {
  const size = 46;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={styles.progressRing}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.24)" strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ACCENT}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.progressRingCenter}>
        <Text style={styles.progressRingText}>{Math.round(clamped * 100)}%</Text>
      </View>
    </View>
  );
};

const ActionRow = ({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
    android_ripple={{ color: "rgba(255,255,255,0.06)" }}
  >
    <View style={styles.actionIcon}>{icon}</View>
    <Text style={styles.actionLabel}>{label}</Text>
    <ChevronRight />
  </Pressable>
);

/* -------------------------------------------------------------------------
 * Screen
 * ---------------------------------------------------------------------- */

const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { accessToken } = useAuth();
  const { user, reload, loadingUser, updateUser, logout } = useUser() as any;
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();
  const { streak } = useStreak();

  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [showStreakInfo, setShowStreakInfo] = useState(false);
  const [showLevelInfo, setShowLevelInfo] = useState(false);
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completeChapters, setCompleteChapters] = useState(0);

  const previewScale = useRef(new Animated.Value(0.35)).current;
  const previewOpacity = useRef(new Animated.Value(0)).current;
  // Seeded with "now" so the first focus does not duplicate the DataContext's
  // initial /get-self request on a cold start.
  const lastFocusRefresh = useRef(Date.now());

  const joinedSeriesId = useMemo(
    () => normalizeSeriesId(user?.joinedSeries as JoinedSeriesRef),
    [user?.joinedSeries]
  );

  /* ---------------- SWR: joined series + local progress ---------------- */
  const seriesQuery = useQuery<ISeries | null>(
    joinedSeriesId ? `series:${joinedSeriesId}` : null,
    async () => {
      if (!joinedSeriesId) return null;
      const res = await api.get(`/series/${joinedSeriesId}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        timeout: 10000,
      });
      return (res.data?.data?.data ?? res.data?.data ?? null) as ISeries | null;
    },
    {
      staleTime: 60_000,
      enabled: Boolean(joinedSeriesId && isConnected),
    }
  );

  const seriesData = seriesQuery.data ?? null;
  const totalChapters = useMemo(
    () => (seriesData?.chapters || []).filter((item: any) => item?.contentModel === "Chapter" || item?.content).length,
    [seriesData?.chapters]
  );
  const progressPercent = totalChapters > 0 ? Math.min(100, Math.round((completeChapters / totalChapters) * 100)) : 0;

  useEffect(() => {
    let alive = true;
    const userId = user?._id || user?.userId;
    if (!seriesData?.chapters?.length || !userId) {
      setCompleteChapters(0);
      return () => {
        alive = false;
      };
    }

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(getRecentReadsKey(userId));
        const reads = raw ? JSON.parse(raw) : [];
        const chapterIds = new Set(
          (seriesData.chapters || [])
            .map((item: any) => item?.content?._id)
            .filter(Boolean)
        );
        const readIds = new Set(
          (Array.isArray(reads) ? reads : [])
            .map((entry: any) => entry?.content?._id || entry?._id)
            .filter((id: string) => id && chapterIds.has(id))
        );
        if (alive) setCompleteChapters(readIds.size);
      } catch {
        if (alive) setCompleteChapters(0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [seriesData?.chapters, user?._id, user?.userId]);

  /* ---------------- Focus / foreground revalidation ---------------- */
  const refreshSeries = seriesQuery.refresh;
  const revalidate = useCallback(() => {
    lastFocusRefresh.current = Date.now();
    Promise.resolve(refreshSeries?.()).catch(() => {});
    Promise.resolve(reload?.()).catch(() => {});
  }, [reload, refreshSeries]);

  useFocusEffect(
    useCallback(() => {
      // SWR: only hit the network if what we show is more than 30s old.
      if (Date.now() - lastFocusRefresh.current > 30_000) revalidate();
    }, [revalidate])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastFocusRefresh.current > 60_000) revalidate();
    });
    return () => sub.remove();
  }, [revalidate]);

  const onRefresh = useCallback(async () => {
    if (!isConnected) {
      showToast({ title: "You're offline. Showing saved data." });
      return;
    }
    setRefreshing(true);
    try {
      await Promise.allSettled([reload?.(), refreshSeries?.()]);
    } finally {
      setRefreshing(false);
      lastFocusRefresh.current = Date.now();
    }
  }, [isConnected, reload, refreshSeries, showToast]);

  /* ---------------- Avatar ---------------- */
  const avatarSource = avatarOverride || avatarUri(user, "md");

  const openAvatarPreview = () => {
    Vibration.vibrate(20);
    setAvatarPreviewVisible(true);
    previewScale.setValue(0.35);
    previewOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(previewScale, { toValue: 1, friction: 6.5, tension: 115, useNativeDriver: true }),
      Animated.timing(previewOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const closeAvatarPreview = () => {
    Animated.parallel([
      Animated.timing(previewScale, { toValue: 0.35, duration: 180, useNativeDriver: true }),
      Animated.timing(previewOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setAvatarPreviewVisible(false));
  };

  const changePhoto = useCallback(async () => {
    setPhotoMenuVisible(false);
    if (uploadingPhoto) return;

    if (!isConnected) {
      showToast({ title: "Please connect to the Internet to change your photo." });
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain) {
          Alert.alert(
            "Photo permission needed",
            "Readapt needs access to your photos to update your profile picture.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Open settings", onPress: () => Linking.openSettings().catch(() => {}) },
            ]
          );
        } else {
          showToast({ title: "Photo library permission is required." });
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images" as any],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        exif: false,
        selectionLimit: 1,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // Local validation is metadata-only, so an oversized file is rejected
      // before we decode a single pixel.
      await validateImageAsset(asset);

      setUploadingPhoto(true);
      setUploadProgress(0.05);
      setAvatarOverride(asset.uri);

      const { variants, previewUri, base64Fallback } = await createAvatarVariants(asset);
      setAvatarOverride(previewUri);
      setUploadProgress(0.35);

      const uploaded = await uploadAvatarVariants(variants, {
        base64Fallback,
        onProgress: (ratio) => setUploadProgress(0.35 + ratio * 0.6),
        timeoutMs: 30000,
      });

      setUploadProgress(1);

      if (uploaded.user) {
        updateUser?.(uploaded.user);
      } else if (uploaded.urls) {
        updateUser?.(uploaded.urls as any);
      } else {
        updateUser?.({ image: previewUri } as any);
      }

      Vibration.vibrate(35);
      showToast({ title: "Profile photo updated" });
      setTimeout(() => setAvatarOverride(null), 500);
    } catch (error: any) {
      setAvatarOverride(null);
      if (error instanceof ImageValidationError) {
        showToast({ title: error.message });
      } else if (error?.response?.status === 401) {
        showToast({ title: "Your session expired. Please log in again." });
      } else {
        showToast({
          title:
            error?.response?.data?.message ||
            error?.message ||
            "Could not update your photo. Please try again.",
        });
      }
    } finally {
      setUploadingPhoto(false);
      setUploadProgress(0);
    }
  }, [isConnected, showToast, updateUser, uploadingPhoto]);

  /* ---------------- Derived profile bits ---------------- */
  const levelName = user?.profileLevel ? getLevelTitle(user.profileLevel) : "Novice";
  const levelColor = LEVEL_COLORS[levelName] || LEVEL_COLORS.Novice;
  const referralCode = useMemo(
    () => `READAPT${initialsCode(user?.userId || user?.name)}`,
    [user?.userId, user?.name]
  );

  const copyReferral = useCallback(async () => {
    if (await copyText(referralCode)) {
      Vibration.vibrate(18);
      showToast({ title: "Referral code copied" });
      return;
    }
    // Builds without the clipboard module get the share sheet instead of an
    // error, so the code still reaches the user.
    try {
      await Share.share({ message: referralCode });
    } catch {
      showToast({ title: "Couldn't copy the code" });
    }
  }, [referralCode, showToast]);

  const shareReferral = useCallback(async () => {
    try {
      await Share.share({
        message: `I'm reading on Readapt. Join me with my code ${referralCode} — https://play.google.com/store/apps`,
      });
    } catch {}
  }, [referralCode]);

  const handleLogout = async () => {
    setShowLogoutSheet(false);
    try {
      if (logout) await logout();
    } catch {}
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const openSeries = () => {
    if (joinedSeriesId) navigation.navigate("SeriesOverview", { seriesId: joinedSeriesId });
    else navigation.navigate("AllSeries");
  };

  /* ---------------- Render states ---------------- */
  if (!user) {
    if (loadingUser || !isConnected) {
      return (
        <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <ProfileSkeleton />
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>We couldn't load your profile</Text>
          <Text style={styles.errorText}>
            Check your connection and try again. Your saved data is safe.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
            onPress={() => {
              reload?.().catch(() => {});
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isBusy = uploadingPhoto;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ACCENT}
            colors={[ACCENT]}
            progressBackgroundColor="#12101c"
          />
        }
      >
        {/* Identity */}
        <View style={styles.identityRow}>
          <View style={styles.avatarBlock}>
            <Pressable
              onPress={() => setPhotoMenuVisible(true)}
              onLongPress={openAvatarPreview}
              delayLongPress={350}
              disabled={isBusy}
              style={({ pressed }) => [styles.avatarPress, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.avatarRing}>
                <CachedImage
                  uri={avatarSource}
                  label={user?.name}
                  style={styles.avatarImage}
                  letterSize={40}
                  transition={0}
                  priority="high"
                />
                {isBusy ? (
                  <View style={styles.avatarBusy}>
                    <CircularProgress progress={uploadProgress} />
                  </View>
                ) : null}
              </View>
            </Pressable>

            <Pressable
              onPress={() => setShowLevelInfo(true)}
              style={[styles.levelPill, { borderColor: levelColor }]}
              hitSlop={6}
            >
              <Svg width={13} height={13} viewBox="0 0 24 24" fill={levelColor}>
                <Path d="M12 2l2.4 6.1L21 9.3l-4.8 4.2 1.4 6.5L12 16.7 6.4 20l1.4-6.5L3 9.3l6.6-1.2z" />
              </Svg>
              <Text style={[styles.levelPillText, { color: levelColor }]}>{levelName}</Text>
            </Pressable>

            {!isBusy ? (
              <Pressable style={styles.cameraChip} onPress={() => setPhotoMenuVisible(true)} hitSlop={10}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#03110f" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <Circle cx="12" cy="13" r="4" />
                </Svg>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              <Pressable onPress={() => setEditVisible(true)} style={{ flex: 1 }} hitSlop={6}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user?.name || "Readapt User"}
                </Text>
                <Text style={styles.userHandle} numberOfLines={1}>
                  @{user?.userId || "readapt_user"}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
                onPress={() => navigation.navigate("Settings")}
                hitSlop={8}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="12" cy="12" r="3" />
                  <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.4.66.74.86.34.2.72.3 1.11.3H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </Svg>
              </Pressable>
            </View>

            <View style={styles.badgesRow}>
              {user?.profession ? (
                <View style={styles.metaPill}>
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M22 10 12 5 2 10l10 5 10-5z" />
                    <Path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
                  </Svg>
                  <Text style={styles.metaPillText}>{user.profession}</Text>
                </View>
              ) : null}
              {user?.profession && user?.visibility ? <View style={styles.badgeDivider} /> : null}
              <View style={styles.metaPill}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="12" cy="12" r="9" />
                  <Path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
                </Svg>
                <Text style={styles.metaPillText}>{user.visibility === "Private" ? "Private" : "Public"}</Text>
              </View>
            </View>
          </View>
        </View>

        {!isConnected ? (
          <Pressable style={styles.offlineBar} onPress={onRefresh}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>Offline — showing your saved profile</Text>
            <Text style={styles.offlineAction}>Retry</Text>
          </Pressable>
        ) : null}

        {/* Bio */}
        <Pressable onPress={() => setEditVisible(true)} style={styles.bioWrap}>
          {user?.bio ? (
            <Text style={styles.bioText}>{user.bio}</Text>
          ) : (
            <Text style={styles.bioPlaceholder}>Add a short bio so readers know you →</Text>
          )}
          {Array.isArray(user?.interests) && user.interests.length > 0 ? (
            <View style={styles.interestsWrap}>
              {user.interests.slice(0, 6).map((topic: string) => (
                <View key={topic} style={styles.interestChip}>
                  <Text style={styles.interestChipText}>{topic}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>

        {/* Learning journey */}
        <Pressable
          onPress={openSeries}
          style={({ pressed }) => [styles.journeyCard, pressed && styles.cardPressed]}
        >
          <View style={styles.journeyTop}>
            <View style={styles.journeyIcon}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill={ACCENT}>
                <Path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 19.5c0-3 3.1-5 7-5s7 2 7 5V21H2v-1.5zM16.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 20v1h-4.6v-1.5c0-1.7-.7-3.2-1.9-4.3.6-.1 1.2-.2 1.9-.2 3.2 0 5.6 1.7 5.6 4.5V20z" />
              </Svg>
            </View>
            <View style={styles.journeyBody}>
              <Text style={styles.cardTitle}>
                {joinedSeriesId ? "Your Learning Journey" : "Start your learning journey"}
              </Text>
              {joinedSeriesId && seriesQuery.isLoading && !seriesData ? (
                <View style={styles.inlineSkeletonRow}>
                  <View style={styles.inlineSkeletonBar} />
                </View>
              ) : joinedSeriesId && seriesData ? (
                <Text style={styles.cardMeta}>
                  Chapter {Math.max(1, completeChapters)} •{" "}
                  <Text style={styles.cardMetaAccent}>{progressPercent}% Complete</Text>
                </Text>
              ) : joinedSeriesId ? (
                <Text style={styles.cardMeta}>Tap to open your series</Text>
              ) : (
                <Text style={styles.cardMeta}>Join a series to track your progress</Text>
              )}

              {joinedSeriesId && seriesData ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progressPercent}%` as `${number}%` },
                    ]}
                  />
                </View>
              ) : null}
            </View>
            <ChevronRight color="rgba(255,255,255,0.75)" />
          </View>
          {seriesData?.title ? <Text style={styles.journeySeries} numberOfLines={1}>{seriesData.title}</Text> : null}
        </Pressable>

        {/* Streak */}
        <Pressable
          onPress={() => navigation.navigate("DailyRewards")}
          onLongPress={() => setShowStreakInfo(true)}
          delayLongPress={400}
          style={({ pressed }) => [styles.streakCard, pressed && styles.cardPressed]}
        >
          <View style={styles.streakIconWrap}>
            <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={1.8} strokeLinejoin="round">
              <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </Svg>
          </View>
          <View style={styles.streakBody}>
            <Text style={styles.streakLabel}>CURRENT STREAK</Text>
            <View style={styles.streakNumbers}>
              <Text style={styles.streakNumber}>{streak}</Text>
              <Text style={styles.streakDays}>Days</Text>
            </View>
          </View>
          <ChevronRight color="rgba(255,255,255,0.75)" />
        </Pressable>

        {/* Refer & Earn */}
        <View style={styles.referCard}>
          <View style={styles.referTop}>
            <View style={styles.referIcon}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill={ACCENT}>
                <Path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 19.5c0-3 3.1-5 7-5s7 2 7 5V21H2v-1.5zM18.5 9h-1V7.5h-2V9h-1.5v2H15.5v1.5h2V11h1v-2z" />
              </Svg>
            </View>
            <View style={styles.referBody}>
              <Text style={styles.cardTitle}>Refer &amp; Earn</Text>
              <Text style={styles.cardMeta}>Share your code with friends and earn rewards.</Text>
            </View>
            <Pressable
              onPress={copyReferral}
              style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.75 }]}
              hitSlop={6}
            >
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#04211d" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Rect x="9" y="9" width="12" height="12" rx="2.5" />
                <Path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </Svg>
              <Text style={styles.copyText}>Copy</Text>
            </Pressable>
          </View>

          <Pressable onPress={copyReferral} style={styles.referCodeBox}>
            <Text style={styles.referCodeLabel}>YOUR REFERRAL CODE</Text>
            <Text style={styles.referCode} selectable>
              {referralCode}
            </Text>
          </Pressable>
        </View>

        {/* Rows */}
        <View style={styles.actionsWrap}>
          <ActionRow
            icon={
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={ACCENT}>
                <Rect x="3" y="12" width="4" height="9" rx="1.2" />
                <Rect x="10" y="8" width="4" height="13" rx="1.2" />
                <Rect x="17" y="4" width="4" height="17" rx="1.2" />
              </Svg>
            }
            label="My Activity"
            onPress={() => navigation.navigate("RecentReads")}
          />
          <ActionRow
            icon={
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={ACCENT}>
                <Path d="M3 9h18v3H3zM5 12h14v9H5zM12 9v12M12 9c-2.8 0-4.5-1.3-4.5-3S9.2 3 12 6c2.8-3 4.5-1.3 4.5 0S14.8 9 12 9z" />
              </Svg>
            }
            label="Refer & Win"
            onPress={shareReferral}
          />
        </View>

        {/* Log out */}
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
          onPress={() => setShowLogoutSheet(true)}
        >
          <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={DANGER} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4" />
            <Polyline points="16 17 21 12 16 7" />
            <Line x1="21" y1="12" x2="9" y2="12" />
          </Svg>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>

        <Text style={styles.footer}>© 2026 Readapt • Version {APP_VERSION}</Text>
      </ScrollView>

      {/* Photo preview */}
      <Modal
        visible={avatarPreviewVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeAvatarPreview}
      >
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={closeAvatarPreview}>
          <Animated.View style={[styles.previewWrap, { transform: [{ scale: previewScale }], opacity: previewOpacity }]}>
            <CachedImage uri={avatarUri(user, "lg")} label={user?.name} style={styles.previewImage} letterSize={90} />
          </Animated.View>
          <Text style={styles.previewHint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      {/* Photo actions */}
      <UpgradeSheet visible={photoMenuVisible} onClose={() => setPhotoMenuVisible(false)} title="Profile photo">
        <View style={styles.sheetBody}>
          <TouchableOpacity style={styles.sheetPrimary} activeOpacity={0.85} onPress={changePhoto}>
            <Text style={styles.sheetPrimaryText}>Change photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetSecondary}
            activeOpacity={0.85}
            onPress={() => {
              setPhotoMenuVisible(false);
              openAvatarPreview();
            }}
          >
            <Text style={styles.sheetSecondaryText}>View photo</Text>
          </TouchableOpacity>
          <Text style={styles.sheetHint}>JPG, PNG, WebP or HEIC · max 10 MB</Text>
        </View>
      </UpgradeSheet>

      {/* Streak help */}
      <UpgradeSheet visible={showStreakInfo} onClose={() => setShowStreakInfo(false)} title="How Streak Works?">
        <View style={styles.infoSheetBody}>
          <Text style={styles.panelDescription}>
            <Text style={{ fontWeight: "700" }}>Read or listen</Text> to a chapter{" "}
            <Text style={{ fontWeight: "700" }}>every day</Text> and keep your{" "}
            <Text style={{ fontWeight: "700" }}>streak</Text> going! Keep learning for{" "}
            <Text style={{ fontWeight: "700" }}>7, 14, and 21 days</Text> in a row and unlock rewards at
            every milestone.
          </Text>
        </View>
      </UpgradeSheet>

      {/* Level help */}
      <UpgradeSheet visible={showLevelInfo} onClose={() => setShowLevelInfo(false)} title="How Levels Work?">
        <View style={styles.infoSheetBody}>
          <Text style={styles.panelDescription}>
            Your intelligence is your greatest weapon.{"\n\n"}
            <Text style={{ color: AMBER, fontWeight: "700" }}>• The Rule of Three:</Text> answer{" "}
            <Text style={{ fontStyle: "italic" }}>3 questions correctly in a row</Text> to level up.
            {"\n\n"}
            <Text style={{ color: AMBER, fontWeight: "700" }}>• High Stakes:</Text> a single incorrect
            answer triggers an immediate level down.
          </Text>
        </View>
      </UpgradeSheet>

      {/* Logout confirm */}
      <UpgradeSheet visible={showLogoutSheet} onClose={() => setShowLogoutSheet(false)} title="Are you sure you want to log out?">
        <View style={styles.sheetBody}>
          <View style={styles.sheetRow}>
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetCancel]} activeOpacity={0.85} onPress={() => setShowLogoutSheet(false)}>
              <Text style={styles.sheetBtnText}>Stay</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetDanger]} activeOpacity={0.85} onPress={handleLogout}>
              <Text style={styles.sheetBtnText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </UpgradeSheet>

      {/* Edit profile */}
      <ProfileEditSheet
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        onChangePhoto={changePhoto}
        isUploadingPhoto={uploadingPhoto}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  centered: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  scrollContent: { paddingBottom: 36 },

  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  avatarBlock: { width: 112, height: 118, alignItems: "center", justifyContent: "flex-start" },
  avatarPress: { borderRadius: 60 },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2.5,
    borderColor: ACCENT,
    padding: 2,
    backgroundColor: "#071512",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
    marginTop: 2,
  },
  avatarImage: { width: "100%", height: "100%", borderRadius: 50 },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRing: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  progressRingCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  progressRingText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    position: "absolute",
    bottom: 2,
    left: -4,
    backgroundColor: "#0a0a0c",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  cameraChip: {
    position: "absolute",
    right: 2,
    top: 74,
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#050505",
  },

  identityText: { flex: 1, marginLeft: 14 },
  nameRow: { flexDirection: "row", alignItems: "flex-start" },
  userName: { color: "#fff", fontSize: 23, fontWeight: "800", letterSpacing: -0.4 },
  userHandle: { color: "rgba(148,163,184,0.85)", fontSize: 14, fontWeight: "500", marginTop: 3 },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  badgesRow: { flexDirection: "row", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,210,180,0.10)",
    borderWidth: 1,
    borderColor: "rgba(0,210,180,0.28)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaPillText: { color: "#7de9d8", fontSize: 11.5, fontWeight: "700" },
  badgeDivider: { width: 1, height: 16, backgroundColor: "rgba(255,255,255,0.16)" },

  offlineBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.28)",
  },
  offlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: AMBER, marginRight: 8 },
  offlineText: { flex: 1, color: "#fcd34d", fontSize: 12, fontWeight: "600" },
  offlineAction: { color: AMBER, fontSize: 12, fontWeight: "800" },

  bioWrap: { paddingHorizontal: 20, marginTop: 18, marginBottom: 18 },
  bioText: { color: "rgba(226,232,240,0.92)", fontSize: 15, lineHeight: 23, fontStyle: "italic" },
  bioPlaceholder: { color: "rgba(148,163,184,0.55)", fontSize: 14, fontStyle: "italic" },
  interestsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  interestChip: {
    backgroundColor: "rgba(56,189,248,0.10)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.24)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  interestChipText: { color: "#7dd3fc", fontSize: 11.5, fontWeight: "600" },

  journeyCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(0,210,180,0.055)",
    borderWidth: 1,
    borderColor: "rgba(0,210,180,0.28)",
  },
  journeyTop: { flexDirection: "row", alignItems: "center" },
  journeyIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(0,210,180,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  journeyBody: { flex: 1, marginRight: 8 },
  journeySeries: { color: "rgba(148,163,184,0.65)", fontSize: 11, marginTop: 10, fontStyle: "italic" },
  inlineSkeletonRow: { height: 13, marginTop: 9, justifyContent: "center" },
  inlineSkeletonBar: { width: "55%", height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.07)" },

  cardTitle: { color: "#fff", fontSize: 15.5, fontWeight: "700", letterSpacing: -0.2 },
  cardMeta: { color: "rgba(203,213,225,0.75)", fontSize: 12.5, marginTop: 5, fontWeight: "500" },
  cardMetaAccent: { color: ACCENT, fontWeight: "800" },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginTop: 11,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: ACCENT },

  streakCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(120,63,4,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.45)",
  },
  streakIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.12)",
    marginRight: 14,
  },
  streakBody: { flex: 1 },
  streakLabel: { color: AMBER, fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2 },
  streakNumbers: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 },
  streakNumber: { color: "#fff", fontSize: 38, fontWeight: "800", letterSpacing: -1 },
  streakDays: { color: "rgba(203,213,225,0.75)", fontSize: 20, fontWeight: "700" },

  referCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(0,210,180,0.045)",
    borderWidth: 1,
    borderColor: "rgba(0,210,180,0.30)",
  },
  referTop: { flexDirection: "row", alignItems: "center" },
  referIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(0,210,180,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  referBody: { flex: 1, marginRight: 8 },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  copyText: { color: "#04211d", fontSize: 12, fontWeight: "800" },
  referCodeBox: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0,210,180,0.09)",
    borderWidth: 1,
    borderColor: "rgba(0,210,180,0.18)",
    paddingVertical: 10,
    alignItems: "center",
  },
  referCodeLabel: { color: "rgba(148,163,184,0.85)", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.4 },
  referCode: { color: "#fff", fontSize: 21, fontWeight: "800", letterSpacing: 1.6, marginTop: 4 },

  actionsWrap: { marginHorizontal: 20, marginTop: 4, gap: 12 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 62,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  actionRowPressed: { backgroundColor: "rgba(255,255,255,0.075)" },
  actionIcon: { width: 26, alignItems: "flex-start" },
  actionLabel: { flex: 1, color: "#f1f5f9", fontSize: 15.5, fontWeight: "600", marginLeft: 10 },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 20,
    marginTop: 22,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: "rgba(120,20,20,0.35)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.55)",
  },
  logoutText: { color: "#f87171", fontSize: 15.5, fontWeight: "700" },
  footer: { color: "rgba(148,163,184,0.55)", fontSize: 11, textAlign: "center", marginTop: 18, fontWeight: "500" },

  cardPressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },

  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  previewWrap: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: PREVIEW_SIZE / 2,
    borderWidth: 3,
    borderColor: ACCENT,
    overflow: "hidden",
    backgroundColor: "#0d0d12",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 26,
    elevation: 24,
  },
  previewImage: { width: "100%", height: "100%", borderRadius: PREVIEW_SIZE / 2 },
  previewHint: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "500", marginTop: 22 },

  sheetBody: { paddingHorizontal: 20, paddingTop: 6 },
  sheetPrimary: {
    backgroundColor: ACCENT,
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  sheetPrimaryText: { color: "#04211d", fontSize: 15, fontWeight: "800" },
  sheetSecondary: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  sheetSecondaryText: { color: "#e2e8f0", fontSize: 15, fontWeight: "700" },
  sheetHint: { color: "rgba(148,163,184,0.65)", fontSize: 11.5, textAlign: "center", marginTop: 12 },
  sheetRow: { flexDirection: "row", gap: 14, marginTop: 16, paddingHorizontal: 4 },
  sheetBtn: { flex: 1, paddingVertical: 14, borderRadius: 13, alignItems: "center" },
  sheetCancel: { backgroundColor: "rgba(255,255,255,0.08)" },
  sheetDanger: { backgroundColor: DANGER },
  sheetBtnText: { color: "#fff", fontSize: 14.5, fontWeight: "700" },

  infoSheetBody: { paddingHorizontal: 24, paddingTop: 8 },
  panelDescription: { fontSize: 14, lineHeight: 22, color: "#d1d5db", textAlign: "center" },

  errorCard: {
    width: "100%",
    backgroundColor: pallete.bgcard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 22,
    alignItems: "center",
  },
  errorTitle: { color: "#fff", fontSize: 17, fontWeight: "800", textAlign: "center" },
  errorText: { color: "rgba(148,163,184,0.85)", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8 },
  retryBtn: {
    marginTop: 18,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 26,
    paddingVertical: 11,
  },
  retryText: { color: "#04211d", fontSize: 14, fontWeight: "800" },
});

export default ProfileScreen;
