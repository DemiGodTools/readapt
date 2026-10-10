import { useSafeAreaInsets } from "react-native-safe-area-context";
import Pdf, { Source } from "react-native-pdf";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
  Share,
  BackHandler,
  PanResponder,
  ScrollView,
} from "react-native";
import Svg, { Path, Line, Circle, Polyline } from "react-native-svg";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import pallete from "../../lib/Colors";
import { api } from "../../lib/api";
import useAuth from "../../hooks/useAuth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IRecentRead } from "../../types/Storage";
import PopButton from "../../components/props/PopButton";
import { useToast } from "../../hooks/useToast";
import { useUser } from "../../hooks/useUser";
import CommentsDrawer from "../../components/props/Comments";
import { SubscriptionPlan } from "../../enums";
import * as FileSystem from "expo-file-system/legacy";
import { useDownloads } from "../../hooks/useDownloads";
import NextChapter from "../../components/props/NextChapter";
import ContentCard from "../../components/props/ContentCard";
import { checkIsDownloaded, getSingleDownloaded } from "../../lib/downloadManager";
import Offline from "../../components/state/Offline";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { useGlobalAudio } from "../../hooks/useGlobalAudio";
import QuestionCard from "../../components/props/QuestionCard";
import { IQuestion } from "../../types/Question";
import { ISeries, ISeriesContent } from "../../types/Series";
import Carousel from "react-native-reanimated-carousel";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const MORPH_DISTANCE = 120;
const CONTAINER_PADDING_TOP = 75;
const SCROLLVIEW_MARGIN_TOP = 20;
const PLAYER_CONTAINER_PADDING = 16;
const PDF_FRAME_MARGIN_TOP = 12;
const CARD_SCALE = 0.62;
const CARD_WIDTH = SCREEN_WIDTH * CARD_SCALE;
const CARD_HEIGHT = SCREEN_HEIGHT * CARD_SCALE;
const CARD_RADIUS = 12;
const CARD_HORIZONTAL_MARGIN =
  (SCREEN_WIDTH - PLAYER_CONTAINER_PADDING * 2 - CARD_WIDTH) / 2;
const SHEET_HEIGHT = 400;
const TOC_WIDTH = Math.min(SCREEN_WIDTH * 0.84, 350);

type AnnotationTool = "marker" | "highlighter";

type AnnotationPoint = {
  x: number;
  y: number;
};

type AnnotationStroke = {
  tool: AnnotationTool;
  color: string;
  opacity: number;
  strokeWidth: number;
  points: AnnotationPoint[];
};

type ChapterAnnotations = {
  contentId: string;
  pages: {
    [page: string]: AnnotationStroke[];
  };
};

const ANNOTATION_COLORS = [
  { id: "teal", value: "#00D2B4" },
  { id: "yellow", value: "#FFD84D" },
  { id: "pink", value: "#FF5376" },
  { id: "black", value: "#000000" },
];

type Props = {
  route: {
    params: {
      bookId: string;
      page?: number;
      initialPage?: number;
      startPage?: number;
    };
  };
  navigation: any;
};

type BookPopulated = {
  _id: string;
  title: string;
  details?: string;
  media: string;
  type: "pdf" | "audio";
  for: SubscriptionPlan;
  isTrending: boolean;
  comments: {
    _id: string;
    by: {
      _id: string;
      name?: string;
      username?: string;
      avatar?: string;
    };
    text: string;
    createdAt: string;
  }[];
  cover: string;
  category: any;
  series?: any;
  likes: number;
  author: string;
  total: number;
  isDownloadable: boolean;
  toc: {
    cut: string;
    title: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
};

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const isStrictlyStandaloneBook = (item: any): boolean => {
  if (!item || !item._id) return false;
  if (item.contentModel && item.contentModel !== "Chapter") return false;
  if (item.series) {
    if (typeof item.series === "string" && item.series.trim() !== "") return false;
    if (typeof item.series === "object") {
      if (item.series._id) return false;
      if (Object.keys(item.series).length > 0) return false;
    }
  }
  if (item.seriesId && String(item.seriesId).trim() !== "") return false;
  if (item.isSeriesContent || item.isSeriesChapter) return false;
  return true;
};

// --- SCROLLABLE & SWIPEABLE TOC DRAWER ---
interface TocDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  toc: { cut: string; title: string }[] | undefined;
  onSelectPage: (page: number) => void;
}

const TocDrawer = ({ isOpen, onClose, toc, onSelectPage }: TocDrawerProps) => {
  const insets = useSafeAreaInsets();
  const translateX = useSharedValue(TOC_WIDTH);

  useEffect(() => {
    if (isOpen) {
      translateX.value = withTiming(0, { duration: 180 });
    } else {
      translateX.value = withTiming(TOC_WIDTH, { duration: 160 });
    }
  }, [isOpen]);

  const handleClose = () => {
    translateX.value = withTiming(TOC_WIDTH, { duration: 160 }, () => {
      runOnJS(onClose)();
    });
  };

  const panGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationX > 0) {
        translateX.value = event.translationX;
      }
    })
    .onEnd((event) => {
      if (event.translationX > 60 || event.velocityX > 350) {
        runOnJS(handleClose)();
      } else {
        translateX.value = withTiming(0, { duration: 120 });
      }
    });

  const animatedDrawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!isOpen) return null;

  return (
    <View style={styles.overlayRootContainer} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.tocBackdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[
            styles.tocSideSheet,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
            animatedDrawerStyle,
          ]}>
          <View style={styles.tocDragIndicator} />
          <Text style={styles.tocHeader}>TABLE OF CONTENTS</Text>
          <ScrollView
            style={styles.tocScrollContainer}
            contentContainerStyle={styles.tocListContent}
            showsVerticalScrollIndicator={false}>
            {toc && toc.length > 0 ? (
              toc.map((ch, i) => (
                <PopButton
                  key={i}
                  styles={styles.tocChip}
                  onPress={() => {
                    const target = Number(ch.cut);
                    if (!isNaN(target)) {
                      onSelectPage(target);
                    }
                    handleClose();
                  }}>
                  <Text style={styles.chipName} numberOfLines={2}>
                    {ch.title}
                  </Text>
                  <View style={styles.chipPageWrapper}>
                    <Text style={styles.chipPage}>P. {String(ch.cut)}</Text>
                  </View>
                </PopButton>
              ))
            ) : (
              <Text style={{ color: pallete.textgray, textAlign: "center", marginTop: 24 }}>
                No chapters listed
              </Text>
            )}
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
};

// --- CHAPTER DETAILS PANEL ---
interface ChapterDetailsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  book: BookPopulated | null;
  totalPages: number;
}

const ChapterDetailsPanel = ({
  isOpen,
  onClose,
  book,
  totalPages,
}: ChapterDetailsPanelProps) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SHEET_HEIGHT);

  useEffect(() => {
    if (isOpen) {
      translateY.value = withTiming(0, { duration: 200 });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, { duration: 160 });
    }
  }, [isOpen]);

  const handleClose = () => {
    translateY.value = withTiming(SHEET_HEIGHT, { duration: 160 }, () => {
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
      if (event.translationY > 60 || event.velocityY > 400) {
        runOnJS(handleClose)();
      } else {
        translateY.value = withTiming(0, { duration: 150 });
      }
    });

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!isOpen) return null;

  const publishedDate = book?.createdAt
    ? new Date(book.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Recent";

  const authorName =
    book?.author && book.author.trim() !== "" ? book.author : "Readapt Creator";

  return (
    <View style={styles.overlayRootContainer} pointerEvents="box-none">
      <TouchableOpacity
        style={panelStyles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
      <GestureDetector gesture={dragGesture}>
        <Reanimated.View
          style={[
            panelStyles.detailsPanel,
            { paddingBottom: insets.bottom + 24 },
            animatedStyles,
          ]}>
          <View style={panelStyles.dragHandle} />
          <Text style={panelStyles.panelHeading} numberOfLines={1}>
            {book?.title || "Chapter Overview"}
          </Text>
          <View style={panelStyles.authorRow}>
            <Text style={panelStyles.authorLabel}>By</Text>
            <Text style={panelStyles.authorNameVal}>{authorName}</Text>
          </View>
          <View style={panelStyles.panelSRow}>
            <View style={panelStyles.pItem}>
              <Text style={panelStyles.pVal}>{totalPages || book?.total || 1}</Text>
              <Text style={panelStyles.pLabel}>Pages</Text>
            </View>
            <View style={panelStyles.pDivider} />
            <View style={panelStyles.pItem}>
              <Text style={panelStyles.pVal}>{book?.likes || 0}</Text>
              <Text style={panelStyles.pLabel}>Likes</Text>
            </View>
            <View style={panelStyles.pDivider} />
            <View style={panelStyles.pItem}>
              <Text style={panelStyles.pVal}>{book?.comments?.length || 0}</Text>
              <Text style={panelStyles.pLabel}>Comments</Text>
            </View>
            <View style={panelStyles.pDivider} />
            <View style={panelStyles.pItem}>
              <Text style={panelStyles.pVal}>{publishedDate}</Text>
              <Text style={panelStyles.pLabel}>Published</Text>
            </View>
          </View>
          <ScrollView
            style={panelStyles.descScroll}
            showsVerticalScrollIndicator={false}>
            <Text style={panelStyles.descTitle}>About this Chapter</Text>
            <Text style={panelStyles.panelDescription}>
              {book?.details || "No detailed description has been added for this chapter yet."}
            </Text>
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
};

const BookReaderScreen = ({ route, navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);
  const scrollY = useRef(new Animated.Value(MORPH_DISTANCE)).current;
  const borderDriver = useRef(new Animated.Value(MORPH_DISTANCE)).current;
  const currentScrollYRef = useRef(MORPH_DISTANCE);
  const scrollDirectionRef = useRef<"up" | "down" | null>(null);
  const isSnappingRef = useRef(false);

  const pdfRef = useRef<any>(null);

  const activeChapterId = route.params?.bookId || "";

  // Navigation param se target page uthayenge
  const incomingPage = Math.max(
    1,
    Number(
      (route.params as any)?.initialPage ||
      (route.params as any)?.page ||
      (route.params as any)?.startPage ||
      1
    )
  );

  const currentPageRef = useRef<number>(incomingPage);
  const [currentPage, setCurrentPage] = useState<number>(incomingPage);

  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const { user, reload } = useUser();
  const { downloadChapter } = useDownloads();
  const { removeAllTracks } = useGlobalAudio();

  const [book, setBook] = useState<BookPopulated | null>(null);
  const [seriesData, setSeriesData] = useState<ISeries | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [showPdfControls, setShowPdfControls] = useState(true);
  const { isConnected } = useNetworkStatus();
  const [commentedQueId, setCommentedQueId] = useState("");
  const [questions, setQuestions] = useState<ISeriesContent[] | null>(null);

  const [relatedStandaloneBooks, setRelatedStandaloneBooks] = useState<any[]>([]);
  const [canvasTheme, setCanvasTheme] = useState<"dark" | "light">("dark");

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadedRecently, setIsDownloadedRecently] = useState(false);

  const [isAnnotating, setIsAnnotating] = useState(false);
  const [selectedTool, setSelectedTool] = useState<AnnotationTool>("marker");
  const [selectedColor, setSelectedColor] = useState<string>(ANNOTATION_COLORS[0].value);
  const [currentPageStrokes, setCurrentPageStrokes] = useState<AnnotationStroke[]>([]);
  const [activeStrokePoints, setActiveStrokePoints] = useState<AnnotationPoint[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavedRecently, setIsSavedRecently] = useState(false);

  const [customModal, setCustomModal] = useState<{
    visible: boolean;
    title: string;
    description: string;
    confirmText: string;
    onConfirm: () => void;
  }>({
    visible: false,
    title: "",
    description: "",
    confirmText: "",
    onConfirm: () => {},
  });

  const fullHeight = SCREEN_HEIGHT + insets.top + insets.bottom;
  const cardHeight = fullHeight * CARD_SCALE;

  const targetCenterX = SCREEN_WIDTH / 2;
  const targetCenterY =
    CONTAINER_PADDING_TOP +
    SCROLLVIEW_MARGIN_TOP +
    PLAYER_CONTAINER_PADDING +
    PDF_FRAME_MARGIN_TOP +
    cardHeight / 2;

  const totalCountResolved =
    totalPages > 0 ? totalPages : book?.total && book.total > 0 ? book.total : 0;
  const pageCountLabel =
    totalCountResolved > 0
      ? `${currentPage} / ${totalCountResolved}`
      : `Page ${currentPage}`;

  useEffect(() => {
    AsyncStorage.getItem("pdf_canvas_theme")
      .then((saved) => {
        if (saved === "dark" || saved === "light") {
          setCanvasTheme(saved);
        }
      })
      .catch(() => {});
  }, []);

  const getStorageKey = useCallback((chapterId: string) => {
    return `annot_${chapterId}`;
  }, []);

  const loadAnnotationsForPage = useCallback(
    async (chapterId: string, pageNum: number) => {
      if (!chapterId) return;
      try {
        const raw = await AsyncStorage.getItem(getStorageKey(chapterId));
        if (raw) {
          const parsed: ChapterAnnotations = JSON.parse(raw);
          const pageKey = String(pageNum);
          if (parsed.pages && parsed.pages[pageKey]) {
            setCurrentPageStrokes(parsed.pages[pageKey]);
            setHasUnsavedChanges(false);
            return;
          }
        }
        setCurrentPageStrokes([]);
        setHasUnsavedChanges(false);
      } catch (e) {
        console.error("Error loading annotations:", e);
        setCurrentPageStrokes([]);
      }
    },
    [getStorageKey]
  );

  useEffect(() => {
    if (!isLocked && activeChapterId) {
      loadAnnotationsForPage(activeChapterId, currentPage);
    } else {
      setCurrentPageStrokes([]);
    }
  }, [currentPage, activeChapterId, isLocked, loadAnnotationsForPage]);

  const saveAnnotations = async () => {
    if (!activeChapterId) return;
    try {
      const key = getStorageKey(activeChapterId);
      const raw = await AsyncStorage.getItem(key);
      let data: ChapterAnnotations = raw
        ? JSON.parse(raw)
        : { contentId: activeChapterId, pages: {} };

      data.pages[String(currentPage)] = currentPageStrokes;
      await AsyncStorage.setItem(key, JSON.stringify(data));
      setHasUnsavedChanges(false);

      setIsSavedRecently(true);
      setTimeout(() => {
        setIsSavedRecently(false);
      }, 1000);
    } catch (e) {
      console.error("Failed to save annotations:", e);
    }
  };

  const handleUndo = () => {
    if (currentPageStrokes.length === 0) return;
    setCurrentPageStrokes((prev) => prev.slice(0, prev.length - 1));
    setHasUnsavedChanges(true);
  };

  const handleClear = () => {
    if (currentPageStrokes.length === 0) return;
    setCustomModal({
      visible: true,
      title: "Clear Annotations",
      description: "Are you sure you want to clear annotations from this page?",
      confirmText: "Clear Page",
      onConfirm: () => {
        setCurrentPageStrokes([]);
        setHasUnsavedChanges(true);
        setCustomModal((prev) => ({ ...prev, visible: false }));
      },
    });
  };

  const handleExitAnnotationMode = () => {
    if (hasUnsavedChanges) {
      setCustomModal({
        visible: true,
        title: "Unsaved Annotations",
        description: "You have unsaved strokes. Do you want to discard changes?",
        confirmText: "Discard",
        onConfirm: () => {
          loadAnnotationsForPage(activeChapterId, currentPage);
          setIsAnnotating(false);
          setCustomModal((prev) => ({ ...prev, visible: false }));
        },
      });
    } else {
      setIsAnnotating(false);
    }
  };

  const activeStrokeRef = useRef<{
    tool: AnnotationTool;
    color: string;
    opacity: number;
    strokeWidth: number;
    points: AnnotationPoint[];
  } | null>(null);

  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isAnnotating,
        onMoveShouldSetPanResponder: () => isAnnotating,
        onPanResponderGrant: (evt) => {
          if (!isAnnotating) return;
          const { locationX, locationY } = evt.nativeEvent;
          const normX = Math.max(0, Math.min(1, locationX / SCREEN_WIDTH));
          const normY = Math.max(0, Math.min(1, locationY / fullHeight));

          const strokeWidth = selectedTool === "highlighter" ? 22 : 3;
          const opacity = selectedTool === "highlighter" ? 0.3 : 0.95;

          const initialStroke = {
            tool: selectedTool,
            color: selectedColor,
            opacity,
            strokeWidth,
            points: [{ x: normX, y: normY }],
          };

          activeStrokeRef.current = initialStroke;
          lastPointRef.current = { x: normX, y: normY };
          setActiveStrokePoints([{ x: normX, y: normY }]);
        },
        onPanResponderMove: (evt) => {
          if (!isAnnotating || !activeStrokeRef.current || !lastPointRef.current) return;
          const { locationX, locationY } = evt.nativeEvent;
          const normX = Math.max(0, Math.min(1, locationX / SCREEN_WIDTH));
          const normY = Math.max(0, Math.min(1, locationY / fullHeight));

          const dx = normX - lastPointRef.current.x;
          const dy = normY - lastPointRef.current.y;

          if (dx * dx + dy * dy > 0.00002) {
            lastPointRef.current = { x: normX, y: normY };
            activeStrokeRef.current.points.push({ x: normX, y: normY });
            setActiveStrokePoints([...activeStrokeRef.current.points]);
          }
        },
        onPanResponderRelease: () => {
          if (!isAnnotating || !activeStrokeRef.current) return;
          const completed = activeStrokeRef.current;
          if (completed.points.length > 0) {
            setCurrentPageStrokes((prev) => [...prev, completed]);
            setHasUnsavedChanges(true);
          }
          activeStrokeRef.current = null;
          lastPointRef.current = null;
          setActiveStrokePoints([]);
        },
      }),
    [isAnnotating, selectedTool, selectedColor, fullHeight]
  );

  const handleBackAction = useCallback(() => {
    if (customModal.visible) {
      setCustomModal((prev) => ({ ...prev, visible: false }));
      return true;
    }
    if (showDetailsPanel) {
      setShowDetailsPanel(false);
      return true;
    }
    if (isTocOpen) {
      setIsTocOpen(false);
      return true;
    }
    if (isAnnotating) {
      handleExitAnnotationMode();
      return true;
    }
    if (showComments) {
      setShowComments(false);
      setCommentedQueId("");
      return true;
    }
    if (!isLocked) {
      setIsLocked(true);
      scrollRef.current?.scrollTo({
        y: MORPH_DISTANCE,
        animated: true,
      });
      return true;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return true;
    }
    return false;
  }, [
    customModal.visible,
    showDetailsPanel,
    isTocOpen,
    isAnnotating,
    showComments,
    isLocked,
    navigation,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackAction
    );
    return () => subscription.remove();
  }, [handleBackAction]);

  const resetScreenState = useCallback(() => {
    setPdfPath(null);
    setTotalPages(0);
    setCurrentPage(incomingPage);
    currentPageRef.current = incomingPage;
    setQuestions(null);
    setSeriesData(null);
    setRelatedStandaloneBooks([]);
    setIsLocked(true);
    setIsAnnotating(false);
    setShowDetailsPanel(false);
    setIsTocOpen(false);
    setCurrentPageStrokes([]);
    currentScrollYRef.current = MORPH_DISTANCE;
    scrollY.setValue(MORPH_DISTANCE);
    borderDriver.setValue(MORPH_DISTANCE);
  }, [scrollY, borderDriver, incomingPage]);

  const fetchChapter = async (targetId: string) => {
    if (!targetId || targetId === "undefined") return;

    try {
      const cached = await AsyncStorage.getItem(`cached_ch_${targetId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setBook(parsed);
        if (parsed.total) setTotalPages(parsed.total);
      } else {
        const downloaded = await getSingleDownloaded(targetId);
        if (downloaded) {
          setBook(downloaded as unknown as BookPopulated);
        }
      }
    } catch {}

    if (!isConnected || !accessToken) return;

    try {
      const chapter = await api.get(`/chapter/${targetId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (chapter?.data?.data) {
        const freshData: BookPopulated = chapter.data.data;
        setBook((prev) => {
          const effectiveLikes =
            prev && typeof prev.likes === "number" ? prev.likes : freshData.likes;
          return { ...freshData, likes: effectiveLikes };
        });
        if (freshData.total) setTotalPages(freshData.total);
        await AsyncStorage.setItem(`cached_ch_${targetId}`, JSON.stringify(freshData));

        if (freshData.series) {
          const seriesId =
            typeof freshData.series === "object"
              ? freshData.series._id
              : freshData.series;

          if (seriesId) {
            try {
              const sRes = await api.get(`/series/${seriesId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (sRes?.data?.data) {
                setSeriesData(sRes.data.data);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      console.warn("Background chapter sync error:", err?.message);
    }
  };

  useEffect(() => {
    if (activeChapterId) {
      resetScreenState();
      fetchChapter(activeChapterId);
    }
  }, [activeChapterId, accessToken, isConnected]);

  useEffect(() => {
    removeAllTracks();
  }, []);

  useEffect(() => {
    if (!book || book.series || !accessToken) {
      setRelatedStandaloneBooks([]);
      return;
    }

    let isMounted = true;

    const resolveRelatedBooks = async () => {
      try {
        const catId =
          typeof book.category === "object"
            ? book.category?._id
            : book.category;

        let rawPool: any[] = [];

        if (catId && isConnected) {
          try {
            const catRes = await api.get(`/chapter/category/${catId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (catRes?.data?.data && Array.isArray(catRes.data.data)) {
              rawPool = [...rawPool, ...catRes.data.data];
            }
          } catch {}
        }

        try {
          const storedReads = await AsyncStorage.getItem("recentReads");
          if (storedReads) {
            const parsed: IRecentRead[] = JSON.parse(storedReads);
            const contentItems = parsed.map((item) => item.content);
            rawPool = [...rawPool, ...contentItems];
          }
        } catch {}

        if (rawPool.length < 5 && isConnected) {
          try {
            const feedRes = await api.get("/chapter/trending", {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (feedRes?.data?.data && Array.isArray(feedRes.data.data)) {
              rawPool = [...rawPool, ...feedRes.data.data];
            }
          } catch {}
        }

        const strictlyStandalone = rawPool.filter((item: any) => {
          if (!isStrictlyStandaloneBook(item)) return false;
          return String(item._id) !== String(book._id);
        });

        const uniqueMap = new Map<string, any>();
        strictlyStandalone.forEach((item) => {
          uniqueMap.set(String(item._id), item);
        });
        const deduplicatedPool = Array.from(uniqueMap.values());

        if (deduplicatedPool.length === 0) {
          if (isMounted) setRelatedStandaloneBooks([]);
          return;
        }

        const sameCategoryList = deduplicatedPool.filter((item) => {
          const itemCat =
            typeof item.category === "object"
              ? item.category?._id
              : item.category;
          return catId && String(itemCat) === String(catId);
        });

        const otherCategoryList = deduplicatedPool.filter((item) => {
          const itemCat =
            typeof item.category === "object"
              ? item.category?._id
              : item.category;
          return !catId || String(itemCat) !== String(catId);
        });

        const shuffledSame = shuffleArray(sameCategoryList);
        const shuffledOther = shuffleArray(otherCategoryList);

        let finalFour: any[] = [];
        if (shuffledSame.length >= 4) {
          finalFour = shuffledSame.slice(0, 4);
        } else {
          finalFour = [
            ...shuffledSame,
            ...shuffledOther.slice(0, 4 - shuffledSame.length),
          ];
        }

        const finalDisplay = shuffleArray(finalFour);

        if (isMounted) {
          setRelatedStandaloneBooks(finalDisplay);
        }
      } catch (err) {
        if (isMounted) setRelatedStandaloneBooks([]);
      }
    };

    resolveRelatedBooks();
    return () => {
      isMounted = false;
    };
  }, [book?._id, book?.series, book?.category, accessToken, isConnected]);

  useEffect(() => {
    let active = true;

    const checkLikedStatus = async () => {
      if (!activeChapterId) return;

      const localLiked = await AsyncStorage.getItem(`liked_${activeChapterId}`);
      if (localLiked !== null) {
        if (active) setIsLiked(localLiked === "true");
        return;
      }

      if (user?.likes) {
        const isFound = user.likes.some((item: any) => {
          const id = typeof item === "string" ? item : item?._id;
          return id === activeChapterId;
        });
        if (active) {
          setIsLiked(Boolean(isFound));
          await AsyncStorage.setItem(`liked_${activeChapterId}`, String(Boolean(isFound)));
        }
      }
    };

    checkLikedStatus();
    return () => {
      active = false;
    };
  }, [user?.likes, activeChapterId]);

  useEffect(() => {
    if (!book?.media) return;
    let isCancelled = false;

    const loadPdf = async () => {
      try {
        const targetDir = FileSystem.documentDirectory;
        const safeId = book._id || activeChapterId || "chapter_doc";
        const path = `${targetDir}doc_${safeId}.pdf`;

        const fileInfo = await FileSystem.getInfoAsync(path);
        if (fileInfo.exists && (fileInfo.size ?? 0) > 0) {
          if (!isCancelled) setPdfPath(fileInfo.uri);
          return;
        }

        if (!isCancelled) {
          setPdfPath(book.media);
        }

        if (isConnected) {
          FileSystem.downloadAsync(book.media, path)
            .then((res) => {
              if (!isCancelled && res.uri) {
                setPdfPath(res.uri);
              }
            })
            .catch(() => {});
        }
      } catch (err: any) {
        if (!isCancelled && book.media) {
          setPdfPath(book.media);
        }
      }
    };

    loadPdf();
    return () => {
      isCancelled = true;
    };
  }, [book?._id, book?.media, activeChapterId, isConnected]);

  const pdfSource: Source | null = useMemo(() => {
    if (!pdfPath) return null;
    return {
      uri: pdfPath,
      cache: true,
    };
  }, [pdfPath]);

  const onPageChangedHandler = useCallback(
    (newPage: number) => {
      if (newPage <= 0) return;
      currentPageRef.current = newPage;
      setCurrentPage(newPage);
    },
    []
  );

  const goToPage = useCallback((targetPage: number) => {
    if (targetPage < 1) return;
    currentPageRef.current = targetPage;
    setCurrentPage(targetPage);
    try {
      pdfRef.current?.setPage(targetPage);
    } catch (e) {
      console.warn("goToPage error:", e);
    }
  }, []);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (e: any) => {
        const y = e.nativeEvent.contentOffset.y;
        const prevY = currentScrollYRef.current;

        if (Math.abs(y - prevY) > 0.5) {
          scrollDirectionRef.current = y > prevY ? "down" : "up";
        }

        currentScrollYRef.current = y;
        borderDriver.setValue(y);

        if (y >= MORPH_DISTANCE - 10 && !isLocked) {
          setIsLocked(true);
          if (isAnnotating) setIsAnnotating(false);
        } else if (y < 20 && isLocked) {
          setIsLocked(false);
        }
      },
    }
  );

  const snapTo = (target: number) => {
    if (isSnappingRef.current) return;
    isSnappingRef.current = true;
    scrollDirectionRef.current = target === MORPH_DISTANCE ? "down" : "up";
    if (target === 0) {
      setIsLocked(false);
    } else if (target === MORPH_DISTANCE) {
      setIsLocked(true);
      if (isAnnotating) setIsAnnotating(false);
    }
    scrollRef.current?.scrollTo({ y: target, animated: true });
  };

  const handleScrollBeginDrag = () => {
    isSnappingRef.current = false;
  };

  const snapToNearestState = (y: number) => {
    if (y <= 0 || y >= MORPH_DISTANCE) {
      isSnappingRef.current = false;
      return;
    }
    if (scrollDirectionRef.current === "up") {
      snapTo(0);
    } else {
      snapTo(MORPH_DISTANCE);
    }
  };

  const handleScrollEndDrag = (e: any) => {
    snapToNearestState(e.nativeEvent.contentOffset.y);
  };

  const handleMomentumScrollEnd = (e: any) => {
    if (isSnappingRef.current) return;
    snapToNearestState(e.nativeEvent.contentOffset.y);
  };

  const openToc = () => setIsTocOpen(true);
  const closeToc = () => setIsTocOpen(false);

  const toggleCanvasTheme = () => {
    setCanvasTheme((prev) => {
      const nextTheme = prev === "dark" ? "light" : "dark";
      AsyncStorage.setItem("pdf_canvas_theme", nextTheme).catch(() => {});
      return nextTheme;
    });
  };

  const isDark = canvasTheme === "dark";
  const currentBgColor = isDark ? "#12121c" : "#f4f4f6";
  const currentBorderColor = isDark
    ? "rgba(255,255,255,0.08)"
    : "rgba(0,0,0,0.12)";
  const controlIconColor = isDark ? "#ffffff" : "#1f2937";
  const controlButtonBg = isDark
    ? "rgba(0,0,0,0.65)"
    : "rgba(255,255,255,0.92)";

  const progress = scrollY.interpolate({
    inputRange: [0, MORPH_DISTANCE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const overlayControlsOpacity = progress.interpolate({
    inputRange: [0, 0.4],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const scale = scrollY.interpolate({
    inputRange: [0, MORPH_DISTANCE],
    outputRange: [1, CARD_SCALE],
    extrapolate: "clamp",
  });

  const translateXTo = targetCenterX - SCREEN_WIDTH / 2;
  const translateYTo = targetCenterY - fullHeight / 2;

  const translateX = scrollY.interpolate({
    inputRange: [0, MORPH_DISTANCE],
    outputRange: [0, translateXTo],
    extrapolate: "clamp",
  });

  const translateY = scrollY.interpolate({
    inputRange: [-100, 0, MORPH_DISTANCE, MORPH_DISTANCE + 1000],
    outputRange: [0, 0, translateYTo, translateYTo - 1000],
    extrapolateLeft: "clamp",
    extrapolateRight: "extend",
  });

  const borderProgress = borderDriver.interpolate({
    inputRange: [0, MORPH_DISTANCE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const borderRadius = borderProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, CARD_RADIUS],
  });

  const lastSavedPageRef = useRef<number | null>(null);

  const updateRecentReads = async () => {
    if (currentPage < 1 || !book) return;
    const currentPageValue = Math.max(1, currentPage);
    if (lastSavedPageRef.current === currentPageValue) return;

    try {
      let oldRecentReads = await AsyncStorage.getItem("recentReads");
      const recentReads: IRecentRead[] = oldRecentReads
        ? JSON.parse(oldRecentReads)
        : [];
      const newRecentReads = recentReads.filter(
        (item) => item.content._id !== activeChapterId
      );
      newRecentReads.push({
        content: {
          ...book,
          comments: Array.isArray(book.comments) ? book.comments.length : 0,
          category: book.category?.name || book.category?._id || "",
        },
        readtill: String(currentPageValue),
        total: book?.total ? String(book.total) : "5",
        readAt: new Date().toString(),
      });
      await AsyncStorage.setItem("recentReads", JSON.stringify(newRecentReads));
      lastSavedPageRef.current = currentPageValue;
    } catch (error) {
      console.error("Error updating recent reads:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      void updateRecentReads();
    });
    return () => {
      unsubscribe();
    };
  }, [navigation, activeChapterId, book, currentPage]);

  const like = async () => {
    if (!book) return;

    const nextLiked = !isLiked;
    const nextCount = nextLiked
      ? (book.likes || 0) + 1
      : Math.max(0, (book.likes || 1) - 1);

    setIsLiked(nextLiked);
    setBook((prev) => (prev ? { ...prev, likes: nextCount } : prev));

    await AsyncStorage.setItem(`liked_${activeChapterId}`, String(nextLiked));

    try {
      const cached = await AsyncStorage.getItem(`cached_ch_${activeChapterId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.likes = nextCount;
        await AsyncStorage.setItem(
          `cached_ch_${activeChapterId}`,
          JSON.stringify(parsed)
        );
      }
    } catch {}

    if (!isConnected || !accessToken) return;

    try {
      await api.post(
        "/chapter/like",
        { chapterId: activeChapterId },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      reload().catch(() => {});
    } catch (err) {
      console.warn("Background like sync queued/failed:", err);
    }
  };

  const share = async () => {
    await Share.share({ message: "https://play.google.com/store/apps" });
  };

  const download = async () => {
    if (isDownloading) return;

    if (!isConnected) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }
    if (!book || !user) return;
    if (!book?.isDownloadable) {
      showToast({ title: "This Chapter is not downloadable" });
      return;
    }
    if (user?.subscription?.plan < 2) {
      showToast({ title: "Please upgrade your plan to download this chapter" });
      return;
    }

    const isAlreadyDownloaded = await checkIsDownloaded(book._id);
    if (isAlreadyDownloaded) {
      showToast({ title: "This Chapter is already Downloaded" });
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const targetDir = FileSystem.documentDirectory;
      const downloadPath = `${targetDir}doc_${book._id}.pdf`;

      const downloadResumable = FileSystem.createDownloadResumable(
        book.media,
        downloadPath,
        {},
        (downloadProgressData) => {
          const progress =
            downloadProgressData.totalBytesWritten /
            downloadProgressData.totalBytesExpectedToWrite;
          setDownloadProgress(Math.min(1, Math.max(0, progress)));
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (result?.uri) {
        downloadChapter(book as any);
        setIsDownloading(false);
        setIsDownloadedRecently(true);

        setTimeout(() => {
          setIsDownloadedRecently(false);
          setDownloadProgress(0);
        }, 1200);
      } else {
        throw new Error("Download URI missing");
      }
    } catch (e) {
      console.error("In-place download error:", e);
      setIsDownloading(false);
      setDownloadProgress(0);
      showToast({ title: "Failed to download chapter" });
    }
  };

  useEffect(() => {
    if (!book || !user || !book.series) return;
    const fetchQuestions = async () => {
      try {
        const targetSeries = seriesData || book.series;
        const contents = targetSeries.chapters || [];
        const chapterIndex = contents.findIndex(
          (item: any) => item.content?._id === book._id
        );

        const chapterQues: ISeriesContent[] = [];
        if (chapterIndex !== -1) {
          for (let index = chapterIndex + 1; index < contents.length; index++) {
            const item = contents[index];
            if (item.contentModel !== "Question") break;
            chapterQues.push(item);
          }
        }
        setQuestions(chapterQues);
      } catch (error) {
        console.error("Error fetching questions:", error);
      }
    };
    fetchQuestions();
  }, [accessToken, user, isConnected, book, seriesData]);

  const renderQuestionCard = ({ item }: { item: ISeriesContent }) => {
    if (item.contentModel === "Question" && typeof item.content !== "string") {
      const questionData = item.content as IQuestion;
      return (
        <QuestionCard
          onCommentClick={() => {
            setCommentedQueId(questionData._id);
            setShowComments(true);
          }}
          key={questionData._id}
          question={questionData}
        />
      );
    }
    return null;
  };

  const renderStrokes = (strokes: AnnotationStroke[]) => {
    return strokes.map((stroke, index) => {
      const pointsString = stroke.points
        .map((p) => `${p.x * SCREEN_WIDTH},${p.y * fullHeight}`)
        .join(" ");

      return (
        <Polyline
          key={`stroke-${index}`}
          points={pointsString}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.strokeWidth}
          strokeOpacity={stroke.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    });
  };

  const renderActiveStroke = () => {
    if (activeStrokePoints.length === 0) return null;
    const pointsString = activeStrokePoints
      .map((p) => `${p.x * SCREEN_WIDTH},${p.y * fullHeight}`)
      .join(" ");

    return (
      <Polyline
        points={pointsString}
        fill="none"
        stroke={selectedColor}
        strokeWidth={selectedTool === "highlighter" ? 22 : 3}
        strokeOpacity={selectedTool === "highlighter" ? 0.3 : 0.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  };

  const displayAuthor =
    book?.author && book.author.trim() !== "" ? book.author : "Readapt Creator";

  const isSeriesContent = Boolean(book?.series);
  const showStandaloneRelated = !isSeriesContent && relatedStandaloneBooks.length > 0;

  const resolvedSeriesBook = useMemo(() => {
    if (!book) return null;
    return {
      ...book,
      series: seriesData || book.series,
    };
  }, [book, seriesData]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:
            !isLocked && canvasTheme === "light"
              ? currentBgColor
              : pallete.bgmain,
        },
      ]}>
      {/* Morphing Master Reader Canvas - Always visible underneath overlays */}
      <Animated.View
        pointerEvents={
          showComments || showDetailsPanel || isTocOpen
            ? "none"
            : isLocked
            ? "box-none"
            : "auto"
        }
        style={[
          styles.morphFrame,
          {
            height: fullHeight,
            transform: [
              { translateX },
              { translateY },
              { scaleX: scale },
              { scaleY: scale },
            ],
          },
        ]}>
        <Animated.View
          style={[
            styles.morphFrameInner,
            {
              borderRadius,
              height: fullHeight,
              backgroundColor: currentBgColor,
              borderColor: currentBorderColor,
            },
          ]}>
          {pdfSource ? (
            <View style={{ width: SCREEN_WIDTH, height: fullHeight }}>
              <Pdf
  ref={pdfRef}
  source={pdfSource}
  horizontal={true}
  enablePaging={true}
  fitPolicy={0}
  enableAntialiasing={true}
  enableAnnotationRendering={false}
  onPageChanged={onPageChangedHandler}
  onLoadComplete={(numberOfPages) => {
    setTotalPages(numberOfPages);
    // Sirf document load hone par initial target page par jump karega
    if (currentPageRef.current > 1) {
      pdfRef.current?.setPage(currentPageRef.current);
    }
  }}
  onPageSingleTap={() => {
    if (!isAnnotating && !isTocOpen && !showDetailsPanel) {
      setShowPdfControls((prev) => !prev);
    }
  }}
  onScaleChanged={(currentScale) => {
    if (!isAnnotating) {
      setShowPdfControls(currentScale <= 1.05);
    }
  }}
  style={[styles.singlePdfView, { backgroundColor: currentBgColor }]}
  onError={(err) => console.log("Master PDF render error:", err)}
/>

              {!isLocked && (
                <View
                  style={StyleSheet.absoluteFillObject}
                  pointerEvents={isAnnotating ? "auto" : "none"}
                  {...(isAnnotating ? panResponder.panHandlers : {})}>
                  <Svg
                    width={SCREEN_WIDTH}
                    height={fullHeight}
                    style={StyleSheet.absoluteFillObject}>
                    {renderStrokes(currentPageStrokes)}
                    {renderActiveStroke()}
                  </Svg>
                </View>
              )}
            </View>
          ) : (
            <View
              style={[
                styles.pdfPlaceholder,
                { backgroundColor: currentBgColor },
              ]}>
              <ActivityIndicator color={pallete.accent} />
            </View>
          )}

          {isLocked && !showComments && !showDetailsPanel && !isTocOpen && (
            <TouchableOpacity
              style={styles.expandOverlay}
              activeOpacity={0.8}
              onPress={() => {
                setIsLocked(false);
                scrollRef.current?.scrollTo({ y: 0, animated: true });
              }}>
              <View style={styles.expandBadge}>
                <Svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.5">
                  <Polyline points="15 3 21 3 21 9" />
                  <Polyline points="9 21 3 21 3 15" />
                  <Line x1="21" y1="3" x2="14" y2="10" />
                  <Line x1="3" y1="21" x2="10" y2="14" />
                </Svg>
                <Text style={styles.expandBadgeText}>Tap to Read</Text>
              </View>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Animated.View>

      {/* Main Page Scroll */}
      <Animated.ScrollView
        ref={scrollRef}
        contentOffset={{ x: 0, y: MORPH_DISTANCE }}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.scrollView}
        scrollEventThrottle={16}
        scrollEnabled={!isLoading}
        showsVerticalScrollIndicator={false}>
        <View style={styles.falseHeight} />

        <View style={styles.playerContainer}>
          <View
            style={[
              styles.pdfFramePlaceholder,
              {
                height: cardHeight,
                backgroundColor: currentBgColor,
                borderColor: currentBorderColor,
                borderWidth: 1,
                borderRadius: CARD_RADIUS,
              },
            ]}
          />

          <View style={styles.bookDetails}>
            <Text style={styles.bookTitle}>{book?.title}</Text>
            <View style={styles.row}>
              <Text style={styles.bookAuthor}>{displayAuthor}</Text>
              <View style={styles.divider} />
              <Text style={styles.statItem}>
                {book?.likes || 0} likes
              </Text>
              <View style={styles.divider} />
              <Text style={styles.statItem}>
                {book?.comments?.length || 0} comments
              </Text>
            </View>

            <View style={styles.controlStatsBar}>
              <View style={styles.leftControls}>
                <PopButton onPress={like}>
                  <ControlButton
                    icon="heart"
                    strokeWidth={isLiked ? 0 : 2}
                    filled={isLiked ? "#eb4040" : "none"}
                  />
                </PopButton>
                <PopButton onPress={() => setShowComments(true)}>
                  <ControlButton icon="message" />
                </PopButton>
                <PopButton onPress={share}>
                  <ControlButton icon="share" />
                </PopButton>

                {/* Circular In-place Download Indicator */}
                <PopButton onPress={download}>
                  {isDownloading ? (
                    <View style={styles.circularProgressWrapper}>
                      <Svg width={24} height={24} viewBox="0 0 24 24">
                        <Circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth="2.5"
                          fill="none"
                        />
                        <Circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke={pallete.accent}
                          strokeWidth="2.5"
                          fill="none"
                          strokeDasharray={56.54}
                          strokeDashoffset={56.54 * (1 - downloadProgress)}
                          strokeLinecap="round"
                        />
                      </Svg>
                    </View>
                  ) : isDownloadedRecently ? (
                    <View style={styles.circularProgressWrapper}>
                      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#00D2B4" strokeWidth="2.5">
                        <Polyline points="20 6 9 17 4 12" />
                      </Svg>
                    </View>
                  ) : (
                    <ControlButton icon="download" />
                  )}
                </PopButton>
              </View>

              <PopButton onPress={() => setShowDetailsPanel(true)}>
                <ControlButton icon="info" />
              </PopButton>
            </View>
          </View>
        </View>

        {questions && questions.length > 0 && (
          <View style={styles.pollSection}>
            <Carousel
              loop={false}
              width={SCREEN_WIDTH}
              height={510}
              data={questions}
              pagingEnabled
              snapEnabled
              mode="parallax"
              modeConfig={{
                parallaxScrollingScale: 0.92,
                parallaxScrollingOffset: 0,
              }}
              renderItem={({ item }) => (
                <View
                  style={{
                    width: (SCREEN_WIDTH / 100) * 85,
                    height: "100%",
                    justifyContent: "center",
                    alignItems: "center",
                  }}>
                  <View
                    style={{
                      width: (SCREEN_WIDTH / 100) * 85,
                      height: "100%",
                    }}>
                    {renderQuestionCard({ item })}
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {/* Section: Series (Next Chapters Queue) vs Standalone (Related 4 Cards) */}
        {isSeriesContent ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Next Chapters</Text>
            </View>
            {resolvedSeriesBook && (
              <NextChapter
                book={resolvedSeriesBook as any}
                onOpen={(nextBook: any) => {
                  const nextId = nextBook?._id;
                  if (!nextId) return;
                  void updateRecentReads();
                  navigation.push("ReadBook", { bookId: nextId });
                }}
                viewer="pdf"
              />
            )}
          </View>
        ) : showStandaloneRelated ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Related Content</Text>
            </View>
            <View style={styles.relatedGrid}>
              {relatedStandaloneBooks.map((relBook, idx) => (
                <TouchableOpacity
                  key={relBook._id || idx}
                  style={styles.relatedGridCardWrapper}
                  activeOpacity={0.88}
                  onPress={() => {
                    void updateRecentReads();
                    navigation.push("ReadBook", { bookId: relBook._id });
                  }}>
                  <ContentCard
                    book={relBook}
                    index={-1}
                    seriesType={"standalone" as any}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </Animated.ScrollView>

      {/* Floating Controls Overlay (Fullscreen) */}
      {!isLocked && showPdfControls && !isAnnotating && !isTocOpen && !showDetailsPanel && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            StyleSheet.absoluteFillObject,
            { zIndex: 500, elevation: 500, opacity: overlayControlsOpacity },
          ]}>
          <TouchableOpacity
            style={[
              styles.themeButton,
              {
                top: insets.top + 16,
                backgroundColor: controlButtonBg,
              },
            ]}
            onPress={toggleCanvasTheme}
            activeOpacity={0.8}>
            <Svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke={controlIconColor}
              strokeWidth="2">
              {canvasTheme === "dark" ? (
                <>
                  <Circle cx="12" cy="12" r="5" />
                  <Line x1="12" y1="1" x2="12" y2="3" />
                  <Line x1="12" y1="21" x2="12" y2="23" />
                  <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <Line x1="1" y1="12" x2="3" y2="12" />
                  <Line x1="21" y1="12" x2="23" y2="12" />
                  <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </>
              ) : (
                <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              )}
            </Svg>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.fullscreenClose,
              {
                top: insets.top + 16,
                backgroundColor: controlButtonBg,
              },
            ]}
            onPress={() => {
              setIsLocked(true);
              scrollRef.current?.scrollTo({
                y: MORPH_DISTANCE,
                animated: true,
              });
            }}
            activeOpacity={0.8}>
            <Text style={[styles.closeText, { color: controlIconColor }]}>×</Text>
          </TouchableOpacity>

          <View
            style={[
              styles.bottomReadBar,
              {
                paddingBottom: insets.bottom + 8,
                backgroundColor: isDark ? "rgb(15, 15, 17)" : "#ffffff",
                borderTopWidth: isDark ? 0 : 1,
                borderTopColor: isDark ? "transparent" : "rgba(0,0,0,0.08)",
              },
            ]}>
            <Text
              style={[
                styles.bottomReadBarText,
                { color: isDark ? pallete.textwhite : "#1f2937" },
              ]}>
              {pageCountLabel}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity
                style={[
                  styles.annotateButton,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                    borderColor: isDark
                      ? "rgba(255,255,255,0.15)"
                      : "rgba(0,0,0,0.12)",
                  },
                ]}
                onPress={() => setIsAnnotating(true)}
                activeOpacity={0.85}>
                <Svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={controlIconColor}
                  strokeWidth="2">
                  <Path d="M12 20h9" />
                  <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </Svg>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tocButton}
                onPress={openToc}
                activeOpacity={0.9}>
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2">
                  <Line x1="8" y1="6" x2="21" y2="6" />
                  <Line x1="8" y1="12" x2="21" y2="12" />
                  <Line x1="8" y1="18" x2="21" y2="18" />
                  <Circle cx="3" cy="6" r="1" fill="#fff" />
                  <Path d="M3 10 v4" stroke="#fff" />
                  <Circle cx="3" cy="18" r="1" fill="#fff" />
                </Svg>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Annotation Mode Overlays */}
      {!isLocked && isAnnotating && (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 600 }]}>
         <View style={[styles.annotationTopBar, { paddingTop: insets.top + 10 }]}>
  {/* Undo Action */}
  <TouchableOpacity
    style={styles.annotTopAction}
    onPress={handleUndo}
    activeOpacity={0.7}>
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffffff"
      strokeWidth="2.2">
      <Polyline points="1 4 1 10 7 10" />
      <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </Svg>
  </TouchableOpacity>

  {/* Clear Action (Trash Icon) */}
  <TouchableOpacity
    style={styles.annotTopAction}
    onPress={handleClear}
    activeOpacity={0.7}>
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ff6b6b"
      strokeWidth="2">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  </TouchableOpacity>

  {/* Save Action (Disk/Check Icon with Tick Feedback) */}
  <TouchableOpacity
    style={[
      styles.annotTopAction,
      styles.annotSaveAction,
      isSavedRecently && styles.annotSaveActionSuccess,
    ]}
    onPress={saveAnnotations}
    activeOpacity={0.7}>
    {isSavedRecently ? (
      <Svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#00D2B4"
        strokeWidth="3">
        <Polyline points="20 6 9 17 4 12" />
      </Svg>
    ) : (
      <Svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#00D2B4"
        strokeWidth="2">
        <Path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <Polyline points="17 21 17 13 7 13 7 21" />
        <Polyline points="7 3 7 8 15 8" />
      </Svg>
    )}
  </TouchableOpacity>

  {/* Close / Exit Action */}
  <TouchableOpacity
    style={[styles.annotTopAction, { marginLeft: 8 }]}
    onPress={handleExitAnnotationMode}
    activeOpacity={0.7}>
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffffff"
      strokeWidth="2.5">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  </TouchableOpacity>
</View>

          <View
            style={[
              styles.annotationBottomBar,
              { paddingBottom: insets.bottom + 8 },
            ]}>
           <View style={styles.annotToolsGroup}>
  {/* Marker Pen Icon */}
  <TouchableOpacity
    style={[
      styles.toolChip,
      selectedTool === "marker" && styles.toolChipActive,
    ]}
    onPress={() => setSelectedTool("marker")}
    activeOpacity={0.8}>
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={selectedTool === "marker" ? "#ffffff" : "#a0a5b5"}
      strokeWidth="2">
      <Path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </Svg>
  </TouchableOpacity>

  {/* Highlighter Icon */}
  <TouchableOpacity
    style={[
      styles.toolChip,
      selectedTool === "highlighter" && styles.toolChipActive,
    ]}
    onPress={() => setSelectedTool("highlighter")}
    activeOpacity={0.8}>
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={selectedTool === "highlighter" ? "#ffffff" : "#a0a5b5"}
      strokeWidth="2">
      <Path d="M9 11l-6 6v3h3l6-6" />
      <Path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </Svg>
  </TouchableOpacity>
</View>

            <View style={styles.annotDivider} />

            <View style={styles.annotColorsGroup}>
              {ANNOTATION_COLORS.map((col) => {
                const isSelected = selectedColor === col.value;
                return (
                  <TouchableOpacity
                    key={col.id}
                    onPress={() => setSelectedColor(col.value)}
                    activeOpacity={0.8}
                    style={[
                      styles.colorDotWrapper,
                      isSelected && styles.colorDotWrapperActive,
                    ]}>
                    <View
                      style={[styles.colorDot, { backgroundColor: col.value }]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Confirmation Modal */}
      {customModal.visible && (
        <View style={styles.customModalOverlay}>
          <View style={styles.customModalContainer}>
            <Text style={styles.customModalTitle}>{customModal.title}</Text>
            <Text style={styles.customModalDesc}>{customModal.description}</Text>

            <View style={styles.customModalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCustomModal((prev) => ({ ...prev, visible: false }))}
                activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={customModal.onConfirm}
                activeOpacity={0.8}>
                <Text style={styles.modalConfirmText}>{customModal.confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* High-priority Top-Level Overlay Components */}
      <TocDrawer
        isOpen={isTocOpen}
        onClose={closeToc}
        toc={book?.toc}
        onSelectPage={goToPage}
      />

      <ChapterDetailsPanel
        isOpen={showDetailsPanel}
        onClose={() => setShowDetailsPanel(false)}
        book={book}
        totalPages={totalCountResolved}
      />

      <CommentsDrawer
        visible={showComments}
        reload={() => fetchChapter(activeChapterId)}
        onClose={() => {
          setShowComments(false);
          setCommentedQueId("");
        }}
        chapterId={commentedQueId ? commentedQueId : activeChapterId}
        initialComments={
          (commentedQueId ? [] : book?.comments ? book?.comments : []) as any
        }
        isQuestion={!!commentedQueId}
      />
    </View>
  );
};

const ControlButton = ({
  icon,
  filled = "none",
  strokeWidth = 2,
}: {
  icon: string;
  filled?: string;
  strokeWidth?: number;
}) => (
  <View style={styles.controlItem}>
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill={filled}
      stroke="#9ca3af"
      strokeWidth={strokeWidth}>
      {icon === "heart" && (
        <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      )}
      {icon === "message" && (
        <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      )}
      {icon === "share" && (
        <>
          <Circle cx="18" cy="5" r="3" />
          <Circle cx="6" cy="12" r="3" />
          <Circle cx="18" cy="19" r="3" />
          <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </>
      )}
      {icon === "download" && (
        <>
          <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <Polyline points="7 10 12 15 17 10" />
          <Line x1="12" y1="15" x2="12" y2="3" />
        </>
      )}
      {icon === "info" && (
        <>
          <Circle cx="12" cy="12" r="10" />
          <Line x1="12" y1="16" x2="12" y2="12" />
          <Line x1="12" y1="8" x2="12.01" y2="8" />
        </>
      )}
    </Svg>
  </View>
);

const panelStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  detailsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SHEET_HEIGHT,
    backgroundColor: "rgba(18, 18, 24, 0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: pallete.paddingside,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 35,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 10,
    alignSelf: "center",
    position: "absolute",
    top: 10,
  },
  panelHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: pallete.textwhite,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 8,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
  },
  authorLabel: {
    fontSize: 12,
    color: pallete.textgray,
  },
  authorNameVal: {
    fontSize: 13,
    fontWeight: "600",
    color: pallete.accent,
  },
  panelSRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 14,
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
  descScroll: {
    maxHeight: 140,
  },
  descTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: pallete.accent,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  panelDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: "#d1d5db",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain,
    paddingTop: CONTAINER_PADDING_TOP,
  },
  overlayRootContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 50,
  },
  scrollView: {
    marginTop: SCROLLVIEW_MARGIN_TOP,
  },
  falseHeight: {
    width: SCREEN_WIDTH,
    height: MORPH_DISTANCE,
  },
  playerContainer: { padding: PLAYER_CONTAINER_PADDING },
  pdfFramePlaceholder: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_HORIZONTAL_MARGIN,
    marginTop: PDF_FRAME_MARGIN_TOP,
  },
  morphFrame: {
    position: "absolute",
    zIndex: 10,
    elevation: 10,
    left: 0,
    width: SCREEN_WIDTH,
  },
  pdfPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  morphFrameInner: {
    width: SCREEN_WIDTH,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  singlePdfView: {
    width: SCREEN_WIDTH,
    height: "100%",
  },
  bookDetails: { marginTop: 16 },
  bookTitle: {
    fontFamily: "Playfair Display",
    fontSize: 22,
    fontWeight: "600",
    color: pallete.textwhite,
    marginBottom: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  bookAuthor: { fontSize: 13, color: pallete.textgray },
  divider: {
    width: 4,
    height: 4,
    backgroundColor: pallete.textgray,
    borderRadius: 50,
    opacity: 0.4,
  },
  statItem: { fontSize: 12, fontWeight: "600", color: pallete.accent },
  controlStatsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  leftControls: { flexDirection: "row", gap: 24 },
  controlItem: { padding: 4 },
  circularProgressWrapper: {
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginBottom: 40,
    marginTop: 10,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#e5e7eb",
  },
  relatedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    gap: 12,
  },
  relatedGridCardWrapper: {
    width: "48%",
    marginBottom: 8,
  },
  pollSection: {
    marginBottom: 20,
    overflow: "hidden",
  },
  tocBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  tocSideSheet: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: TOC_WIDTH,
    backgroundColor: "rgba(18, 18, 24, 0.98)",
    paddingHorizontal: 20,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 35,
  },
  tocDragIndicator: {
    width: 4,
    height: 38,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 3,
    position: "absolute",
    left: 8,
    top: "48%",
  },
  tocHeader: {
    fontSize: 12,
    marginTop: 12,
    fontWeight: "700",
    color: pallete.accent,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 18,
  },
  tocScrollContainer: {
    flex: 1,
  },
  tocListContent: {
    paddingBottom: 24,
    gap: 10,
  },
  tocChip: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chipName: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
    marginRight: 12,
    lineHeight: 18,
  },
  chipPageWrapper: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  chipPage: {
    fontSize: 11,
    fontWeight: "700",
    color: pallete.accent,
    backgroundColor: "rgba(1,121,111,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bottomReadBar: {
    position: "absolute",
    bottom: 0,
    margin: 0,
    width: SCREEN_WIDTH,
    backgroundColor: "rgb(15, 15, 17)",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bottomReadBarText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  annotateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  tocButton: {
    backgroundColor: pallete.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenClose: {
    position: "absolute",
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  themeButton: {
    position: "absolute",
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 30,
    fontWeight: "300",
    lineHeight: 32,
  },
  expandOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 16,
  },
  expandBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  expandBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  annotationTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 15, 20, 0.95)",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  annotTopAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  annotSaveAction: {
    backgroundColor: "rgba(0, 210, 180, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(0, 210, 180, 0.3)",
    minWidth: 58,
    justifyContent: "center",
  },
  annotSaveActionSuccess: {
    backgroundColor: "rgba(0, 210, 180, 0.25)",
  },
  annotTopText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  annotationBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 15, 20, 0.95)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  annotToolsGroup: {
    flexDirection: "row",
    gap: 10,
  },
  toolChip: {
    width: 42,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  toolChipActive: {
    backgroundColor: pallete.accent,
    borderColor: pallete.accent,
  },
  annotDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 10,
  },
  annotColorsGroup: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  colorDotWrapper: {
    padding: 3,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  colorDotWrapperActive: {
    borderColor: "#ffffff",
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  customModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
    zIndex: 900,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  customModalContainer: {
    width: "100%",
    backgroundColor: "rgba(22, 22, 28, 0.98)",
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 8,
  },
  customModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
  },
  customModalDesc: {
    fontSize: 13,
    color: "#9ca3af",
    lineHeight: 18,
    marginBottom: 20,
  },
  customModalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modalCancelText: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600",
  },
  modalConfirmBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#eb4040",
  },
  modalConfirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});

export default BookReaderScreen;