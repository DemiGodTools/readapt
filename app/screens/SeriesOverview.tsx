import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
  Vibration,
  ActivityIndicator,
  Share,
  DeviceEventEmitter,
  BackHandler,
} from "react-native";
import Svg, { Path, Circle, Polyline, Line, Rect } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CachedImage, { isRenderableUrl } from "../../components/props/CachedImage";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";

import pallete from "../../lib/Colors";
import { api } from "../../lib/api";
import useAuth from "../../hooks/useAuth";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { canUserAccessChapter } from "../../lib/entitlements";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { ISeries } from "../../types/Series";
import ContentCard from "../../components/props/ContentCard";
import Offline from "../../components/state/Offline";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const COMPLETED_QNA_KEY_PREFIX = "@completed_qna_chapters_";

// --- SVG Icons ---
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

const ShareIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 12V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V12"
      stroke="#ffffff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Polyline points="16 6 12 2 8 6" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="12" y1="2" x2="12" y2="15" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ExitDoorIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
      stroke="#f87171"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Polyline
      points="16 17 21 12 16 7"
      stroke="#f87171"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Line
      x1="21"
      y1="12"
      x2="9"
      y2="12"
      stroke="#f87171"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const BookIcon = ({ color = "#94a3b8" }: { color?: string }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path
      d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const UsersIcon = ({ color = "#94a3b8" }: { color?: string }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

const LockSmallIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#94a3b8" strokeWidth={2} />
    <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const ChevronRightIcon = ({ color = "#2dd4bf", size = 18 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 18L15 12L9 6"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const CloseIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6L18 18" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const AlertTriangleIcon = () => (
  <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
    <Path
      d="M10.29 3.86L1.82 18A2 2 0 003.55 21H20.45A2 2 0 0022.18 18L13.71 3.86A2 2 0 0010.29 3.86Z"
      stroke="#f59e0b"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Line x1="12" y1="9" x2="12" y2="13" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
    <Circle cx="12" cy="17" r="1" fill="#f59e0b" />
  </Svg>
);

const formatCompactNumber = (num?: number): string => {
  if (!num || isNaN(num)) return "0";
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return num.toString();
};

const getInitials = (name?: string): string => {
  if (!name || !name.trim()) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
};

const getOptimizedThumb = (url?: string, width = 800, height = 500): string => {
  if (!url) {
    return "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=800&auto=format&fit=crop";
  }
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", `/upload/c_fill,w_${width},h_${height},q_auto,f_auto/`);
  }
  return url;
};

const getJoinedSeriesId = (val: any): string | null => {
  if (!val) return null;
  if (typeof val === "string") return val.trim();
  if (typeof val === "object") {
    if (val._id) return String(val._id).trim();
    if (val.id) return String(val.id).trim();
    if (typeof val.toString === "function") {
      const s = val.toString();
      if (s && s !== "[object Object]") return s.trim();
    }
  }
  return null;
};

// ============================================================================
// MAIN COMPONENT: SeriesOverview
// ============================================================================
export default function SeriesOverview() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<any>();
  const currentSeriesId = route.params?.seriesId;

  const { accessToken } = useAuth();
  const { user, reload, updateUser } = useUser();
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();

  // State
  const [seriesData, setSeriesData] = useState<ISeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [isJoined, setIsJoined] = useState(() => {
    const joinedId = getJoinedSeriesId(user?.joinedSeries);
    return Boolean(joinedId && currentSeriesId && joinedId === String(currentSeriesId));
  });
  const [joinedSeriesTitle, setJoinedSeriesTitle] = useState<string | null>(null);
  const [completeChapters, setCompleteChapters] = useState(0);
  const [completedChapterIds, setCompletedChapterIds] = useState<string[]>([]);
  const [recommendedBook, setRecommendedBook] = useState<any>(null);
  const [loadingRecommendedBook, setLoadingRecommendedBook] = useState<boolean>(true);

  // Tabs: 'chapters' (or Levels) | 'about'
  // When user is joined, default tab is 'chapters'; when not joined, default tab is 'about'
  const [activeTab, setActiveTab] = useState<"chapters" | "about">(() => {
    const joinedId = getJoinedSeriesId(user?.joinedSeries);
    return Boolean(joinedId && currentSeriesId && joinedId === String(currentSeriesId))
      ? "chapters"
      : "about";
  });

  // Bottom Sheets
  const [isSwitchSheetVisible, setIsSwitchSheetVisible] = useState(false);
  const [isExitSheetVisible, setIsExitSheetVisible] = useState(false);
  const [isMembersSheetVisible, setIsMembersSheetVisible] = useState(false);

  const isFramework = seriesData?.type === "framework";
  const accentColor = isFramework ? "#38bdf8" : "#2dd4bf";

  // Reanimated Sheet translations
  const switchSheetY = useSharedValue(SCREEN_HEIGHT);
  const exitSheetY = useSharedValue(SCREEN_HEIGHT);
  const membersSheetY = useSharedValue(SCREEN_HEIGHT);

  // 1. Fetch Series Details (0ms instant cache hydration + API sync)
  const loadSeries = useCallback(async () => {
    if (!currentSeriesId) return;
    const cacheKey = `cache_series_${currentSeriesId}`;

    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setSeriesData(JSON.parse(cached));
        setLoading(false);
      }
    } catch {}

    if (!isConnected) {
      setLoading(false);
      return;
    }

    try {
      let token = accessToken;
      if (!token) {
        const stored =
          (await SecureStore.getItemAsync("accessToken")) ||
          (await AsyncStorage.getItem("accessToken"));
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            token = parsed?.token || (typeof parsed === "string" ? parsed : "");
          } catch {
            token = stored;
          }
        }
      }

      const res = await api.get(`/series/${currentSeriesId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const fresh = res?.data?.data;
      if (fresh) {
        setSeriesData(fresh);
        AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => {});
      }
    } catch (err: any) {
      console.warn("Series load failed:", err?.message);
    } finally {
      setLoading(false);
    }
  }, [currentSeriesId, accessToken, isConnected]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  // Sync joined status with user object
  useEffect(() => {
    const joinedId = getJoinedSeriesId(user?.joinedSeries);
    const targetId1 = currentSeriesId ? String(currentSeriesId) : null;
    const targetId2 = seriesData?._id ? String(seriesData._id) : null;

    const currentlyJoined = Boolean(
      joinedId && ((targetId1 && joinedId === targetId1) || (targetId2 && joinedId === targetId2))
    );
    setIsJoined(currentlyJoined);
    if (currentlyJoined) {
      setActiveTab("chapters");
    } else {
      setActiveTab("about");
    }
  }, [user?.joinedSeries, seriesData?._id, currentSeriesId]);

  // Fetch title of other joined series if user is enrolled in another one
  useEffect(() => {
    let cancel = false;
    const fetchOtherJoinedTitle = async () => {
      const otherId = getJoinedSeriesId(user?.joinedSeries);
      const targetId1 = currentSeriesId ? String(currentSeriesId) : null;
      const targetId2 = seriesData?._id ? String(seriesData._id) : null;

      if (
        otherId &&
        otherId !== targetId1 &&
        otherId !== targetId2 &&
        isConnected
      ) {
        try {
          const cacheKey = `series_title_${otherId}`;
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached && !cancel) {
            setJoinedSeriesTitle(cached);
            return;
          }

          const res = await api.get(`/series/${otherId}`);
          if (res?.data?.data?.title && !cancel) {
            setJoinedSeriesTitle(res.data.data.title);
            AsyncStorage.setItem(cacheKey, res.data.data.title).catch(() => {});
          }
        } catch {}
      } else {
        if (!cancel) setJoinedSeriesTitle(null);
      }
    };

    fetchOtherJoinedTitle();
    return () => {
      cancel = true;
    };
  }, [user?.joinedSeries, seriesData?._id, currentSeriesId, isConnected]);

  // Chapter items
  const chapterItems = useMemo(() => {
    return seriesData?.chapters?.filter((item) => item.contentModel === "Chapter") || [];
  }, [seriesData?.chapters]);

  const totalChapters = chapterItems.length;

  const chapterIdsSet = useMemo(() => {
    const ids = new Set<string>();
    chapterItems.forEach((item) => {
      if (item.content?._id) ids.add(String(item.content._id));
      else if (typeof item.content === "string") ids.add(String(item.content));
    });
    return ids;
  }, [chapterItems]);

  // 2. Strict Q&A Progress Calculation:
  // A chapter only counts towards progress when user completes all Q&A!
  const calculateQnaProgress = useCallback(async () => {
    if (chapterIdsSet.size === 0) return;
    try {
      const storageKey = `${COMPLETED_QNA_KEY_PREFIX}${user?._id || user?.userId || "guest"}`;
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        const completedIds: string[] = JSON.parse(raw);
        setCompletedChapterIds(completedIds);
        let count = 0;
        completedIds.forEach((id) => {
          if (chapterIdsSet.has(String(id))) {
            count++;
          }
        });
        setCompleteChapters(count);
      } else {
        setCompletedChapterIds([]);
        setCompleteChapters(0);
      }
    } catch {}
  }, [chapterIdsSet, user?._id, user?.userId]);

  useEffect(() => {
    calculateQnaProgress();
  }, [calculateQnaProgress]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("CHAPTER_QNA_COMPLETED", () => {
      calculateQnaProgress();
    });
    return () => sub.remove();
  }, [calculateQnaProgress]);

  useEffect(() => {
    let cancel = false;
    const resolveRecommendation = async () => {
      if (!seriesData) return;

      const recBookRef = seriesData.recommendationBookId;

      // 1. If recommendationBookId is already populated as an object
      if (recBookRef && typeof recBookRef === "object" && (recBookRef.title || recBookRef._id)) {
        if (!cancel) {
          setRecommendedBook(recBookRef);
          setLoadingRecommendedBook(false);
        }
        return;
      }

      // 2. If recommendationBookId is an ID string
      if (recBookRef && typeof recBookRef === "string") {
        setLoadingRecommendedBook(true);
        try {
          const res = await api.get(`/chapter/${recBookRef}`);
          const bookData = res?.data?.data || res?.data?.chapter || res?.data;
          if (bookData && !cancel) {
            setRecommendedBook(bookData);
            setLoadingRecommendedBook(false);
            return;
          }
        } catch {}
      }

      // 3. Fallback: fetch from popular chapters
      setLoadingRecommendedBook(true);
      try {
        const res = await api.get("/chapter/popular");
        const list = res?.data?.data;
        if (Array.isArray(list) && list.length > 0) {
          const candidate = list.find((c: any) => !chapterIdsSet.has(String(c._id || c.id))) || list[0];
          if (candidate && !cancel) {
            setRecommendedBook(candidate);
            setLoadingRecommendedBook(false);
            return;
          }
        }
      } catch {}

      // 4. Secondary fallback
      try {
        const res = await api.get("/chapter");
        const list = res?.data?.data;
        if (Array.isArray(list) && list.length > 0) {
          const candidate = list.find((c: any) => !chapterIdsSet.has(String(c._id || c.id))) || list[0];
          if (candidate && !cancel) {
            setRecommendedBook(candidate);
          }
        }
      } catch {}

      if (!cancel) {
        setLoadingRecommendedBook(false);
      }
    };

    resolveRecommendation();
    return () => {
      cancel = true;
    };
  }, [seriesData?.recommendationBookId, seriesData?._id, chapterIdsSet]);

  // First Chapter for Fresh User
  const firstChapter = useMemo<any>(() => {
    if (!chapterItems || chapterItems.length === 0) return null;
    const raw = chapterItems[0]?.content;
    return typeof raw === "object" ? raw : chapterItems[0];
  }, [chapterItems]);

  // Current active level/chapter for expanded progress state
  const currentActiveIdx = useMemo(() => {
    return Math.min(completeChapters, Math.max(0, totalChapters - 1));
  }, [completeChapters, totalChapters]);

  const currentActiveChapter = useMemo<any>(() => {
    if (!chapterItems || chapterItems.length === 0) return null;
    const raw = chapterItems[currentActiveIdx]?.content;
    return typeof raw === "object" ? raw : chapterItems[currentActiveIdx];
  }, [chapterItems, currentActiveIdx]);

  const currentActiveChapterId = useMemo(() => {
    return String(
      (typeof currentActiveChapter === "object"
        ? currentActiveChapter?._id || currentActiveChapter?.id
        : currentActiveChapter) || ""
    );
  }, [currentActiveChapter]);

  const isCurrentActiveCompleted = useMemo(() => {
    return Boolean(
      currentActiveChapterId && completedChapterIds.includes(currentActiveChapterId)
    );
  }, [currentActiveChapterId, completedChapterIds]);

  const isSeriesFullyCompleted = useMemo(() => {
    return completeChapters >= totalChapters && totalChapters > 0;
  }, [completeChapters, totalChapters]);

  const totalActiveQuestions = useMemo(() => {
    return currentActiveChapter?.questions?.length || 0;
  }, [currentActiveChapter]);

  const [currentChapterAttemptedCount, setCurrentChapterAttemptedCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const loadAttemptCount = async () => {
      if (isCurrentActiveCompleted || isSeriesFullyCompleted) {
        if (isMounted) setCurrentChapterAttemptedCount(totalActiveQuestions);
        return;
      }
      let count = 0;
      try {
        const solvedRaw = await AsyncStorage.getItem(`@chapter_solved_qna_${currentActiveChapterId}`);
        if (solvedRaw) {
          const parsed = JSON.parse(solvedRaw);
          if (Array.isArray(parsed)) {
            count = parsed.length;
          }
        }
      } catch {}

      if (count === 0 && user?.questionsAttempted && Array.isArray(currentActiveChapter?.questions)) {
        const attempts = user.questionsAttempted;
        currentActiveChapter.questions.forEach((q: any) => {
          const qId = String(q?._id || q?.id || q);
          const qText = q?.question || q?.title;
          if (
            attempts.some(
              (att: any) =>
                String(att?.questionId || att?.question) === qId ||
                (qText && att?.question === qText)
            )
          ) {
            count++;
          }
        });
      }

      if (isMounted) {
        setCurrentChapterAttemptedCount(Math.min(totalActiveQuestions, count));
      }
    };

    if (currentActiveChapterId) {
      loadAttemptCount();
    }
    return () => {
      isMounted = false;
    };
  }, [
    currentActiveChapterId,
    isCurrentActiveCompleted,
    isSeriesFullyCompleted,
    totalActiveQuestions,
    user?.questionsAttempted,
  ]);

  // Bottom Sheets Animations (Smooth non-bouncy timing)
  const openSwitchSheet = () => {
    setIsSwitchSheetVisible(true);
    switchSheetY.value = withTiming(0, {
      duration: 250,
      easing: Easing.out(Easing.quad),
    });
  };

  const closeSwitchSheet = () => {
    switchSheetY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 200, easing: Easing.in(Easing.quad) },
      () => {
        runOnJS(setIsSwitchSheetVisible)(false);
      }
    );
  };

  const switchSheetGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) switchSheetY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 600) {
        runOnJS(closeSwitchSheet)();
      } else {
        switchSheetY.value = withTiming(0, { duration: 180 });
      }
    });

  const switchSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: switchSheetY.value }],
  }));

  const openExitSheet = () => {
    try {
      Vibration.vibrate(6);
    } catch {}
    setIsExitSheetVisible(true);
    exitSheetY.value = withTiming(0, {
      duration: 250,
      easing: Easing.out(Easing.quad),
    });
  };

  const closeExitSheet = () => {
    exitSheetY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 200, easing: Easing.in(Easing.quad) },
      () => {
        runOnJS(setIsExitSheetVisible)(false);
      }
    );
  };

  const exitSheetGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) exitSheetY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 600) {
        runOnJS(closeExitSheet)();
      } else {
        exitSheetY.value = withTiming(0, { duration: 180 });
      }
    });

  const exitSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: exitSheetY.value }],
  }));

  const openMembersSheet = () => {
    if (!isJoined) return;
    try {
      Vibration.vibrate(6);
    } catch {}
    setIsMembersSheetVisible(true);
    membersSheetY.value = withTiming(0, {
      duration: 250,
      easing: Easing.out(Easing.quad),
    });
  };

  const closeMembersSheet = () => {
    membersSheetY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 200, easing: Easing.in(Easing.quad) },
      () => {
        runOnJS(setIsMembersSheetVisible)(false);
      }
    );
  };

  // Handle Android hardware back button: close bottom sheets if open instead of leaving screen
  useEffect(() => {
    const handleHardwareBack = () => {
      if (isMembersSheetVisible) {
        closeMembersSheet();
        return true;
      }
      if (isExitSheetVisible) {
        closeExitSheet();
        return true;
      }
      if (isSwitchSheetVisible) {
        closeSwitchSheet();
        return true;
      }
      return false;
    };

    const backSub = BackHandler.addEventListener("hardwareBackPress", handleHardwareBack);
    return () => backSub.remove();
  }, [isMembersSheetVisible, isExitSheetVisible, isSwitchSheetVisible]);

  const membersSheetGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) membersSheetY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 600) {
        runOnJS(closeMembersSheet)();
      } else {
        membersSheetY.value = withTiming(0, { duration: 180 });
      }
    });

  const membersSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: membersSheetY.value }],
  }));

  // Resolve active auth token helper
  const getCleanAuthToken = async () => {
    let token = accessToken;
    if (!token) {
      const stored =
        (await SecureStore.getItemAsync("accessToken")) ||
        (await AsyncStorage.getItem("accessToken"));
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          token = parsed?.token || (typeof parsed === "string" ? parsed : "");
        } catch {
          token = stored;
        }
      }
    }
    return token ? token.trim() : "";
  };

  // Join Action
  const handleJoinPress = () => {
    try {
      Vibration.vibrate(6);
    } catch {}

    if (!isConnected) {
      showToast({ title: "You are offline. Please connect to the Internet." });
      return;
    }

    const otherJoined = getJoinedSeriesId(user?.joinedSeries);
    const targetId = String(seriesData?._id || currentSeriesId || "");

    if (otherJoined && targetId && otherJoined !== targetId) {
      openSwitchSheet();
      return;
    }

    executeJoinSeries();
  };

  const executeJoinSeries = async () => {
    const targetId = String(seriesData?._id || currentSeriesId || "");
    if (!targetId) return;

    // Optimistic UI updates
    setIsJoined(true);
    updateUser({ joinedSeries: targetId });
    setActiveTab("chapters");

    try {
      const token = await getCleanAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (user?.email) headers["x-user-email"] = user.email;

      const res = await api.post(
        "/series/join",
        { seriesId: targetId },
        { headers }
      );

      if (res.status === 200 || res.status === 201 || res.data?.success !== false) {
        showToast({
          title: `Enrolled in ${seriesData?.title || "series"}!`,
        });
        setSeriesData((prev) => {
          if (!prev) return prev;
          const currentJoined = prev.joinedBy || [];
          const alreadyIn = currentJoined.some((m: any) =>
            typeof m === "object"
              ? m._id === user?._id || m.userId === user?.userId
              : m === user?._id
          );
          if (alreadyIn) return prev;
          const newUserObj = user
            ? {
                _id: user._id || "me",
                name: user.name || "You",
                userId: user.userId || "you",
                image: user.image || "",
              }
            : "me";
          return {
            ...prev,
            joinedBy: [newUserObj, ...currentJoined],
          };
        });
        DeviceEventEmitter.emit("SERIES_JOINED", { seriesId: targetId });
        reload().catch(() => {});
      } else {
        setIsJoined(false);
        updateUser({ joinedSeries: user?.joinedSeries });
        showToast({ title: res.data?.message || "Failed to join series" });
      }
    } catch (err: any) {
      console.warn("Join series error:", err?.response?.data || err?.message);
      setIsJoined(false);
      updateUser({ joinedSeries: user?.joinedSeries });
      showToast({
        title: err?.response?.data?.message || "Failed to join series",
      });
    }
  };

  // Exit Series Action
  const executeExitSeries = async () => {
    const targetId = String(seriesData?._id || currentSeriesId || "");
    closeExitSheet();

    setIsJoined(false);
    updateUser({ joinedSeries: undefined });
    setActiveTab("about");
    setSeriesData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        joinedBy: (prev.joinedBy || []).filter((m: any) =>
          typeof m === "object"
            ? m._id !== user?._id && m.userId !== user?.userId
            : m !== user?._id
        ),
      };
    });

    try {
      const token = await getCleanAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (user?.email) headers["x-user-email"] = user.email;

      await api.post(
        "/series/exit",
        { seriesId: targetId },
        { headers }
      );
      showToast({ title: "Exited series." });
      DeviceEventEmitter.emit("SERIES_EXITED", { seriesId: targetId });
      reload().catch(() => {});
    } catch (err: any) {
      console.warn("Exit series error:", err?.response?.data || err?.message);
      showToast({ title: "Exited series." });
      DeviceEventEmitter.emit("SERIES_EXITED", { seriesId: targetId });
      reload().catch(() => {});
    }
  };

  // Start Chapter Handler
  const handleStartChapter = (targetChapter: any) => {
    try {
      Vibration.vibrate(6);
    } catch {}

    if (!targetChapter) {
      showToast({ title: "No chapters available yet" });
      return;
    }

    const accessCheck = canUserAccessChapter(user, targetChapter.for ?? 0);
    if (!accessCheck.allowed) {
      showToast({
        title: accessCheck.reason || "Upgrade your subscription to access this content.",
      });
      return;
    }

    const targetId = String(targetChapter._id || targetChapter.id);
    const mediaType = targetChapter.type ?? "pdf";

    if (mediaType === "pdf") {
      navigation.navigate("ReadBook", {
        bookId: targetId,
        initialBookData: targetChapter,
        showQnaRequirementToast: true,
      } as any);
    } else {
      navigation.navigate("AudioRdr", {
        bookId: targetId,
        initialBookData: targetChapter,
        showQnaRequirementToast: true,
      } as any);
    }
  };

  // Share Handler
  const handleShare = async () => {
    try {
      await Share.share({
        title: seriesData?.title || "Readapt Series",
        message: `Check out "${seriesData?.title}" on Readapt! Build actionable skills with curated series.`,
      });
    } catch {}
  };

  // Real Joined Members list parsed from seriesData.joinedBy
  const memberList = useMemo(() => {
    const rawJoined = seriesData?.joinedBy || [];
    const list: Array<{
      id: string;
      name: string;
      username: string;
      image?: string;
      isCurrentUser?: boolean;
    }> = [];

    rawJoined.forEach((m: any, idx: number) => {
      if (!m) return;
      if (typeof m === "object") {
        const id = String(m._id || m.id || idx);
        const name = m.name || "Learner";
        const username = String(m.userId || m.username || name.toLowerCase().replace(/\s+/g, ""));
        const image = m.image || m.avatar || m.pp || "";
        const isCurrent =
          Boolean(user?._id && String(user._id) === id) ||
          Boolean(user?.userId && user.userId === username);

        list.push({
          id,
          name,
          username,
          image,
          isCurrentUser: isCurrent,
        });
      }
    });

    return list;
  }, [seriesData?.joinedBy, user?._id, user?.userId]);

  // Current User Card data for top of list (if user is joined)
  const currentUserData = useMemo(() => {
    if (!isJoined || !user) return null;
    return {
      id: String(user._id || "current-user"),
      name: user.name || "You",
      username: String(user.userId || user.name?.toLowerCase().replace(/\s+/g, "") || "you"),
      image: user.image || "",
    };
  }, [isJoined, user]);

  // Other members excluding current user to prevent duplicates
  const otherMembers = useMemo(() => {
    return memberList.filter((m) => !m.isCurrentUser);
  }, [memberList]);

  // Total count of joined learners: strictly the real number of joined users
  const totalJoinedCount = useMemo(() => {
    const rawJoined = seriesData?.joinedBy;
    if (Array.isArray(rawJoined)) {
      const currentUserId = user?._id ? String(user._id) : null;
      const userInRaw = currentUserId && rawJoined.some((m: any) =>
        typeof m === "object" ? String(m._id) === currentUserId : String(m) === currentUserId
      );

      // If user is currently joined locally but not yet present in rawJoined array
      if (isJoined && !userInRaw) {
        return rawJoined.length + 1;
      }
      return rawJoined.length;
    }
    return isJoined ? 1 : 0;
  }, [seriesData?.joinedBy, isJoined, user?._id]);

  if (!seriesData && !isConnected) {
    return (
      <View style={[styles.body, { paddingTop: insets.top + 60, alignItems: "center" }]}>
        <Offline />
      </View>
    );
  }

  if (loading && !seriesData) {
    return (
      <View style={[styles.body, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  const progressPercent = Math.round((completeChapters / Math.max(1, totalChapters)) * 100);

  return (
    <GestureHandlerRootView style={styles.body}>
      {/* ============================================================ */}
      {/* TOP HEADER NAVIGATION                                         */}
      {/* ============================================================ */}
      <View style={[styles.topHeader, { paddingTop: Math.max(insets.top + 6, 20) }]}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackIcon />
        </TouchableOpacity>

        <Text style={styles.headerTitleText}>
          {isFramework ? "Framework Series" : "Series"}
        </Text>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            activeOpacity={0.7}
            onPress={handleShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ShareIcon />
          </TouchableOpacity>

          {/* Exit icon only for users who are currently joined in this series */}
          {isJoined && (
            <TouchableOpacity
              style={styles.headerIconBtn}
              activeOpacity={0.7}
              onPress={openExitSheet}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ExitDoorIcon />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ============================================================ */}
      {/* SCROLLABLE MAIN CONTENT BODY                                 */}
      {/* ============================================================ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isJoined ? insets.bottom + 60 : insets.bottom + 100 },
        ]}
      >
        {/* 1. HERO COVER: Full-width edge-to-edge, NO box container, NO border radius */}
        <View style={styles.heroCoverWrapper}>
          <CachedImage
            uri={
              isRenderableUrl(seriesData?.cover)
                ? getOptimizedThumb(seriesData?.cover, 800, 500)
                : null
            }
            label={seriesData?.title}
            style={styles.heroCoverImage}
            letterSize={110}
            priority="high"
          />
          <LinearGradient
            colors={["transparent", "rgba(9, 3, 20, 0.4)", "#090314"]}
            locations={[0, 0.55, 1]}
            style={styles.heroGradientOverlay}
          />

          <View style={styles.heroFloatingDetails}>
            <Text style={styles.heroSeriesTitle} numberOfLines={2}>
              {seriesData?.title}
            </Text>
            <Text style={styles.heroAuthorText}>
              {seriesData?.author || "READAPT"}
            </Text>
          </View>
        </View>

        {/* 2. STATS & BADGE ROW (Matches Image 1 - NO star rating!) */}
        <View style={styles.statsRowContainer}>
          <View style={styles.statsInfoLeft}>
            {/* Chapters / Levels Pill */}
            <View style={styles.statPill}>
              <BookIcon color="#94a3b8" />
              <Text style={styles.statPillText}>
                {totalChapters} {isFramework ? "Levels" : "Chapters"}
              </Text>
            </View>

            {/* Joined Count Pill: Clickable ONLY if user has joined this series */}
            <TouchableOpacity
              style={[styles.statPill, !isJoined && styles.joinedBadgeDisabled]}
              activeOpacity={isJoined ? 0.7 : 1}
              onPress={isJoined ? openMembersSheet : undefined}
              disabled={!isJoined}
            >
              <UsersIcon color={isJoined ? accentColor : "#94a3b8"} />
              <Text
                style={[
                  styles.statPillText,
                  isJoined && { color: accentColor },
                ]}
              >
                {formatCompactNumber(totalJoinedCount)} joined
              </Text>
            </TouchableOpacity>
          </View>

          {/* Type Badge (Right) */}
          {isFramework ? (
            <View style={styles.frameworkPurpleBadge}>
              <Text style={styles.frameworkBadgeText}>Framework</Text>
            </View>
          ) : (
            <View style={styles.seriesGreenBadge}>
              <Text style={styles.seriesBadgeText}>Series</Text>
            </View>
          )}
        </View>

        {/* 3. IF NOT JOINED: ABOUT CARD WITH LOCKED NOTICE (Matches Image 1) */}
        {!isJoined && (
          <View style={styles.aboutCardContainer}>
            <Text style={styles.aboutCardTitle}>
              About This {isFramework ? "Framework" : "Series"}
            </Text>
            <Text style={styles.aboutCardDescription}>
              {seriesData?.description || "Curated lessons to build actionable mastery."}
            </Text>

            <View style={styles.cardDivider} />

            {/* Locked Notice Box */}
            <View style={styles.lockedNoticeBox}>
              <LockSmallIcon />
              <Text style={styles.lockedNoticeText}>
                {totalChapters} Locked {isFramework ? "Levels" : "Chapters"}. Join the series to unlock and start learning.
              </Text>
            </View>
          </View>
        )}

        {/* 4. IF JOINED: PROGRESS CARD & TABS */}
        {isJoined && (
          <>
            {completeChapters === 0 ? (
              /* Fresh User (0 completed): NO progress bar UI, NO play icon. Clean heading & chapter row */
              <TouchableOpacity
                style={[
                  styles.freshStartCard,
                  { borderColor: isFramework ? "rgba(56, 189, 248, 0.25)" : "rgba(45, 212, 191, 0.25)" },
                ]}
                activeOpacity={0.8}
                onPress={() => handleStartChapter(firstChapter)}
              >
                <View style={styles.freshStartLeft}>
                  <Text
                    style={[
                      styles.freshHeadingText,
                      { color: accentColor },
                    ]}
                  >
                    {isFramework ? "Level 1" : "Chapter 1"}
                  </Text>
                  <Text style={styles.freshChapterNameText} numberOfLines={1}>
                    {firstChapter?.title || "Introduction"}
                  </Text>
                </View>
                <ChevronRightIcon color={accentColor} size={20} />
              </TouchableOpacity>
            ) : (
              /* Started Progress Card: Clean crisp border radius, expanded bottom with level name, Q&A ratio, chevron */
              <View
                style={[
                  styles.progressCardContainer,
                  {
                    borderColor: isFramework
                      ? "rgba(56, 189, 248, 0.2)"
                      : "rgba(45, 212, 191, 0.2)",
                  },
                ]}
              >
                {/* Top Progress Info */}
                <View style={styles.progressTextRow}>
                  <Text style={styles.progressRatioText}>
                    {completeChapters} of {totalChapters}{" "}
                    <Text style={{ color: accentColor, fontWeight: "700" }}>
                      {isFramework ? "levels" : "chapters"}
                    </Text>{" "}
                    complete
                  </Text>
                  <Text style={[styles.progressPercentText, { color: accentColor }]}>
                    {progressPercent}%
                  </Text>
                </View>

                {/* Crisp Progress Bar Track (no sloppy curvy borders) */}
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${progressPercent}%`,
                        backgroundColor: accentColor,
                      },
                    ]}
                  />
                </View>

                {/* Expanded Bottom Row: Current Level Name, Q&A status, Chevron */}
                <TouchableOpacity
                  style={styles.progressExpandedBottom}
                  activeOpacity={0.7}
                  onPress={() => handleStartChapter(currentActiveChapter)}
                >
                  <View style={styles.expandedBottomLeft}>
                    <View style={styles.progressTagRow}>
                      <Text style={[styles.expandedLevelTag, { color: accentColor }]}>
                        {isSeriesFullyCompleted
                          ? (isFramework ? `Level ${totalChapters}` : `Chapter ${totalChapters}`)
                          : (isFramework ? `Level ${currentActiveIdx + 1}` : `Chapter ${currentActiveIdx + 1}`)}
                      </Text>
                      {(isCurrentActiveCompleted || isSeriesFullyCompleted) && (
                        <View style={styles.progressCompletedBadge}>
                          <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                            <Circle cx="12" cy="12" r="10" fill="#10b981" />
                            <Path
                              d="M8 12.5l2.5 2.5L16 9"
                              stroke="#ffffff"
                              strokeWidth={2.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </Svg>
                          <Text style={styles.progressCompletedBadgeText}>Completed</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.expandedLevelTitle} numberOfLines={1}>
                      {currentActiveChapter?.title || "Continue journey"}
                    </Text>
                    <Text style={styles.expandedQnaText}>
                      {isSeriesFullyCompleted
                        ? "All levels completed"
                        : isCurrentActiveCompleted
                        ? `Q&A ${totalActiveQuestions}/${totalActiveQuestions} completed`
                        : `Q&A ${currentChapterAttemptedCount}/${totalActiveQuestions || 3} attempted`}
                    </Text>
                  </View>
                  <ChevronRightIcon color={accentColor} size={18} />
                </TouchableOpacity>
              </View>
            )}

            {/* TABS NAVIGATION */}
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === "chapters" && styles.tabBtnActive]}
                activeOpacity={0.7}
                onPress={() => setActiveTab("chapters")}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === "chapters" && { color: accentColor, fontWeight: "700" },
                  ]}
                >
                  {isFramework ? "Levels" : "Chapters"}
                </Text>
                {activeTab === "chapters" && (
                  <View style={[styles.tabIndicator, { backgroundColor: accentColor }]} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === "about" && styles.tabBtnActive]}
                activeOpacity={0.7}
                onPress={() => setActiveTab("about")}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === "about" && { color: accentColor, fontWeight: "700" },
                  ]}
                >
                  About
                </Text>
                {activeTab === "about" && (
                  <View style={[styles.tabIndicator, { backgroundColor: accentColor }]} />
                )}
              </TouchableOpacity>
            </View>

            {/* TAB 1: 2-COLUMNS GRID FOR CHAPTERS / LEVELS */}
            {activeTab === "chapters" && (
              <>
                <View style={styles.chaptersGridContainer}>
                  {chapterItems.map((item, index) => {
                    const raw = item?.content;
                    const chapterData: any = typeof raw === "object" ? raw : item;
                    const prevItem = index > 0 ? chapterItems[index - 1] : null;
                    const prevRaw = prevItem?.content;
                    const prevId = String(
                      (typeof prevRaw === "object" ? (prevRaw as any)?._id || (prevRaw as any)?.id : prevRaw) || ""
                    );
                    // Sequential level locking: Level 1 always unlocked. Level N locked until Level N-1 is completed!
                    const isLocked = isFramework && index > 0 && (!prevId || !completedChapterIds.includes(prevId));
                    const isCompleted = completedChapterIds.includes(
                      String(chapterData?._id || chapterData?.id || "")
                    );

                    return (
                      <ContentCard
                        key={chapterData?._id || index}
                        book={{
                          ...chapterData,
                          series: seriesData?._id || seriesData,
                        }}
                        index={index}
                        seriesType={isFramework ? "framework" : "normal"}
                        isFramework={isFramework}
                        isLocked={isLocked}
                        isCompleted={isCompleted}
                      />
                    );
                  })}
                </View>

                {/* RECOMMENDATION CARD AT BOTTOM WHEN ALL LEVELS COMPLETED */}
                {completeChapters >= chapterItems.length && chapterItems.length > 0 && (
                  <View style={styles.recommendationSection}>
                    <View style={styles.recommendationHeader}>
                      <View style={[styles.recommendationBadge, { backgroundColor: `${accentColor}18` }]}>
                        <Text style={[styles.recommendationBadgeText, { color: accentColor }]}>
                          Curriculum Mastered
                        </Text>
                      </View>
                      <Text style={styles.recommendationTitle}>
                        Recommended Next Read
                      </Text>
                      <Text style={styles.recommendationSubtitle}>
                        {seriesData?.recommendationText ||
                          `You've mastered all ${chapterItems.length} levels! Continue growing with this curated recommendation.`}
                      </Text>
                    </View>

                    {loadingRecommendedBook ? (
                      <View style={styles.recBookCardLoading}>
                        <ActivityIndicator size="small" color={accentColor} />
                        <Text style={styles.recLoadingText}>Finding next recommendation...</Text>
                      </View>
                    ) : recommendedBook ? (
                      <View style={styles.recommendedBookCard}>
                        <CachedImage
                          uri={
                            isRenderableUrl(recommendedBook.cover)
                              ? getOptimizedThumb(recommendedBook.cover, 300, 420)
                              : null
                          }
                          label={recommendedBook.title}
                          style={styles.recommendedBookCover}
                          letterSize={30}
                        />
                        <View style={styles.recommendedBookDetails}>
                          <View style={styles.recTypeBadge}>
                            <Text style={[styles.recTypeBadgeText, { color: accentColor }]}>
                              {recommendedBook.type === "audio" ? "AUDIO BOOK" : "BOOK"}
                            </Text>
                          </View>
                          <Text style={styles.recommendedBookTitle} numberOfLines={2}>
                            {recommendedBook.title}
                          </Text>
                          <Text style={styles.recommendedBookAuthor} numberOfLines={1}>
                            {recommendedBook.author || "READAPT"}
                          </Text>

                          <TouchableOpacity
                            style={[styles.recStartButton, { backgroundColor: accentColor }]}
                            activeOpacity={0.8}
                            onPress={() => handleStartChapter(recommendedBook)}
                          >
                            <Text style={styles.recStartButtonText}>
                              {recommendedBook.type === "audio" ? "Start Listening" : "Read Book"}
                            </Text>
                            <ChevronRightIcon color="#090314" size={16} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )}
              </>
            )}

            {/* TAB 2: ABOUT TAB CONTENT */}
            {activeTab === "about" && (
              <View style={styles.aboutTabWrapper}>
                <Text style={styles.aboutSectionHeading}>
                  About This {isFramework ? "Framework" : "Series"}
                </Text>
                <Text style={styles.aboutDescriptionText}>
                  {seriesData?.description ||
                    "This curated series provides practical frameworks, structured lessons, and actionable insights to help you build real mastery."}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ============================================================ */}
      {/* 5. FIXED BOTTOM JOIN BUTTON (When NOT joined, matches Image 1) */}
      {/* ============================================================ */}
      {!isJoined && (
        <View style={[styles.bottomBarFixed, { paddingBottom: Math.max(insets.bottom + 8, 18) }]}>
          <TouchableOpacity
            style={[
              styles.bottomJoinBtn,
              { backgroundColor: isFramework ? "#38bdf8" : "#00d2a0" },
            ]}
            activeOpacity={0.85}
            onPress={handleJoinPress}
          >
            <Text style={styles.bottomJoinBtnText}>
              Join the {isFramework ? "framework" : "series"} and start learning
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ============================================================ */}
      {/* 6. SWITCH SERIES BOTTOM SHEET (Clean Black Theme, Draggable) */}
      {/* ============================================================ */}
      {isSwitchSheetVisible && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={styles.sheetBackdrop} onPress={closeSwitchSheet} />
          <GestureDetector gesture={switchSheetGesture}>
            <Animated.View style={[styles.bottomSheetPanel, switchSheetAnimatedStyle]}>
              <View style={styles.sheetDragHandle} />

              <View style={styles.sheetHeaderIconWrap}>
                <AlertTriangleIcon />
              </View>

              <Text style={styles.sheetTitle}>Switch Active Series?</Text>
              <Text style={styles.sheetMessage}>
                You are currently enrolled in{" "}
                <Text style={{ color: accentColor, fontWeight: "700" }}>
                  "{joinedSeriesTitle || "another series"}"
                </Text>
                . By joining{" "}
                <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                  "{seriesData?.title}"
                </Text>
                , you will exit from your current active series. Your progress is saved.
              </Text>

              <View style={styles.sheetActionsRow}>
                <TouchableOpacity
                  style={styles.sheetDismissBtn}
                  activeOpacity={0.7}
                  onPress={closeSwitchSheet}
                >
                  <Text style={styles.sheetDismissBtnText}>Dismiss</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetContinueBtn, { backgroundColor: accentColor }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    closeSwitchSheet();
                    executeJoinSeries();
                  }}
                >
                  <Text style={styles.sheetContinueBtnText}>Continue & Switch</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      )}

      {/* ============================================================ */}
      {/* 7. EXIT SERIES CONFIRMATION SHEET (Clean Black Theme, Draggable) */}
      {/* ============================================================ */}
      {isExitSheetVisible && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={styles.sheetBackdrop} onPress={closeExitSheet} />
          <GestureDetector gesture={exitSheetGesture}>
            <Animated.View style={[styles.bottomSheetPanel, exitSheetAnimatedStyle]}>
              <View style={styles.sheetDragHandle} />

              <View style={[styles.sheetHeaderIconWrap, { backgroundColor: "rgba(239, 68, 68, 0.12)" }]}>
                <ExitDoorIcon />
              </View>

              <Text style={styles.sheetTitle}>Exit Series?</Text>
              <Text style={styles.sheetMessage}>
                Are you sure you want to exit{" "}
                <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                  "{seriesData?.title}"
                </Text>
                ? Your progress and completed Q&A will remain intact, but you won't be actively enrolled.
              </Text>

              <View style={styles.sheetActionsRow}>
                <TouchableOpacity
                  style={styles.sheetDismissBtn}
                  activeOpacity={0.7}
                  onPress={closeExitSheet}
                >
                  <Text style={styles.sheetDismissBtnText}>Dismiss</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetContinueBtn, { backgroundColor: "#ef4444" }]}
                  activeOpacity={0.8}
                  onPress={executeExitSeries}
                >
                  <Text style={[styles.sheetContinueBtnText, { color: "#ffffff" }]}>Exit Series</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      )}

      {/* ============================================================ */}
      {/* 8. JOINED MEMBERS BOTTOM SHEET (Clean Flat Rows, No Cards)   */}
      {/* ============================================================ */}
      {isMembersSheetVisible && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={styles.sheetBackdrop} onPress={closeMembersSheet} />
          <Animated.View style={[styles.membersBottomSheetPanel, membersSheetAnimatedStyle]}>
            {/* Top Draggable Area (Handle + Header, No close icon) */}
            <GestureDetector gesture={membersSheetGesture}>
              <View style={styles.sheetTopDragArea}>
                <View style={styles.sheetHandleContainer}>
                  <View style={styles.membersSheetDragHandle} />
                </View>

                <View style={styles.membersSheetHeader}>
                  <View style={styles.membersSheetHeaderLeft}>
                    <Text style={styles.membersSheetTitle}>Joined Members</Text>
                    <View style={[styles.membersTotalPill, { backgroundColor: `${accentColor}18` }]}>
                      <Text style={[styles.membersTotalText, { color: accentColor }]}>
                        {formatCompactNumber(totalJoinedCount)} Members
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </GestureDetector>

            {/* Members Flat Row List (No cards, no colored borders) */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.membersVerticalListContent,
                { paddingBottom: Math.max(insets.bottom + 20, 36) },
              ]}
            >
              {/* Top "You" Row: Pure flat row with pp, name, username, and YOU tag */}
              {currentUserData && (
                <View style={styles.memberRowItem}>
                  <View style={styles.avatarWrap}>
                    <CachedImage
                      uri={currentUserData.image}
                      label={currentUserData.name}
                      style={styles.memberAvatarImg}
                      letterSize={15}
                      transition={0}
                      placeholder={
                        <View
                          style={[
                            styles.memberAvatarFallback,
                            { backgroundColor: `${accentColor}25` },
                          ]}
                        >
                          <Text style={[styles.avatarInitialText, { color: accentColor }]}>
                            {getInitials(currentUserData.name)}
                          </Text>
                        </View>
                      }
                    />
                  </View>

                  <View style={styles.memberInfoCol}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberNameText} numberOfLines={1}>
                        {currentUserData.name}
                      </Text>
                      <View
                        style={[
                          styles.youBadgePill,
                          { backgroundColor: `${accentColor}20` },
                        ]}
                      >
                        <Text style={[styles.youBadgeText, { color: accentColor }]}>
                          YOU
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[styles.memberUsernameText, { color: accentColor }]}
                      numberOfLines={1}
                    >
                      @{currentUserData.username.replace(/^@/, "")}
                    </Text>
                  </View>
                </View>
              )}

              {/* Other Members Flat Rows: Pure flat row with pp, name, username */}
              {otherMembers.map((m) => (
                <View key={m.id} style={styles.memberRowItem}>
                  <View style={styles.avatarWrap}>
                    <CachedImage
                      uri={m.image}
                      label={m.name}
                      style={styles.memberAvatarImg}
                      letterSize={15}
                      transition={0}
                      placeholder={
                        <View style={styles.memberAvatarFallback}>
                          <Text style={styles.avatarInitialText}>
                            {getInitials(m.name)}
                          </Text>
                        </View>
                      }
                    />
                  </View>

                  <View style={styles.memberInfoCol}>
                    <Text style={styles.memberNameText} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text style={styles.memberUsernameText} numberOfLines={1}>
                      @{m.username.replace(/^@/, "")}
                    </Text>
                  </View>
                </View>
              ))}

              {/* Empty State */}
              {otherMembers.length === 0 && !currentUserData && (
                <View style={styles.emptyMembersWrap}>
                  <UsersIcon color="#64748b" />
                  <Text style={styles.emptyMembersTitle}>No learners joined yet</Text>
                  <Text style={styles.emptyMembersSubtitle}>
                    Be the first to join this {isFramework ? "framework" : "series"} and start learning!
                  </Text>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: pallete.bgmain,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#090314",
    zIndex: 20,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.1,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scrollContent: {
    paddingBottom: 60,
  },

  // 1. Hero Cover (Edge to edge, no side margins, no box container, no border radius)
  heroCoverWrapper: {
    width: SCREEN_WIDTH,
    height: 240,
    position: "relative",
    backgroundColor: "#131927",
  },
  heroCoverImage: {
    width: "100%",
    height: "100%",
  },
  heroGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroFloatingDetails: {
    position: "absolute",
    bottom: 16,
    left: 18,
    right: 18,
  },
  heroSeriesTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 30,
    letterSpacing: 0.2,
  },
  heroAuthorText: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 4,
    fontWeight: "500",
  },

  // 2. Stats & Badge Row (Matches Image 1)
  statsRowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingHorizontal: 18,
  },
  statsInfoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  statPillText: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#94a3b8",
  },
  joinedBadgeDisabled: {
    opacity: 0.8,
  },
  frameworkPurpleBadge: {
    backgroundColor: "#7c3aed",
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  frameworkBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  seriesGreenBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  seriesBadgeText: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "700",
  },

  // 3. About Card (Matches Image 1 when NOT joined)
  aboutCardContainer: {
    backgroundColor: "#111625",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 18,
    marginHorizontal: 18,
    marginTop: 16,
  },
  aboutCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 6,
  },
  aboutCardDescription: {
    fontSize: 14,
    color: "#cbd5e1",
    lineHeight: 22,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    marginVertical: 16,
  },
  lockedNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 12.5,
    color: "#94a3b8",
    lineHeight: 18,
    textAlign: "center",
  },

  // Fixed Bottom Bar & Join Button (Matches Image 1)
  bottomBarFixed: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#090314",
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    zIndex: 30,
  },
  bottomJoinBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  bottomJoinBtnText: {
    color: "#090314",
    fontSize: 15.5,
    fontWeight: "700",
  },

  // Fresh Start Card (Clean modern border radius, no play icon, heading text)
  freshStartCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111625",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 18,
    marginTop: 18,
    borderWidth: 1,
  },
  freshStartLeft: {
    flex: 1,
    marginRight: 12,
  },
  freshHeadingText: {
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  freshChapterNameText: {
    fontSize: 14.5,
    fontWeight: "600",
    color: "#ffffff",
  },

  // Progress Card Container (Crisp modern border radius)
  progressCardContainer: {
    backgroundColor: "#111625",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 18,
    marginTop: 18,
    borderWidth: 1,
  },
  progressTextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressRatioText: {
    fontSize: 13.5,
    color: "#ffffff",
    fontWeight: "500",
  },
  progressPercentText: {
    fontSize: 13,
    fontWeight: "700",
  },
  progressBarTrack: {
    width: "100%",
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressExpandedBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  expandedBottomLeft: {
    flex: 1,
    marginRight: 10,
  },
  progressTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  progressCompletedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  progressCompletedBadgeText: {
    color: "#10b981",
    fontSize: 10.5,
    fontWeight: "700",
  },
  expandedLevelTag: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  expandedLevelTitle: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#ffffff",
    marginTop: 1,
  },
  expandedQnaText: {
    fontSize: 11.5,
    color: "#94a3b8",
    marginTop: 2,
    fontWeight: "500",
  },

  // Tabs Row
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  tabBtn: {
    paddingVertical: 12,
    marginRight: 28,
    position: "relative",
  },
  tabBtnActive: {},
  tabBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
  },
  tabIndicator: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 2.5,
    borderRadius: 2,
  },

  // 2-Columns Grid Container for Chapters/Levels
  chaptersGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // About Tab Content (When Joined)
  aboutTabWrapper: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  aboutSectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
  },
  aboutDescriptionText: {
    fontSize: 14,
    color: "#cbd5e1",
    lineHeight: 22,
    letterSpacing: 0.1,
  },

  // Bottom Sheets (Pure dark black aesthetic, smooth timing)
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  bottomSheetPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0d0718",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 38 : 24,
    alignItems: "center",
    zIndex: 100,
  },
  sheetDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginBottom: 18,
  },
  sheetHeaderIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
    textAlign: "center",
  },
  sheetMessage: {
    fontSize: 13.5,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
  },
  sheetActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  sheetDismissBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  sheetDismissBtnText: {
    color: "#ffffff",
    fontSize: 14.5,
    fontWeight: "600",
  },
  sheetContinueBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetContinueBtnText: {
    color: "#090314",
    fontSize: 14.5,
    fontWeight: "700",
  },

  // Members Bottom Sheet
  membersBottomSheetPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.72,
    backgroundColor: "#0d0718",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    zIndex: 100,
    overflow: "hidden",
  },
  sheetTopDragArea: {
    width: "100%",
    backgroundColor: "#0d0718",
  },
  sheetHandleContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
  membersSheetDragHandle: {
    width: 42,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    alignSelf: "center",
  },
  membersSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  membersSheetHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  membersSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  membersTotalPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  membersTotalText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  membersVerticalListContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  memberRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  avatarWrap: {
    position: "relative",
  },
  memberAvatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1f2937",
  },
  memberAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  memberInfoCol: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberNameText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  youBadgePill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  youBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  memberUsernameText: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
    fontWeight: "500",
  },
  emptyMembersWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyMembersTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#cbd5e1",
    marginTop: 6,
  },
  emptyMembersSubtitle: {
    fontSize: 12.5,
    color: "#64748b",
    textAlign: "center",
    maxWidth: 240,
    lineHeight: 18,
  },
  recommendationSection: {
    marginTop: 28,
    marginBottom: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  recommendationHeader: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  recommendationBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  recommendationBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  recommendationTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  recommendationSubtitle: {
    fontSize: 12.5,
    color: "#94a3b8",
    lineHeight: 18,
  },
  recommendedBookCard: {
    flexDirection: "row",
    backgroundColor: "#111625",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },
  recommendedBookCover: {
    width: 80,
    height: 112,
    borderRadius: 8,
    backgroundColor: "#1f2937",
  },
  recommendedBookDetails: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },
  recTypeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  recTypeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  recommendedBookTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: 20,
    marginBottom: 4,
  },
  recommendedBookAuthor: {
    fontSize: 12.5,
    color: "#94a3b8",
    fontWeight: "500",
    marginBottom: 10,
  },
  recStartButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: "flex-start",
    gap: 4,
  },
  recStartButtonText: {
    color: "#090314",
    fontSize: 13,
    fontWeight: "700",
  },
  recBookCardLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111625",
    borderRadius: 14,
    paddingVertical: 28,
    marginHorizontal: 20,
    marginTop: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  recLoadingText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "500",
  },
});
