import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Dimensions,
  Easing,
  Image,
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
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Polyline,
  Rect,
  Stop,
} from "react-native-svg";
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
import EarlyBadgeUnlockModal from "../../components/props/EarlyBadgeUnlockModal";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { useToast } from "../../hooks/useToast";
import { getLevelTitle } from "../../lib/levels";
import { useStreak } from "../../hooks/useStreak";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { getRecentReadsKey, getRecentReads } from "../../lib/userStorage";
import { useQuery } from "../../lib/queryCache";
import { copyText } from "../../lib/safeNative";
import { getReferralShareMessage } from "../../lib/referral";
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

const InfoQuestionIcon = ({ onPress, size = 15, color = "rgba(255,255,255,0.6)" }: { onPress: () => void; size?: number; color?: string }) => (
  <Pressable onPress={onPress} hitSlop={10} style={{ padding: 2, justifyContent: "center", alignItems: "center" }}>
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <Line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
  </Pressable>
);

const GiftBoxIcon = ({ size = 24, color = ACCENT }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="20 12 20 22 4 22 4 12" />
    <Rect x="2" y="7" width="20" height="5" rx="1" />
    <Line x1="12" y1="22" x2="12" y2="7" />
    <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </Svg>
);

const EarlyBadgeWithGlow = ({ onPress }: { onPress: () => void }) => {
  const spark1Anim = useRef(new Animated.Value(0)).current;
  const spark2Anim = useRef(new Animated.Value(0)).current;
  const spark3Anim = useRef(new Animated.Value(0)).current;
  const spark4Anim = useRef(new Animated.Value(0)).current;
  const spark5Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createSparkLoop = (anim: Animated.Value, duration: number, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const s1 = createSparkLoop(spark1Anim, 2400, 0);
    const s2 = createSparkLoop(spark2Anim, 2600, 500);
    const s3 = createSparkLoop(spark3Anim, 2300, 1100);
    const s4 = createSparkLoop(spark4Anim, 2500, 1600);
    const s5 = createSparkLoop(spark5Anim, 2700, 800);

    s1.start();
    s2.start();
    s3.start();
    s4.start();
    s5.start();

    return () => {
      s1.stop();
      s2.stop();
      s3.stop();
      s4.stop();
      s5.stop();
    };
  }, [spark1Anim, spark2Anim, spark3Anim, spark4Anim, spark5Anim]);

  return (
    <Pressable onPress={onPress} style={styles.badgeContainer} hitSlop={8}>
      {/* Spark 1 - drifting bottom left */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.goldenSpark,
          {
            left: 8,
            bottom: 3,
            width: 3.5,
            height: 3.5,
            opacity: spark1Anim.interpolate({
              inputRange: [0, 0.3, 0.8, 1],
              outputRange: [0, 0.9, 0.7, 0],
            }),
            transform: [
              {
                translateY: spark1Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-1, 12],
                }),
              },
              {
                translateX: spark1Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -8],
                }),
              },
              {
                scale: spark1Anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.5, 1.25, 0.3],
                }),
              },
            ],
          },
        ]}
      />

      {/* Spark 2 - drifting top right */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.goldenSpark,
          {
            right: 10,
            top: 2,
            width: 3,
            height: 3,
            opacity: spark2Anim.interpolate({
              inputRange: [0, 0.3, 0.75, 1],
              outputRange: [0, 0.85, 0.6, 0],
            }),
            transform: [
              {
                translateY: spark2Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, -11],
                }),
              },
              {
                translateX: spark2Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 7],
                }),
              },
              {
                scale: spark2Anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.6, 1.15, 0.3],
                }),
              },
            ],
          },
        ]}
      />

      {/* Spark 3 - drifting bottom center-right */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.goldenSpark,
          {
            right: 22,
            bottom: 1,
            width: 4,
            height: 4,
            opacity: spark3Anim.interpolate({
              inputRange: [0, 0.35, 0.8, 1],
              outputRange: [0, 0.8, 0.5, 0],
            }),
            transform: [
              {
                translateY: spark3Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 11],
                }),
              },
              {
                translateX: spark3Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 5],
                }),
              },
              {
                scale: spark3Anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.4, 1.3, 0.3],
                }),
              },
            ],
          },
        ]}
      />

      {/* Spark 4 - drifting top left */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.goldenSpark,
          {
            left: 18,
            top: 1,
            width: 3,
            height: 3,
            opacity: spark4Anim.interpolate({
              inputRange: [0, 0.3, 0.75, 1],
              outputRange: [0, 0.85, 0.55, 0],
            }),
            transform: [
              {
                translateY: spark4Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -10],
                }),
              },
              {
                translateX: spark4Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -6],
                }),
              },
              {
                scale: spark4Anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.5, 1.1, 0.4],
                }),
              },
            ],
          },
        ]}
      />

      {/* Spark 5 - drifting middle right */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.goldenSpark,
          {
            right: 4,
            top: 10,
            width: 2.8,
            height: 2.8,
            opacity: spark5Anim.interpolate({
              inputRange: [0, 0.4, 0.8, 1],
              outputRange: [0, 0.8, 0.6, 0],
            }),
            transform: [
              {
                translateY: spark5Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-2, 8],
                }),
              },
              {
                translateX: spark5Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 6],
                }),
              },
              {
                scale: spark5Anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.4, 1.2, 0.3],
                }),
              },
            ],
          },
        ]}
      />

      {/* Early badge image - change dimensions in styles.earlyBadgeImage */}
      <Image
        source={require("../../assets/earlybadge.png")}
        style={styles.earlyBadgeImage}
      />
    </Pressable>
  );
};

const AnimatedCircleCopyButton = ({
  copied,
  onPress,
}: {
  copied: boolean;
  onPress: () => void;
}) => {
  const anim = useRef(new Animated.Value(copied ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: copied ? 1 : 0,
      tension: 180,
      friction: 12,
      useNativeDriver: false,
    }).start();
  }, [copied, anim]);

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(45, 212, 191, 0.12)", "#16a34a"],
  });

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(45, 212, 191, 0.32)", "#16a34a"],
  });

  const copyScale = anim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 0.4, 0],
  });

  const copiedScale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 1],
  });

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={styles.circleActionPressable}
      accessibilityLabel={copied ? "Referral code copied" : "Copy referral code"}
    >
      <Animated.View style={[styles.circleActionBtn, { backgroundColor, borderColor }]}>
        {/* Copy Icon */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.circleIconWrap,
            {
              opacity: anim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0, 0] }),
              transform: [{ scale: copyScale }],
            },
          ]}
        >
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Rect x="9" y="9" width="12" height="12" rx="2.5" />
            <Path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </Svg>
        </Animated.View>

        {/* Checkmark Icon */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.circleIconWrap,
            styles.circleIconWrapAbsolute,
            {
              opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
              transform: [{ scale: copiedScale }],
            },
          ]}
        >
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
            <Polyline points="20 6 9 17 4 12" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

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

const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { accessToken } = useAuth();
  const { user, reload, loadingUser, updateUser, logout } = useUser() as any;
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();
  const { streak, refreshStreak } = useStreak();

  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [showStreakInfo, setShowStreakInfo] = useState(false);
  const [showLevelInfo, setShowLevelInfo] = useState(false);
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);
  const [showReferInfo, setShowReferInfo] = useState(false);
  const [showEarlyBadgeInfo, setShowEarlyBadgeInfo] = useState(false);
  const [showEarlyUnlockModal, setShowEarlyUnlockModal] = useState(false);
  const [claimingEarlyBadge, setClaimingEarlyBadge] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completeChapters, setCompleteChapters] = useState(0);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Early badge unlock celebration trigger (unlocks in v2 / when badge is live)
  useEffect(() => {
    if (
      user?.isEarlyReader &&
      !user?.hasClaimedEarlyBadge &&
      (user?.isEarlyBadgeLive || APP_VERSION !== "1.0.0")
    ) {
      setShowEarlyUnlockModal(true);
    }
  }, [user?.isEarlyReader, user?.hasClaimedEarlyBadge, user?.isEarlyBadgeLive]);

  const handleClaimEarlyBadge = async () => {
    setClaimingEarlyBadge(true);
    try {
      await api.post("/badge/claim-early");
      if (updateUser) {
        updateUser({ hasClaimedEarlyBadge: true } as any);
      }
      setShowEarlyUnlockModal(false);
      showToast({ title: "Early Reader Badge Unlocked!" });
    } catch {
      if (updateUser) {
        updateUser({ hasClaimedEarlyBadge: true } as any);
      }
      setShowEarlyUnlockModal(false);
    } finally {
      setClaimingEarlyBadge(false);
    }
  };

  const previewScale = useRef(new Animated.Value(0.35)).current;
  const previewOpacity = useRef(new Animated.Value(0)).current;
  // Initialize to 0 so the first focus revalidates and ensures profile freshness
  const lastFocusRefresh = useRef(0);

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
        let reads: any[] = [];
        const raw = await AsyncStorage.getItem(getRecentReadsKey(userId));
        if (raw) {
          reads = JSON.parse(raw);
        } else if (Array.isArray(user?.recentReads) && user.recentReads.length > 0) {
          reads = user.recentReads.map((r: any) => ({
            content: r.chapter || r.content,
            readtill: String(r.readtill || "1"),
            total: String(r.total || "1"),
          }));
        } else {
          reads = await getRecentReads(userId);
        }

        const chapterIds = new Set(
          (seriesData.chapters || [])
            .map((item: any) => item?.content?._id || item?.content || item?._id)
            .filter(Boolean)
        );
        const readIds = new Set(
          (Array.isArray(reads) ? reads : [])
            .map((entry: any) => entry?.content?._id || entry?._id || entry?.content)
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
  }, [seriesData?.chapters, user?._id, user?.userId, user?.recentReads]);

  /* ---------------- Focus / foreground revalidation ---------------- */
  const refreshSeries = seriesQuery.refresh;
  const revalidate = useCallback(() => {
    lastFocusRefresh.current = Date.now();
    Promise.resolve(refreshSeries?.()).catch(() => {});
    Promise.resolve(reload?.()).catch(() => {});
  }, [reload, refreshSeries]);

  useFocusEffect(
    useCallback(() => {
      refreshStreak();
      // SWR: only hit the network if what we show is more than 30s old.
      if (Date.now() - lastFocusRefresh.current > 30_000) revalidate();
    }, [revalidate, refreshStreak])
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
      await Promise.allSettled([reload?.(), refreshSeries?.(), refreshStreak()]);
    } finally {
      setRefreshing(false);
      lastFocusRefresh.current = Date.now();
    }
  }, [isConnected, reload, refreshSeries, refreshStreak, showToast]);

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
  const referralCode = useMemo(() => {
    if (user?.referralCode && typeof user.referralCode === "string" && user.referralCode.trim()) {
      return user.referralCode.toUpperCase().trim();
    }
    const cleanId = (user?.userId || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (cleanId.length >= 5 && cleanId.length <= 12) {
      return cleanId;
    }
    const cleanName = (user?.name || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (cleanName.length >= 5 && cleanName.length <= 12) {
      return cleanName;
    }
    return cleanId || cleanName || "READAPT";
  }, [user?.referralCode, user?.userId, user?.name]);

  const copyReferral = useCallback(async () => {
    const success = await copyText(referralCode);
    if (success) {
      Vibration.vibrate(22);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
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
        message: getReferralShareMessage(referralCode),
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

            {user?.isEarlyReader && user?.hasClaimedEarlyBadge ? (
              <EarlyBadgeWithGlow onPress={() => setShowEarlyBadgeInfo(true)} />
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
              <View style={styles.metaPill}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="12" cy="12" r="9" />
                  <Path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
                </Svg>
                <Text style={styles.metaPillText}>{user?.visibility === "Private" ? "Private" : "Public"}</Text>
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
          {user?.profession ? (
            <Text style={styles.professionText}>{user.profession}</Text>
          ) : null}
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
            <View style={styles.journeyBody}>
              <Text style={styles.cardTitle}>
                {seriesData?.title || "Start your learning journey"}
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
          {seriesData?.title ? <Text style={styles.journeySeries} numberOfLines={1}>Your Learning Journey</Text> : null}
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
            <View style={styles.streakHeaderRow}>
              <Text style={styles.streakLabel}>CURRENT STREAK</Text>
              <InfoQuestionIcon onPress={() => setShowStreakInfo(true)} size={13} color="rgba(255,255,255,0.7)" />
            </View>
            <View style={styles.streakNumbers}>
              <Text style={styles.streakNumber}>{streak}</Text>
              <Text style={styles.streakDays}>Days</Text>
            </View>
          </View>
          <ChevronRight color="rgba(255,255,255,0.75)" />
        </Pressable>

        {/* Refer & Earn */}
        <Pressable
          onPress={() => navigation.navigate("ReferAndEarn")}
          onLongPress={() => {
            Vibration.vibrate(20);
            setShowReferInfo(true);
          }}
          delayLongPress={400}
          style={({ pressed }) => [styles.referCard, pressed && styles.cardPressed]}
        >
          <View style={styles.referTop}>
            <View style={styles.referIcon}>
              <GiftBoxIcon size={22} color={ACCENT} />
            </View>
            <View style={styles.referBody}>
              <View style={styles.referTitleRow}>
                <Text style={styles.cardTitle}>Refer &amp; Earn</Text>
                <InfoQuestionIcon onPress={() => setShowReferInfo(true)} size={14} color="rgba(255,255,255,0.7)" />
              </View>
              <Text style={styles.cardMeta}>Share your code with friends and earn rewards.</Text>
            </View>
            <View style={styles.referActions}>
              <AnimatedCircleCopyButton copied={copied} onPress={copyReferral} />
              <TouchableOpacity
                style={styles.circleShareBtn}
                activeOpacity={0.8}
                onPress={shareReferral}
                hitSlop={6}
                accessibilityLabel="Share referral code"
              >
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#04211d" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="18" cy="5" r="3" />
                  <Circle cx="6" cy="12" r="3" />
                  <Circle cx="18" cy="19" r="3" />
                  <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </Svg>
              </TouchableOpacity>
            </View>
          </View>

          <Pressable onPress={copyReferral} style={styles.referCodeBox}>
            <Text style={styles.referCodeLabel}>YOUR REFERRAL CODE</Text>
            <Text style={styles.referCode} selectable>
              {referralCode}
            </Text>
          </Pressable>
        </Pressable>

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
            icon={<GiftBoxIcon size={20} color={ACCENT} />}
            label="Refer & Win"
            onPress={() => navigation.navigate("ReferAndEarn")}
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
      <UpgradeSheet
        visible={showStreakInfo}
        onClose={() => setShowStreakInfo(false)}
        title="How Streak Works"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.streakSheetScroll}
        >
          {/* Streak Status Pill */}
          <View style={styles.streakSheetHero}>
            <View style={styles.streakHeroPill}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill={AMBER}>
                <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </Svg>
              <Text style={styles.streakHeroPillText}>
                {streak > 0 ? `${streak} Day Streak Active` : "Start Your Streak Today"}
              </Text>
            </View>
            <Text style={styles.streakHeroSub}>
              Read daily to build unstoppable momentum and unlock milestone rewards.
            </Text>
          </View>

          {/* Structured Step Cards */}
          <View style={styles.streakStepsWrap}>
            {/* Step 1 */}
            <View style={styles.streakStepCard}>
              <View style={[styles.streakStepIconWrap, { backgroundColor: "rgba(0,210,180,0.12)", borderColor: "rgba(0,210,180,0.3)" }]}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </Svg>
              </View>
              <View style={styles.streakStepBody}>
                <View style={styles.streakStepHeader}>
                  <Text style={[styles.streakStepTag, { color: ACCENT }]}>STEP 1</Text>
                  <Text style={styles.streakStepTitle}>Read or Listen Daily</Text>
                </View>
                <Text style={styles.streakStepDesc}>
                  Read or listen for at least <Text style={{ fontWeight: "700", color: "#f1f5f9" }}>4 minutes</Text> every day before midnight.
                </Text>
              </View>
            </View>

            {/* Step 2 */}
            <View style={styles.streakStepCard}>
              <View style={[styles.streakStepIconWrap, { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.3)" }]}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </Svg>
              </View>
              <View style={styles.streakStepBody}>
                <View style={styles.streakStepHeader}>
                  <Text style={[styles.streakStepTag, { color: AMBER }]}>STEP 2</Text>
                  <Text style={styles.streakStepTitle}>Never Break The Chain</Text>
                </View>
                <Text style={styles.streakStepDesc}>
                  Every consecutive day grows your fire. Missing a day resets the counter to 0.
                </Text>
              </View>
            </View>

            {/* Step 3 */}
            <View style={styles.streakStepCard}>
              <View style={[styles.streakStepIconWrap, { backgroundColor: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.3)" }]}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Polyline points="20 12 20 22 4 22 4 12" />
                  <Rect x="2" y="7" width="20" height="5" rx="1" />
                  <Line x1="12" y1="22" x2="12" y2="7" />
                  <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                  <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                </Svg>
              </View>
              <View style={styles.streakStepBody}>
                <View style={styles.streakStepHeader}>
                  <Text style={[styles.streakStepTag, { color: "#a78bfa" }]}>STEP 3</Text>
                  <Text style={styles.streakStepTitle}>Unlock Milestone Rewards</Text>
                </View>
                <Text style={styles.streakStepDesc}>
                  Hit 7, 14, and 21 days in a row to unlock lucky spins, badges, and perks.
                </Text>
              </View>
            </View>
          </View>

          {/* Milestones Target Grid */}
          <View style={styles.milestoneBox}>
            <Text style={styles.milestoneBoxTitle}>MILESTONE TARGETS</Text>
            <View style={styles.milestoneGrid}>
              <View style={[styles.milestonePill, streak >= 7 && styles.milestonePillActive]}>
                <Text style={[styles.milestoneDays, streak >= 7 && styles.milestoneDaysActive]}>7 Days</Text>
                <Text style={styles.milestoneSub}>Bronze Spin</Text>
                {streak >= 7 ? <View style={styles.milestoneDot} /> : null}
              </View>
              <View style={[styles.milestonePill, streak >= 14 && styles.milestonePillActive]}>
                <Text style={[styles.milestoneDays, streak >= 14 && styles.milestoneDaysActive]}>14 Days</Text>
                <Text style={styles.milestoneSub}>Silver Spin</Text>
                {streak >= 14 ? <View style={styles.milestoneDot} /> : null}
              </View>
              <View style={[styles.milestonePill, streak >= 21 && styles.milestonePillActive]}>
                <Text style={[styles.milestoneDays, streak >= 21 && styles.milestoneDaysActive]}>21 Days</Text>
                <Text style={styles.milestoneSub}>Gold Legend</Text>
                {streak >= 21 ? <View style={styles.milestoneDot} /> : null}
              </View>
            </View>
          </View>

          {/* Action button */}
          <TouchableOpacity
            style={styles.streakPrimaryBtn}
            activeOpacity={0.85}
            onPress={() => {
              setShowStreakInfo(false);
              navigation.navigate("DailyRewards");
            }}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#04211d" strokeWidth={2.4}>
              <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </Svg>
            <Text style={styles.streakPrimaryBtnText}>Go to Daily Rewards</Text>
          </TouchableOpacity>
        </ScrollView>
      </UpgradeSheet>

      {/* Refer & Earn info sheet */}
      <UpgradeSheet
        visible={showReferInfo}
        onClose={() => setShowReferInfo(false)}
        title="How Refer & Earn Works"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.referSheetScroll}
        >
          {/* Hero Header */}
          <View style={styles.referSheetHero}>
            <View style={styles.referHeroPill}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="20 12 20 22 4 22 4 12" />
                <Rect x="2" y="7" width="20" height="5" rx="1" />
                <Line x1="12" y1="22" x2="12" y2="7" />
                <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </Svg>
              <Text style={styles.referHeroPillText}>Invite Friends & Win</Text>
            </View>
            <Text style={styles.referHeroSub}>
              Share Readapt with your friends to unlock exclusive reading perks and climb the leaderboard together.
            </Text>
          </View>

          {/* Quick Referral Code Pill */}
          <View style={styles.referSheetCodeCard}>
            <View style={styles.referSheetCodeLeft}>
              <Text style={styles.referSheetCodeTag}>YOUR REFERRAL CODE</Text>
              <Text style={styles.referSheetCodeText} selectable>{referralCode}</Text>
            </View>
            <TouchableOpacity
              style={styles.referSheetCopyBtn}
              activeOpacity={0.8}
              onPress={copyReferral}
            >
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </Svg>
              <Text style={styles.referSheetCopyText}>{copied ? "Copied" : "Copy"}</Text>
            </TouchableOpacity>
          </View>

          {/* Structured Step Cards */}
          <View style={styles.referStepsWrap}>
            {/* Step 1 */}
            <View style={styles.referStepCard}>
              <View style={[styles.referStepIconWrap, { backgroundColor: "rgba(45,212,191,0.12)", borderColor: "rgba(45,212,191,0.3)" }]}>
                <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="18" cy="5" r="3" />
                  <Circle cx="6" cy="12" r="3" />
                  <Circle cx="18" cy="19" r="3" />
                  <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </Svg>
              </View>
              <View style={styles.referStepBody}>
                <View style={styles.referStepHeader}>
                  <Text style={[styles.referStepTag, { color: ACCENT }]}>STEP 1</Text>
                  <Text style={styles.referStepTitle}>Share Your Unique Code</Text>
                </View>
                <Text style={styles.referStepDesc}>
                  Invite friends to Readapt using your personal referral code or invite link.
                </Text>
              </View>
            </View>

            {/* Step 2 */}
            <View style={styles.referStepCard}>
              <View style={[styles.referStepIconWrap, { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.3)" }]}>
                <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </Svg>
              </View>
              <View style={styles.referStepBody}>
                <View style={styles.referStepHeader}>
                  <Text style={[styles.referStepTag, { color: AMBER }]}>STEP 2</Text>
                  <Text style={styles.referStepTitle}>They Sign Up & Read</Text>
                </View>
                <Text style={styles.referStepDesc}>
                  When they create an account and start reading, you both earn milestone rewards.
                </Text>
              </View>
            </View>

            {/* Step 3 */}
            <View style={styles.referStepCard}>
              <View style={[styles.referStepIconWrap, { backgroundColor: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.3)" }]}>
                <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <Polyline points="17 6 23 6 23 12" />
                </Svg>
              </View>
              <View style={styles.referStepBody}>
                <View style={styles.referStepHeader}>
                  <Text style={[styles.referStepTag, { color: "#a78bfa" }]}>STEP 3</Text>
                  <Text style={styles.referStepTitle}>Track Live Earnings</Text>
                </View>
                <Text style={styles.referStepDesc}>
                  Monitor joined friends, active streaks, and bonus points live in the app.
                </Text>
              </View>
            </View>

            {/* Step 4 */}
            <View style={styles.referStepCard}>
              <View style={[styles.referStepIconWrap, { backgroundColor: "rgba(52,211,153,0.12)", borderColor: "rgba(52,211,153,0.3)" }]}>
                <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="12" cy="8" r="6" />
                  <Path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                </Svg>
              </View>
              <View style={styles.referStepBody}>
                <View style={styles.referStepHeader}>
                  <Text style={[styles.referStepTag, { color: "#34d399" }]}>STEP 4</Text>
                  <Text style={styles.referStepTitle}>Unlock Badges & Perks</Text>
                </View>
                <Text style={styles.referStepDesc}>
                  Gain rare reader badges, streak shields, and higher rank on the leaderboard.
                </Text>
              </View>
            </View>
          </View>

          {/* Action Button: Share */}
          <TouchableOpacity
            style={styles.referPrimaryBtn}
            activeOpacity={0.85}
            onPress={() => {
              setShowReferInfo(false);
              shareReferral();
            }}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#04211d" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx="18" cy="5" r="3" />
              <Circle cx="6" cy="12" r="3" />
              <Circle cx="18" cy="19" r="3" />
              <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </Svg>
            <Text style={styles.referPrimaryBtnText}>Share Referral Link</Text>
          </TouchableOpacity>

          {/* Secondary Button: Dashboard */}
          <TouchableOpacity
            style={styles.referSecondaryBtn}
            activeOpacity={0.8}
            onPress={() => {
              setShowReferInfo(false);
              navigation.navigate("ReferAndEarn");
            }}
          >
            <Text style={styles.referSecondaryBtnText}>Open Refer & Earn Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
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

      {/* Early badge info sheet */}
      <UpgradeSheet
        visible={showEarlyBadgeInfo}
        onClose={() => setShowEarlyBadgeInfo(false)}
        title=""
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.earlySheetScroll}
        >
          {/* Top Dark Teal Hero Card */}
          <View style={styles.earlySheetHeroCard}>
            {/* Early badge PNG image in center top */}
            <Image
              source={require("../../assets/earlybadge.png")}
              style={styles.earlySheetBadgeImage}
            />

            {/* Lifetime Badge pill shown right below center */}
            <View style={styles.lifetimePill}>
              <Text style={styles.lifetimePillText}>Lifetime Badge</Text>
            </View>

            {/* Early Reader title */}
            <Text style={styles.earlySheetTitle}>Early Reader</Text>

            {/* Subtitle */}
            <Text style={styles.earlySheetSubtitle}>
              Proud to have you with us from the beginning.
            </Text>
          </View>

          {/* Middle Body */}
          <View style={styles.earlySheetMiddle}>
            <Text style={styles.earlySheetHeadline}>
              A little recognition, just for you.
            </Text>
            <Text style={styles.earlySheetBodyText}>
              You were among the early members who joined READAPT before its official subscription launch.
            </Text>
          </View>

          {/* Divider */}
          <View style={styles.earlySheetDivider} />

          {/* Recognition Rows */}
          <View style={styles.earlySheetRows}>
            {/* Row 1: Awarded for */}
            <View style={styles.earlySheetRow}>
              <View style={styles.earlySheetIconCol}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <Line x1="16" y1="2" x2="16" y2="6" />
                  <Line x1="8" y1="2" x2="8" y2="6" />
                  <Line x1="3" y1="10" x2="21" y2="10" />
                </Svg>
              </View>
              <View style={styles.earlySheetTextCol}>
                <Text style={styles.earlySheetRowTitle}>Awarded for</Text>
                <Text style={styles.earlySheetRowSub}>
                  Joining during READAPT's early access phase
                </Text>
              </View>
            </View>

            {/* Row 2: Your recognition */}
            <View style={styles.earlySheetRow}>
              <View style={styles.earlySheetIconCol}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="12" cy="8" r="6" />
                  <Path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                </Svg>
              </View>
              <View style={styles.earlySheetTextCol}>
                <Text style={styles.earlySheetRowTitle}>Your recognition</Text>
                <Text style={styles.earlySheetRowSub}>
                  Permanent badge on your profile
                </Text>
              </View>
            </View>

            {/* Row 3: Our appreciation */}
            <View style={styles.earlySheetRow}>
              <View style={styles.earlySheetIconCol}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </Svg>
              </View>
              <View style={styles.earlySheetTextCol}>
                <Text style={styles.earlySheetRowTitle}>Our appreciation</Text>
                <Text style={styles.earlySheetRowSub}>
                  Thank you for being part of our early journey.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </UpgradeSheet>

      {/* Early badge unlock celebration modal */}
      <EarlyBadgeUnlockModal
        visible={showEarlyUnlockModal}
        onClaim={handleClaimEarlyBadge}
        loading={claimingEarlyBadge}
      />

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

  professionText: {
    color: "#94a3b8",
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginBottom: 5,
  },
  bioWrap: { paddingHorizontal: 20, marginTop: 18, marginBottom: 18 },
  bioText: { color: "rgba(241, 245, 249, 0.95)", fontSize: 14.5, lineHeight: 22 },
  bioPlaceholder: { color: "rgba(148,163,184,0.55)", fontSize: 14 },
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
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(0,210,180,0.055)",
    borderWidth: 1,
    borderColor: "rgba(0,210,180,0.28)",
  },
  journeyTop: { flexDirection: "row", alignItems: "center" },
  journeyBody: { flex: 1, marginRight: 8 },
  journeySeries: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 11,
    marginTop: 10,
  },
  badgeContainer: {
    position: "absolute",
    bottom: -4,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  goldenSpark: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#fde047",
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 5,
    elevation: 4,
  },
  /* =========================================================================
   * EARLY BADGE SIZE CONFIGURATION:
   * To change badge size, adjust width and height below keeping the ~3.43 ratio:
   * Standard: width: 95, height: 25.5
   * Larger:   width: 103, height: 28  (or width: 110, height: 30)
   * ========================================================================= */
  earlyBadgeImage: {
    width: 110,
    height: 45.5,
    resizeMode: "contain",
  },
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
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(120,63,4,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.45)",
  },
  streakIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.12)",
    marginRight: 14,
  },
  streakBody: { flex: 1 },
  streakHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  streakLabel: { color: AMBER, fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2 },
  streakNumbers: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 },
  streakNumber: { color: "#c0c0c0", fontSize: 38, fontWeight: "800", fontStyle: "italic", letterSpacing: -1 },
  streakDays: { color: "rgba(203,213,225,0.75)", fontSize: 20, fontWeight: "700" },

  referCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
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
  referTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  referActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleActionPressable: {
    borderRadius: 999,
  },
  circleActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  circleIconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  circleIconWrapAbsolute: {
    position: "absolute",
  },
  circleShareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
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

  /* Refer & Earn Sheet Styles */
  referSheetScroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
  },
  referSheetHero: {
    alignItems: "center",
    marginBottom: 14,
  },
  referHeroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(45,212,191,0.12)",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.32)",
    marginBottom: 8,
  },
  referHeroPillText: {
    color: "#2DD4BF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  referHeroSub: {
    color: "rgba(203,213,225,0.75)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  referSheetCodeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(45,212,191,0.06)",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.22)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  referSheetCodeLeft: {
    flex: 1,
  },
  referSheetCodeTag: {
    color: "rgba(148,163,184,0.85)",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  referSheetCodeText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  referSheetCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(45,212,191,0.15)",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  referSheetCopyText: {
    color: "#2DD4BF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  referStepsWrap: {
    gap: 10,
    marginBottom: 16,
  },
  referStepCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  referStepIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  referStepBody: {
    flex: 1,
  },
  referStepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  referStepTag: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  referStepTitle: {
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: "700",
  },
  referStepDesc: {
    color: "rgba(148,163,184,0.85)",
    fontSize: 12,
    lineHeight: 17,
  },
  referPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  referPrimaryBtnText: {
    color: "#04211d",
    fontSize: 15,
    fontWeight: "800",
  },
  referSecondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  referSecondaryBtnText: {
    color: "rgba(148,163,184,0.8)",
    fontSize: 13,
    fontWeight: "600",
  },

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

  streakSheetScroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
  },
  streakSheetHero: {
    alignItems: "center",
    marginBottom: 16,
  },
  streakHeroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.32)",
    marginBottom: 8,
  },
  streakHeroPillText: {
    color: "#fcd34d",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  streakHeroSub: {
    color: "rgba(203,213,225,0.75)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  streakStepsWrap: {
    gap: 10,
    marginBottom: 14,
  },
  streakStepCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  streakStepIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  streakStepBody: {
    flex: 1,
  },
  streakStepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  streakStepTag: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  streakStepTitle: {
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: "700",
  },
  streakStepDesc: {
    color: "rgba(148,163,184,0.85)",
    fontSize: 12,
    lineHeight: 17,
  },
  milestoneBox: {
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  milestoneBoxTitle: {
    color: "rgba(148,163,184,0.75)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
    textAlign: "center",
  },
  milestoneGrid: {
    flexDirection: "row",
    gap: 8,
  },
  milestonePill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    position: "relative",
  },
  milestonePillActive: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.36)",
  },
  milestoneDays: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "800",
  },
  milestoneDaysActive: {
    color: "#fcd34d",
  },
  milestoneSub: {
    color: "rgba(148,163,184,0.7)",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  milestoneDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AMBER,
  },
  streakPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AMBER,
    borderRadius: 14,
    paddingVertical: 14,
  },
  streakPrimaryBtnText: {
    color: "#04211d",
    fontSize: 14.5,
    fontWeight: "800",
  },

  earlySheetScroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
  },
  earlySheetHeroCard: {
    backgroundColor: "#0d2822",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(0, 210, 180, 0.24)",
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  earlySheetBadgeImage: {
    width: 140,
    height: 41,
    resizeMode: "contain",
  },
  earlySheetTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginTop: 10,
  },
  lifetimePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#00D2B4",
    backgroundColor: "rgba(0, 210, 180, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 3.5,
    marginTop: 8,
  },
  lifetimePillText: {
    color: "#00D2B4",
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  earlySheetSubtitle: {
    color: "rgba(203, 213, 225, 0.8)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 18,
  },
  earlySheetMiddle: {
    marginTop: 20,
    paddingHorizontal: 4,
  },
  earlySheetHeadline: {
    color: "#ffffff",
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  earlySheetBodyText: {
    color: "rgba(226, 232, 240, 0.84)",
    fontSize: 13.5,
    lineHeight: 21,
    marginTop: 8,
  },
  earlySheetDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 18,
    marginHorizontal: 4,
  },
  earlySheetRows: {
    gap: 16,
    paddingHorizontal: 4,
  },
  earlySheetRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  earlySheetIconCol: {
    width: 28,
    alignItems: "flex-start",
    paddingTop: 1,
  },
  earlySheetTextCol: {
    flex: 1,
    marginLeft: 6,
  },
  earlySheetRowTitle: {
    color: "#ffffff",
    fontSize: 14.5,
    fontWeight: "700",
  },
  earlySheetRowSub: {
    color: "rgba(148, 163, 184, 0.85)",
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },

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
