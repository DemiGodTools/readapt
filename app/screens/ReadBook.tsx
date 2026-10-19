import { Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Easing } from "react-native";
import Pdf, { Source } from "react-native-pdf";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  memo,
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
  DeviceEventEmitter,
  FlatList,
} from "react-native";
import Svg, { Path, Line, Circle, Polyline } from "react-native-svg";
// @ts-ignore
import Feather from "react-native-vector-icons/Feather";
import {
  Gesture,
  GestureDetector,
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
const SLIDER_TRACK_HEIGHT = 132;

const INITIAL_CONTENT_OFFSET = { x: 0, y: MORPH_DISTANCE };

const ramPdfUriMap = new Map<string, string>();
const ramBookMetaMap = new Map<string, any>();
const ramUrlMap = new Map<string, string>();
const ramRealPagesMap = new Map<string, number>();
const activeDownloadJobs = new Map<string, Promise<string | null>>();

const normalizeMediaUrl = (url?: string | null): string => {
  if (!url || typeof url !== "string") return "";
  return url.trim();
};

const getFastHash = (str: string): string => {
  let h = 0;
  const clean = normalizeMediaUrl(str);
  for (let i = 0; i < clean.length; i++) {
    h = (Math.imul(31, h) + clean.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
};

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

// Midpoint Quadratic Bezier Curve Generator for smooth ovals, circles & handwriting
const buildSmoothSvgPath = (
  points: AnnotationPoint[],
  width: number,
  height: number
): string => {
  const len = points.length;
  if (len === 0) return "";

  const p0x = (points[0].x * width).toFixed(1);
  const p0y = (points[0].y * height).toFixed(1);

  if (len === 1) {
    return `M ${p0x} ${p0y} L ${p0x} ${p0y}`;
  }

  if (len === 2) {
    const p1x = (points[1].x * width).toFixed(1);
    const p1y = (points[1].y * height).toFixed(1);
    return `M ${p0x} ${p0y} L ${p1x} ${p1y}`;
  }

  let d = `M ${p0x} ${p0y}`;
  for (let i = 1; i < len - 1; i++) {
    const cx = points[i].x * width;
    const cy = points[i].y * height;
    const nx = points[i + 1].x * width;
    const ny = points[i + 1].y * height;
    const midX = ((cx + nx) * 0.5).toFixed(1);
    const midY = ((cy + ny) * 0.5).toFixed(1);
    d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${midX} ${midY}`;
  }

  const last = points[len - 1];
  d += ` L ${(last.x * width).toFixed(1)} ${(last.y * height).toFixed(1)}`;
  return d;
};

type Props = {
  route: {
    params: {
      bookId: string;
      page?: number;
      initialPage?: number;
      startPage?: number;
      initialBookData?: any;
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
  questions?: any[];
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

const isStrictlyStandaloneBook = (
  item: any,
  excludedSeriesChapterIds?: Set<string>
): boolean => {
  if (!item) return false;
  const actualItem =
    typeof item.content === "object" && item.content !== null
      ? item.content
      : item;

  const itemId = String(actualItem?._id || item?._id || "").trim();
  if (!itemId) return false;

  if (excludedSeriesChapterIds && excludedSeriesChapterIds.has(itemId)) {
    return false;
  }

  if (item.contentModel && item.contentModel !== "Chapter") return false;
  if (actualItem.contentModel && actualItem.contentModel !== "Chapter") return false;

  const checkSeriesProp = (obj: any) => {
    if (!obj) return false;
    if (Array.isArray(obj.chapters) && obj.chapters.length > 0) return true;
    if (obj.series) {
      if (typeof obj.series === "string" && obj.series.trim() !== "") return true;
      if (typeof obj.series === "object") {
        if (obj.series._id) return true;
        if (Object.keys(obj.series).length > 0) return true;
      }
    }
    if (obj.seriesId && String(obj.seriesId).trim() !== "") return true;
    if (obj.parentSeries && String(obj.parentSeries).trim() !== "") return true;
    if (obj.isSeriesContent || obj.isSeriesChapter || obj.isSeries) return true;
    if (obj.seriesType === "framework" || obj.seriesType === "normal") return true;
    return false;
  };

  if (checkSeriesProp(item) || checkSeriesProp(actualItem)) {
    return false;
  }

  return true;
};

interface MemoizedPdfCanvasProps {
  pdfRef: React.MutableRefObject<any>;
  source: Source;
  initialPage: number;
  onPageChanged: (page: number, numberOfPages: number) => void;
  onLoadComplete: (numberOfPages: number) => void;
  onPageSingleTap: () => void;
  onScaleChanged: (scale: number) => void;
}

const MemoizedPdfCanvas = memo(
  ({
    pdfRef,
    source,
    initialPage,
    onPageChanged,
    onLoadComplete,
    onPageSingleTap,
    onScaleChanged,
  }: MemoizedPdfCanvasProps) => {
    const callbacksRef = useRef({
      onPageChanged,
      onLoadComplete,
      onPageSingleTap,
      onScaleChanged,
    });

    callbacksRef.current = {
      onPageChanged,
      onLoadComplete,
      onPageSingleTap,
      onScaleChanged,
    };

    const handlePageChanged = useCallback((page: number, total: number) => {
      callbacksRef.current.onPageChanged(page, total);
    }, []);

    const handleLoadComplete = useCallback((total: number) => {
      callbacksRef.current.onLoadComplete(total);
    }, []);

    const handleSingleTap = useCallback(() => {
      callbacksRef.current.onPageSingleTap();
    }, []);

    const handleScaleChanged = useCallback((scale: number) => {
      callbacksRef.current.onScaleChanged(scale);
    }, []);

    const handleError = useCallback((err: any) => {
      console.warn("Master PDF render warning:", err);
    }, []);

    return (
      <Pdf
        ref={pdfRef}
        source={source}
        page={initialPage}
        horizontal={true}
        enablePaging={true}
        fitPolicy={0}
        spacing={0}
        minScale={1.0}
        maxScale={4.0}
        enableAntialiasing={true}
        enableAnnotationRendering={false}
        onPageChanged={handlePageChanged}
        onLoadComplete={handleLoadComplete}
        onPageSingleTap={handleSingleTap}
        onScaleChanged={handleScaleChanged}
        onError={handleError}
        style={styles.singlePdfView}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.source.uri === nextProps.source.uri &&
    prevProps.initialPage === nextProps.initialPage
);

const CompletedStrokesSvg = memo(
  ({
    strokes,
    width,
    height,
  }: {
    strokes: AnnotationStroke[];
    width: number;
    height: number;
  }) => {
    return (
      <>
        {strokes.map((stroke, index) => {
          const d = buildSmoothSvgPath(stroke.points, width, height);
          if (!d) return null;
          return (
            <Path
              key={`stroke-${index}`}
              d={d}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.strokeWidth}
              strokeOpacity={stroke.opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </>
    );
  }
);

// ⚡ Pure UI-Thread 120fps Vertical Size Slider (Zero JS Re-renders during drag)
interface VerticalSizeSliderProps {
  visible: boolean;
  minSize: number;
  maxSize: number;
  currentSize: number;
  color: string;
  onChangeSize: (newSize: number) => void;
  bottomOffset: number;
}

const VerticalSizeSlider = memo(
  ({
    visible,
    minSize,
    maxSize,
    currentSize,
    color,
    onChangeSize,
    bottomOffset,
  }: VerticalSizeSliderProps) => {
    const initialRatio = Math.max(
      0,
      Math.min(1, (currentSize - minSize) / (maxSize - minSize))
    );
    const ratio = useSharedValue(initialRatio);
    const startRatio = useSharedValue(initialRatio);
    const thumbScale = useSharedValue(1);

    useEffect(() => {
      const nextRatio = Math.max(
        0,
        Math.min(1, (currentSize - minSize) / (maxSize - minSize))
      );
      ratio.value = withTiming(nextRatio, { duration: 90 });
    }, [currentSize, minSize, maxSize]);

    const commitSizeToJS = useCallback(
      (r: number) => {
        const computed = minSize + r * (maxSize - minSize);
        const rounded = Math.round(computed * 2) / 2;
        onChangeSize(rounded);
      },
      [minSize, maxSize, onChangeSize]
    );

    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .minDistance(0)
          .onBegin((e) => {
            "worklet";
            const clampedY = Math.max(0, Math.min(SLIDER_TRACK_HEIGHT, e.y));
            const newR = 1 - clampedY / SLIDER_TRACK_HEIGHT;
            ratio.value = newR;
            startRatio.value = newR;
            thumbScale.value = withTiming(1.22, { duration: 100 });
          })
          .onUpdate((e) => {
            "worklet";
            // Pure UI-thread calculation: 0 JS bridge calls while dragging!
            const deltaRatio = -e.translationY / SLIDER_TRACK_HEIGHT;
            const nextR = Math.max(0, Math.min(1, startRatio.value + deltaRatio));
            ratio.value = nextR;
          })
          .onFinalize(() => {
            "worklet";
            thumbScale.value = withTiming(1, { duration: 120 });
            runOnJS(commitSizeToJS)(ratio.value);
          }),
      [commitSizeToJS]
    );

    const fillAnimatedStyle = useAnimatedStyle(() => ({
      height: ratio.value * SLIDER_TRACK_HEIGHT,
    }));

    const thumbAnimatedStyle = useAnimatedStyle(() => {
      const topPos = (1 - ratio.value) * SLIDER_TRACK_HEIGHT;
      return {
        transform: [
          { translateY: topPos - 10 },
          { scale: thumbScale.value },
        ],
      };
    });

    const previewDotAnimatedStyle = useAnimatedStyle(() => {
      const size = minSize + ratio.value * (maxSize - minSize);
      const clampedPreview = Math.max(4, Math.min(28, size));
      return {
        width: clampedPreview,
        height: clampedPreview,
        borderRadius: clampedPreview / 2,
      };
    });

    if (!visible) return null;

    return (
      <View
        style={[
          styles.verticalSliderCard,
          { bottom: bottomOffset },
        ]}>
        <View style={styles.sliderPreviewBox}>
          <Reanimated.View
            style={[
              {
                backgroundColor: color === "#000000" ? "#ffffff" : color,
              },
              previewDotAnimatedStyle,
            ]}
          />
        </View>

        <GestureDetector gesture={panGesture}>
          <View style={styles.sliderGestureArea}>
            <View style={styles.sliderTrackBg}>
              <Reanimated.View
                style={[
                  styles.sliderTrackFill,
                  { backgroundColor: pallete.accent },
                  fillAnimatedStyle,
                ]}
              />
            </View>
            <Reanimated.View
              style={[
                styles.sliderThumb,
                { borderColor: pallete.accent },
                thumbAnimatedStyle,
              ]}
            />
          </View>
        </GestureDetector>
      </View>
    );
  }
);

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
  const activeChapterId = String(route.params?.bookId || "").trim();

  const incomingPage = useMemo(() => {
    const raw =
      (route.params as any)?.initialPage ??
      (route.params as any)?.page ??
      (route.params as any)?.startPage ??
      1;
    return Math.max(1, parseInt(String(raw), 10) || 1);
  }, [route.params]);

  const currentPageRef = useRef<number>(incomingPage);
  const [currentPage, setCurrentPage] = useState<number>(incomingPage);

  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const { user, reload } = useUser();
  const { downloadChapter } = useDownloads();
  const { removeAllTracks } = useGlobalAudio();

  const initialBookParam = (route.params as any)?.initialBookData || null;

  const [book, setBook] = useState<BookPopulated | null>(() => {
    if (activeChapterId && ramBookMetaMap.has(activeChapterId)) {
      return ramBookMetaMap.get(activeChapterId);
    }
    return initialBookParam;
  });

  const [pdfPath, setPdfPath] = useState<string | null>(() => {
    if (activeChapterId && ramPdfUriMap.has(activeChapterId)) {
      return ramPdfUriMap.get(activeChapterId) || null;
    }
    return null;
  });

  const [seriesData, setSeriesData] = useState<ISeries | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const particleAnim = useRef(new Animated.Value(0)).current;
  const [showComments, setShowComments] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [resumeBanner, setResumeBanner] = useState<{ visible: boolean; page: number }>({
    visible: false,
    page: 1,
  });
  const resumeBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [totalPages, setTotalPages] = useState<number>(() => {
    if (activeChapterId && ramRealPagesMap.has(activeChapterId)) {
      return ramRealPagesMap.get(activeChapterId) || 0;
    }
    return 0;
  });

  const totalPagesRef = useRef<number>(totalPages);
  useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

  const totalCountResolved =
    totalPages > 0
      ? totalPages
      : activeChapterId && ramRealPagesMap.has(activeChapterId)
      ? ramRealPagesMap.get(activeChapterId)!
      : 0;

  const pageCountLabel =
    totalCountResolved > 0
      ? `${currentPage} / ${totalCountResolved}`
      : `Page ${currentPage}`;

  const [showPdfControls, setShowPdfControls] = useState(true);
  const { isConnected } = useNetworkStatus();
  const [commentedQueId, setCommentedQueId] = useState("");
  const [questions, setQuestions] = useState<IQuestion[] | null>(null);
  const [showQnaComments, setShowQnaComments] = useState(false);
  const [showQnaPanel, setShowQnaPanel] = useState(false);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());

  const [relatedStandaloneBooks, setRelatedStandaloneBooks] = useState<any[]>([]);
  const [canvasTheme, setCanvasTheme] = useState<"dark" | "light">("dark");

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadedRecently, setIsDownloadedRecently] = useState(false);

  // Annotation & Stroke Size State
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [selectedTool, setSelectedTool] = useState<AnnotationTool>("marker");
  const [selectedColor, setSelectedColor] = useState<string>(ANNOTATION_COLORS[0].value);
  const [markerStrokeSize, setMarkerStrokeSize] = useState<number>(3.5);
  const [highlighterStrokeSize, setHighlighterStrokeSize] = useState<number>(22);
  const [showSizeSlider, setShowSizeSlider] = useState<boolean>(false);

  const [currentPageStrokes, setCurrentPageStrokes] = useState<AnnotationStroke[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const hasUnsavedChangesRef = useRef(false);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const [isSavedRecently, setIsSavedRecently] = useState(false);

  const activeSvgPathRef = useRef<any>(null);

  // ⚡ Seamless Zero-Blink Stroke Handover:
  // Jab naya stroke `currentPageStrokes` me commit ho kar render ho jaye,
  // tabhi us exact frame par live `activeSvgPathRef` ko clear karo!
  useLayoutEffect(() => {
    activeSvgPathRef.current?.setNativeProps({ d: "" });
  }, [currentPageStrokes]);

  const currentToolSize =
    selectedTool === "highlighter" ? highlighterStrokeSize : markerStrokeSize;
  const currentToolOpacity = selectedTool === "highlighter" ? 0.32 : 0.96;

  const handleSizeChange = useCallback(
    (newSize: number) => {
      if (selectedTool === "highlighter") {
        setHighlighterStrokeSize(newSize);
      } else {
        setMarkerStrokeSize(newSize);
      }
    },
    [selectedTool]
  );

  const [customModal, setCustomModal] = useState<{
    visible: boolean;
    title: string;
    description: string;
    confirmText: string;
    cancelText?: string;
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

  const targetCenterY =
    CONTAINER_PADDING_TOP +
    SCROLLVIEW_MARGIN_TOP +
    PLAYER_CONTAINER_PADDING +
    PDF_FRAME_MARGIN_TOP +
    cardHeight / 2;

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
            hasUnsavedChangesRef.current = false;
            return;
          }
        }
        setCurrentPageStrokes([]);
        setHasUnsavedChanges(false);
        hasUnsavedChangesRef.current = false;
      } catch (e) {
        console.warn("Error loading annotations:", e);
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

  // ⚡ Save karte hi automatically Annotation Mode UI band ho jayega
  const saveAnnotations = async () => {
    if (!activeChapterId) return;
    try {
      setShowSizeSlider(false);
      const key = getStorageKey(activeChapterId);
      const raw = await AsyncStorage.getItem(key);
      let data: ChapterAnnotations = raw
        ? JSON.parse(raw)
        : { contentId: activeChapterId, pages: {} };

      data.pages[String(currentPage)] = currentPageStrokes;
      await AsyncStorage.setItem(key, JSON.stringify(data));
      setHasUnsavedChanges(false);
      hasUnsavedChangesRef.current = false;

      setIsSavedRecently(true);
      setTimeout(() => {
        setIsSavedRecently(false);
        setIsAnnotating(false);
      }, 240);
    } catch (e) {
      console.warn("Failed to save annotations:", e);
    }
  };

  const handleUndo = () => {
    if (currentPageStrokes.length === 0) return;
    setCurrentPageStrokes((prev) => prev.slice(0, prev.length - 1));
    setHasUnsavedChanges(true);
    hasUnsavedChangesRef.current = true;
  };

  const handleClear = () => {
    if (currentPageStrokes.length === 0) return;
    setShowSizeSlider(false);
    setCustomModal({
      visible: true,
      title: "Clear Annotations",
      description: "Are you sure you want to clear annotations from this page?",
      confirmText: "Clear Page",
      onConfirm: () => {
        setCurrentPageStrokes([]);
        setHasUnsavedChanges(true);
        hasUnsavedChangesRef.current = true;
        setCustomModal((prev) => ({ ...prev, visible: false }));
      },
    });
  };

  const handleExitAnnotationMode = useCallback(() => {
    setShowSizeSlider(false);
    if (hasUnsavedChangesRef.current) {
      setCustomModal({
        visible: true,
        title: "Unsaved Annotations",
        description: "You have unsaved strokes. Do you want to discard changes?",
        confirmText: "Discard",
        onConfirm: () => {
          setHasUnsavedChanges(false);
          hasUnsavedChangesRef.current = false;
          loadAnnotationsForPage(activeChapterId, currentPage);
          setIsAnnotating(false);
          setCustomModal((prev) => ({ ...prev, visible: false }));
        },
      });
    } else {
      setIsAnnotating(false);
    }
  }, [activeChapterId, currentPage, loadAnnotationsForPage]);

  const activeStrokeRef = useRef<{
    tool: AnnotationTool;
    color: string;
    opacity: number;
    strokeWidth: number;
    points: AnnotationPoint[];
  } | null>(null);

  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const toolConfigRef = useRef({
    isAnnotating,
    selectedTool,
    selectedColor,
    currentToolSize,
    currentToolOpacity,
    fullHeight,
  });
  toolConfigRef.current = {
    isAnnotating,
    selectedTool,
    selectedColor,
    currentToolSize,
    currentToolOpacity,
    fullHeight,
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => toolConfigRef.current.isAnnotating,
        onMoveShouldSetPanResponder: () => toolConfigRef.current.isAnnotating,
        onPanResponderGrant: (evt) => {
          const cfg = toolConfigRef.current;
          if (!cfg.isAnnotating) return;
          setShowSizeSlider(false);

          const { locationX, locationY } = evt.nativeEvent;
          const normX = Math.max(0, Math.min(1, locationX / SCREEN_WIDTH));
          const normY = Math.max(0, Math.min(1, locationY / cfg.fullHeight));

          const initialStroke = {
            tool: cfg.selectedTool,
            color: cfg.selectedColor,
            opacity: cfg.currentToolOpacity,
            strokeWidth: cfg.currentToolSize,
            points: [{ x: normX, y: normY }],
          };

          activeStrokeRef.current = initialStroke;
          lastPointRef.current = { x: normX, y: normY };

          const d = buildSmoothSvgPath(
            initialStroke.points,
            SCREEN_WIDTH,
            cfg.fullHeight
          );
          activeSvgPathRef.current?.setNativeProps({ d });
        },
        onPanResponderMove: (evt) => {
          const cfg = toolConfigRef.current;
          if (
            !cfg.isAnnotating ||
            !activeStrokeRef.current ||
            !lastPointRef.current
          ) {
            return;
          }

          const { locationX, locationY } = evt.nativeEvent;
          const normX = Math.max(0, Math.min(1, locationX / SCREEN_WIDTH));
          const normY = Math.max(0, Math.min(1, locationY / cfg.fullHeight));

          const dx = normX - lastPointRef.current.x;
          const dy = normY - lastPointRef.current.y;

          if (dx * dx + dy * dy > 0.000004) {
            lastPointRef.current = { x: normX, y: normY };
            activeStrokeRef.current.points.push({ x: normX, y: normY });

            const d = buildSmoothSvgPath(
              activeStrokeRef.current.points,
              SCREEN_WIDTH,
              cfg.fullHeight
            );
            activeSvgPathRef.current?.setNativeProps({ d });
          }
        },
        onPanResponderRelease: () => {
          const cfg = toolConfigRef.current;
          if (!cfg.isAnnotating || !activeStrokeRef.current) return;
          const completed = activeStrokeRef.current;

          activeStrokeRef.current = null;
          lastPointRef.current = null;

          // Note: Yahan activeSvgPathRef clear NAHI kar rahe!
          // Woh `useLayoutEffect` me clear hoga jab `currentPageStrokes` commit ho chuka hoga -> Zero Blink!
          if (completed.points.length > 0) {
            setHasUnsavedChanges(true);
            hasUnsavedChangesRef.current = true;
            setCurrentPageStrokes((prev) => [...prev, completed]);
          } else {
            activeSvgPathRef.current?.setNativeProps({ d: "" });
          }
        },
        onPanResponderTerminate: () => {
          activeStrokeRef.current = null;
          lastPointRef.current = null;
          activeSvgPathRef.current?.setNativeProps({ d: "" });
        },
      }),
    []
  );

  const saveRecentReadProgress = useCallback(
    async (pageToSave?: number, knownTotal?: number) => {
      const targetPage = Math.max(1, pageToSave ?? currentPageRef.current);
      if (!activeChapterId || !book) return;

      try {
        if (knownTotal && knownTotal > 0) {
          ramRealPagesMap.set(activeChapterId, knownTotal);
          totalPagesRef.current = knownTotal;
          AsyncStorage.setItem(
            `pdf_real_pages_${activeChapterId}`,
            String(knownTotal)
          ).catch(() => {});
        }

        const raw = await AsyncStorage.getItem("recentReads");
        const recentReads: IRecentRead[] = raw ? JSON.parse(raw) : [];

        const existingItem = recentReads.find(
          (item) => item?.content?._id === activeChapterId
        );
        const existingTotal = existingItem
          ? parseInt(String(existingItem.total || 0), 10)
          : 0;

        const verifiedEngineTotal =
          (knownTotal && knownTotal > 0 ? knownTotal : 0) ||
          (totalPagesRef.current > 0 ? totalPagesRef.current : 0) ||
          ramRealPagesMap.get(activeChapterId) ||
          0;

        let resolvedTotal = verifiedEngineTotal;
        if (resolvedTotal <= 0) {
          resolvedTotal =
            existingTotal > 0
              ? existingTotal
              : book?.total && Number(book.total) > 0
              ? Number(book.total)
              : targetPage;
        }

        if (resolvedTotal < targetPage) {
          resolvedTotal = targetPage;
        }

        const activeQuestionsList =
          questions && questions.length > 0
            ? questions
            : Array.isArray(book?.questions) && book.questions.length > 0
            ? book.questions
            : ramBookMetaMap.get(activeChapterId)?.questions || [];

        const updatedBookContent = {
          ...book,
          _id: activeChapterId,
          questions: activeQuestionsList,
          total: resolvedTotal,
          comments: Array.isArray(book?.comments)
            ? book.comments.length
            : typeof book?.comments === "number"
            ? book.comments
            : 0,
          category: book?.category?.name || book?.category?._id || "",
        };
        const filtered = recentReads.filter(
          (item) => item?.content?._id !== activeChapterId
        );

        filtered.unshift({
          content: updatedBookContent,
          readtill: String(targetPage),
          total: String(resolvedTotal),
          readAt: new Date().toString(),
        });

        await AsyncStorage.setItem("recentReads", JSON.stringify(filtered));
        DeviceEventEmitter.emit("RECENT_READS_UPDATED", filtered);
      } catch (error) {
        console.warn("Error updating recent reads:", error);
      }
    },
    [activeChapterId, book, questions]
  );

  // ⚡ Hardware Back / Gesture Back Handler (Properly checks `hasUnsavedChangesRef` in Annotation Mode)
  const handleBackAction = useCallback(() => {
    if (customModal.visible) {
      setCustomModal((prev) => ({ ...prev, visible: false }));
      return true;
    }
    if (showSizeSlider) {
      setShowSizeSlider(false);
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
    if (showQnaPanel) {
      setShowQnaPanel(false);
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
    void saveRecentReadProgress();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return true;
    }
    return false;
  }, [
    customModal.visible,
    showSizeSlider,
    showDetailsPanel,
    isTocOpen,
    isAnnotating,
    hasUnsavedChanges,
    handleExitAnnotationMode,
    showComments,
    showQnaPanel,
    isLocked,
    navigation,
    saveRecentReadProgress,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackAction
    );
    return () => subscription.remove();
  }, [handleBackAction]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      void saveRecentReadProgress();
    });
    return () => {
      unsubscribe();
    };
  }, [navigation, saveRecentReadProgress]);

  const downloadPdfToDisk = useCallback(
    async (chapterId: string, remoteUrl: string): Promise<string | null> => {
      const cleanUrl = normalizeMediaUrl(remoteUrl);
      if (!chapterId || !cleanUrl) return null;

      if (cleanUrl.startsWith("file://") || cleanUrl.startsWith("content://")) {
        ramPdfUriMap.set(chapterId, cleanUrl);
        return cleanUrl;
      }

      const targetDir = FileSystem.documentDirectory;
      if (!targetDir) return cleanUrl;

      const urlHash = getFastHash(cleanUrl);
      const localFileUri = `${targetDir}fastpdf_${chapterId}_${urlHash}.pdf`;
      const storageUriKey = `fast_pdf_uri_${chapterId}`;
      const storageUrlKey = `fast_pdf_url_${chapterId}`;

      try {
        const info = await FileSystem.getInfoAsync(localFileUri);
        if (info.exists && (info.size ?? 0) > 512) {
          ramPdfUriMap.set(chapterId, info.uri);
          ramUrlMap.set(chapterId, cleanUrl);
          AsyncStorage.multiSet([
            [storageUriKey, info.uri],
            [storageUrlKey, cleanUrl],
          ]).catch(() => {});
          return info.uri;
        }

        let job = activeDownloadJobs.get(localFileUri);
        if (!job) {
          job = FileSystem.downloadAsync(cleanUrl, localFileUri)
            .then(async (res) => {
              if (res?.uri) {
                const verify = await FileSystem.getInfoAsync(res.uri);
                if (verify.exists && (verify.size ?? 0) > 512) {
                  const prevUri = await AsyncStorage.getItem(storageUriKey);
                  if (prevUri && prevUri !== verify.uri) {
                    FileSystem.deleteAsync(prevUri, { idempotent: true }).catch(() => {});
                  }
                  FileSystem.deleteAsync(`${targetDir}doc_${chapterId}.pdf`, {
                    idempotent: true,
                  }).catch(() => {});

                  ramPdfUriMap.set(chapterId, verify.uri);
                  ramUrlMap.set(chapterId, cleanUrl);
                  await AsyncStorage.multiSet([
                    [storageUriKey, verify.uri],
                    [storageUrlKey, cleanUrl],
                  ]);
                  return verify.uri;
                }
              }
              await FileSystem.deleteAsync(localFileUri, { idempotent: true }).catch(() => {});
              return null;
            })
            .catch(async () => {
              await FileSystem.deleteAsync(localFileUri, { idempotent: true }).catch(() => {});
              return null;
            })
            .finally(() => {
              activeDownloadJobs.delete(localFileUri);
            });

          activeDownloadJobs.set(localFileUri, job);
        }

        return await job;
      } catch {
        return null;
      }
    },
    []
  );

  const extractValidQuestions = useCallback((rawList: any): IQuestion[] => {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .map((q: any) => (q?.content ? q.content : q))
      .filter(
        (q: any) =>
          q &&
          typeof q === "object" &&
          typeof q._id === "string" &&
          q._id.length > 0 &&
          typeof q.question === "string" &&
          q.question.trim().length > 0 &&
          Array.isArray(q.options) &&
          q.options.length > 0
      );
  }, []);

  const loadChapterAndPdfFast = useCallback(
    async (targetId: string, isCancelledRef?: { current: boolean }) => {
      if (!targetId || targetId === "undefined") return;

      const storageUriKey = `fast_pdf_uri_${targetId}`;
      const storageUrlKey = `fast_pdf_url_${targetId}`;
      const cachedChKey = `cached_ch_${targetId}`;
      const realPagesKey = `pdf_real_pages_${targetId}`;

      let mountedLocalUri: string | null = ramPdfUriMap.get(targetId) || null;
      let storedMediaUrl: string | null = ramUrlMap.get(targetId) || null;

      try {
        if (mountedLocalUri) {
          setPdfPath(mountedLocalUri);
        }

        if (initialBookParam?.questions) {
          const initQs = extractValidQuestions(initialBookParam.questions);
          if (initQs.length > 0 && !isCancelledRef?.current) {
            setQuestions((prev) => (prev && prev.length > 0 ? prev : initQs));
          }
        }

        const [[, diskUri], [, diskUrl], [, cachedChRaw], [, savedRealPages]] =
          await AsyncStorage.multiGet([
            storageUriKey,
            storageUrlKey,
            cachedChKey,
            realPagesKey,
          ]);

        if (savedRealPages && Number(savedRealPages) > 0) {
          const trueCount = Number(savedRealPages);
          ramRealPagesMap.set(targetId, trueCount);
          if (!isCancelledRef?.current) {
            setTotalPages(trueCount);
          }
        }

        if (cachedChRaw) {
          const parsedCh = JSON.parse(cachedChRaw);
          const cachedQuestions = extractValidQuestions(parsedCh.questions);

          const cleanParsedCh = { ...parsedCh, questions: cachedQuestions };
          ramBookMetaMap.set(targetId, cleanParsedCh);

          if (!isCancelledRef?.current) {
            setBook((prev) => ({ ...(prev || {}), ...cleanParsedCh }));
            if (cachedQuestions.length > 0) {
              setQuestions(cachedQuestions);
            }
          }
          if (!storedMediaUrl && parsedCh.media) {
            storedMediaUrl = normalizeMediaUrl(parsedCh.media);
          }
        }

        if (!mountedLocalUri && diskUri) {
          const info = await FileSystem.getInfoAsync(diskUri);
          if (info.exists && (info.size ?? 0) > 512) {
            mountedLocalUri = info.uri;
            ramPdfUriMap.set(targetId, info.uri);
            if (diskUrl) {
              storedMediaUrl = diskUrl;
              ramUrlMap.set(targetId, diskUrl);
            }
            if (!isCancelledRef?.current) {
              setPdfPath(info.uri);
            }
          }
        }

        if (!mountedLocalUri) {
          const downloaded = await getSingleDownloaded(targetId);
          if (downloaded) {
            if (!isCancelledRef?.current) {
              setBook((prev) => prev || (downloaded as unknown as BookPopulated));
            }
            const dlUri = (downloaded as any).localUri || downloaded.media;
            if (dlUri && dlUri.startsWith("file://")) {
              const dlInfo = await FileSystem.getInfoAsync(dlUri);
              if (dlInfo.exists && (dlInfo.size ?? 0) > 512) {
                mountedLocalUri = dlInfo.uri;
                ramPdfUriMap.set(targetId, dlInfo.uri);
                if (!isCancelledRef?.current) setPdfPath(dlInfo.uri);
              }
            }
          }
        }

        const initialMedia = normalizeMediaUrl(
          initialBookParam?.media || initialBookParam?.content?.media
        );
        if (!mountedLocalUri && (storedMediaUrl || initialMedia)) {
          const targetUrlToFetch = storedMediaUrl || initialMedia;
          downloadPdfToDisk(targetId, targetUrlToFetch).then((localUri) => {
            if (localUri && !isCancelledRef?.current) {
              setPdfPath((cur) => cur || localUri);
            }
          });
        }
      } catch (e) {
        console.warn("Fast disk hydration warning:", e);
      }

      if (!isConnected) return;

      try {
        const chapter = await api.get(`/chapter/${targetId}`).catch(() => null);

        if (chapter?.data?.data) {
          const freshData: BookPopulated = chapter.data.data;
          const freshMediaUrl = normalizeMediaUrl(freshData.media);

          const urlChangedInDb = Boolean(
            storedMediaUrl && freshMediaUrl && storedMediaUrl !== freshMediaUrl
          );

          if (urlChangedInDb) {
            ramRealPagesMap.delete(targetId);
            await AsyncStorage.removeItem(realPagesKey).catch(() => {});
            if (!isCancelledRef?.current) {
              setTotalPages(0);
            }
          }

          const freshQuestions = extractValidQuestions(freshData.questions);

          const verifiedCount = ramRealPagesMap.get(targetId) || 0;
          const mergedBook = {
            ...freshData,
            questions: freshQuestions,
            total: verifiedCount > 0 ? verifiedCount : freshData.total,
          };

          ramBookMetaMap.set(targetId, mergedBook);
          AsyncStorage.setItem(cachedChKey, JSON.stringify(mergedBook)).catch(() => {});

          if (!isCancelledRef?.current) {
            setBook((prev) => ({
              ...mergedBook,
              likes: freshData.likes ?? prev?.likes ?? 0,
            }));

            setQuestions(freshQuestions.length > 0 ? freshQuestions : null);
          }

          if (freshMediaUrl && (!mountedLocalUri || urlChangedInDb)) {
            const newLocalUri = await downloadPdfToDisk(targetId, freshMediaUrl);
            if (!isCancelledRef?.current) {
              if (newLocalUri) {
                setPdfPath(newLocalUri);
              } else if (!mountedLocalUri) {
                setPdfPath(freshMediaUrl);
              }
            }
          }

          try {
            const rawReads = await AsyncStorage.getItem("recentReads");
            if (rawReads) {
              const list: IRecentRead[] = JSON.parse(rawReads);
              const idx = list.findIndex((r) => r?.content?._id === targetId);
              if (idx !== -1) {
                list[idx].content = {
                  ...list[idx].content,
                  ...freshData,
                  comments: Array.isArray(freshData.comments)
                    ? freshData.comments.length
                    : 0,
                  category: freshData.category?.name || freshData.category?._id || "",
                };
                if (freshData.total) {
                  list[idx].total = String(freshData.total);
                }
                await AsyncStorage.setItem("recentReads", JSON.stringify(list));
              }
            }
          } catch {}

          if (freshData.series) {
            const seriesId =
              typeof freshData.series === "object"
                ? freshData.series._id
                : freshData.series;

            if (seriesId) {
              try {
                const sRes = await api.get(`/series/${seriesId}`).catch(() => null);
                if (sRes?.data?.data && !isCancelledRef?.current) {
                  setSeriesData(sRes.data.data);
                }
              } catch {}
            }
          }
        }
      } catch (err: any) {}
    },
    [isConnected, initialBookParam, downloadPdfToDisk, extractValidQuestions]
  );

  useEffect(() => {
    if (!activeChapterId) return;
    const isCancelledRef = { current: false };

    const ramUri = ramPdfUriMap.get(activeChapterId) || null;
    const verifiedPages = ramRealPagesMap.get(activeChapterId) || 0;

    setPdfPath(ramUri);
    setTotalPages(verifiedPages);
    setCurrentPage(incomingPage);
    currentPageRef.current = incomingPage;

    const initialValidQs = extractValidQuestions(initialBookParam?.questions);
    setQuestions(initialValidQs.length > 0 ? initialValidQs : null);

    setShowQnaPanel(false);
    setSolvedIds(new Set());
    setSeriesData(null);
    setRelatedStandaloneBooks([]);
    setIsLocked(true);
    setIsAnnotating(false);
    setShowSizeSlider(false);
    setShowDetailsPanel(false);
    setIsTocOpen(false);
    setCurrentPageStrokes([]);
    setHasUnsavedChanges(false);
    hasUnsavedChangesRef.current = false;
    currentScrollYRef.current = MORPH_DISTANCE;
    scrollY.setValue(MORPH_DISTANCE);
    borderDriver.setValue(MORPH_DISTANCE);

    loadChapterAndPdfFast(activeChapterId, isCancelledRef);

    return () => {
      isCancelledRef.current = true;
    };
  }, [activeChapterId]);

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
        const excludedSeriesChapterIds = new Set<string>();

        const collectSeriesChapterIds = (seriesList: any[]) => {
          if (!Array.isArray(seriesList)) return;
          seriesList.forEach((s) => {
            if (!s) return;
            const recId =
              typeof s.recommendationBookId === "object"
                ? s.recommendationBookId?._id
                : s.recommendationBookId;
            if (recId) excludedSeriesChapterIds.add(String(recId).trim());

            if (Array.isArray(s.chapters)) {
              s.chapters.forEach((ch: any) => {
                const chId =
                  (typeof ch?.content === "object" && ch?.content?._id) ||
                  (typeof ch?.content === "string" && ch?.content) ||
                  ch?._id;
                if (chId) excludedSeriesChapterIds.add(String(chId).trim());
              });
            }
          });
        };

        let feedAvailableStandalone: any[] = [];
        try {
          const cachedFeedRaw = await AsyncStorage.getItem("cached_feed_data");
          if (cachedFeedRaw) {
            const cachedFeed = JSON.parse(cachedFeedRaw);
            if (cachedFeed?.series) {
              collectSeriesChapterIds(cachedFeed.series);
            }
            if (Array.isArray(cachedFeed?.available)) {
              feedAvailableStandalone = [
                ...feedAvailableStandalone,
                ...cachedFeed.available,
              ];
            }
            if (Array.isArray(cachedFeed?.trending)) {
              feedAvailableStandalone = [
                ...feedAvailableStandalone,
                ...cachedFeed.trending,
              ];
            }
            if (Array.isArray(cachedFeed?.personalized)) {
              feedAvailableStandalone = [
                ...feedAvailableStandalone,
                ...cachedFeed.personalized,
              ];
            }
          }
        } catch {}

        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const seriesKeys = allKeys.filter((k) => k.startsWith("cache_series_"));
          if (seriesKeys.length > 0) {
            const seriesPairs = await AsyncStorage.multiGet(seriesKeys);
            const parsedSeries = seriesPairs
              .map(([_, val]) => (val ? JSON.parse(val) : null))
              .filter(Boolean);
            collectSeriesChapterIds(parsedSeries);
          }
        } catch {}

        if (excludedSeriesChapterIds.has(String(book._id).trim())) {
          if (isMounted) setRelatedStandaloneBooks([]);
          return;
        }

        const catId =
          typeof book.category === "object"
            ? book.category?._id
            : book.category;

        let rawPool: any[] = [...feedAvailableStandalone];

        if (catId && isConnected) {
          try {
            const catRes = await api.get(`/chapter/category/${catId}`).catch(() => null);
            if (catRes?.data?.data && Array.isArray(catRes.data.data)) {
              rawPool = [...rawPool, ...catRes.data.data];
            }
          } catch {}
        }

        if (rawPool.length < 6 && isConnected) {
          try {
            const feedRes = await api.get("/feed").catch(() => null);
            const payload = feedRes?.data?.data ?? feedRes?.data;
            if (payload) {
              if (Array.isArray(payload.series)) {
                collectSeriesChapterIds(payload.series);
              }
              if (Array.isArray(payload.available)) {
                rawPool = [...rawPool, ...payload.available];
              }
              if (Array.isArray(payload.trending)) {
                rawPool = [...rawPool, ...payload.trending];
              }
            }
          } catch {}
        }

        if (excludedSeriesChapterIds.has(String(book._id).trim())) {
          if (isMounted) setRelatedStandaloneBooks([]);
          return;
        }

        const strictlyStandalone = rawPool.filter((item: any) => {
          if (!isStrictlyStandaloneBook(item, excludedSeriesChapterIds)) {
            return false;
          }
          const itemId = String(item?.content?._id || item?._id || "").trim();
          return itemId !== String(book._id).trim();
        });

        const uniqueMap = new Map<string, any>();
        strictlyStandalone.forEach((item) => {
          const actual =
            typeof item.content === "object" && item.content !== null
              ? item.content
              : item;
          if (actual?._id) {
            uniqueMap.set(String(actual._id), actual);
          }
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

        if (isMounted) {
          setRelatedStandaloneBooks(finalFour);
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
    setTotalPages(0);
  }, [book?.media]);

  const pdfSource: Source | null = useMemo(() => {
    if (!pdfPath || book?.type === "audio") return null;
    const isLocalFile = pdfPath.startsWith("file://");
    return {
      uri: pdfPath,
      cache: !isLocalFile,
    };
  }, [pdfPath, book?.type]);

  const onPageChangedHandler = useCallback(
    (newPage: number, numberOfPages?: number) => {
      if (newPage <= 0) return;
      if (numberOfPages && numberOfPages > 0) {
        setTotalPages((prev) => (prev === numberOfPages ? prev : numberOfPages));
      }
      currentPageRef.current = newPage;
      setCurrentPage((prev) => (prev === newPage ? prev : newPage));
      void saveRecentReadProgress(newPage, numberOfPages);
    },
    [saveRecentReadProgress]
  );

  const onPdfLoadComplete = useCallback(
    (numberOfPages: number) => {
      if (numberOfPages > 0) {
        ramRealPagesMap.set(activeChapterId, numberOfPages);
        totalPagesRef.current = numberOfPages;
        setTotalPages(numberOfPages);
        AsyncStorage.setItem(
          `pdf_real_pages_${activeChapterId}`,
          String(numberOfPages)
        ).catch(() => {});
      }
      if (currentPageRef.current > 1 && currentPageRef.current !== incomingPage) {
        pdfRef.current?.setPage(currentPageRef.current);
      }
      void saveRecentReadProgress(currentPageRef.current, numberOfPages);
    },
    [activeChapterId, incomingPage, saveRecentReadProgress]
  );

  const onPdfPageSingleTap = useCallback(() => {
    if (!isAnnotating && !isTocOpen && !showDetailsPanel) {
      setShowPdfControls((prev) => !prev);
    }
  }, [isAnnotating, isTocOpen, showDetailsPanel]);

  const onPdfScaleChanged = useCallback(
    (currentScale: number) => {
      if (!isAnnotating) {
        const shouldShow = currentScale <= 1.05;
        setShowPdfControls((prev) => (prev === shouldShow ? prev : shouldShow));
      }
    },
    [isAnnotating]
  );

  const goToPage = useCallback(
    (targetPage: number) => {
      if (targetPage < 1) return;
      currentPageRef.current = targetPage;
      setCurrentPage(targetPage);
      void saveRecentReadProgress(targetPage);
      try {
        pdfRef.current?.setPage(targetPage);
      } catch (e) {
        console.warn("goToPage error:", e);
      }
    },
    [saveRecentReadProgress]
  );

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
          if (isAnnotating) {
            setIsAnnotating(false);
            setShowSizeSlider(false);
          }
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
      if (isAnnotating) {
        setIsAnnotating(false);
        setShowSizeSlider(false);
      }
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

  useEffect(() => {
    if (incomingPage > 1) return;

    let cancelled = false;
    const checkSavedProgress = async () => {
      try {
        const raw = await AsyncStorage.getItem("recentReads");
        if (!raw || cancelled) return;
        const list = JSON.parse(raw);
        const entry = (Array.isArray(list) ? list : []).find(
          (item: any) => String(item?.content?._id) === String(activeChapterId)
        );
        const savedPage = parseInt(String(entry?.readtill || "0"), 10);
        if (!cancelled && Number.isFinite(savedPage) && savedPage > 1) {
          setResumeBanner({ visible: true, page: savedPage });
          if (resumeBannerTimer.current) {
            clearTimeout(resumeBannerTimer.current);
          }
          resumeBannerTimer.current = setTimeout(() => {
            setResumeBanner((prev) => ({ ...prev, visible: false }));
          }, 40000);
        }
      } catch {}
    };
    checkSavedProgress();
    return () => {
      cancelled = true;
      if (resumeBannerTimer.current) {
        clearTimeout(resumeBannerTimer.current);
        resumeBannerTimer.current = null;
      }
    };
  }, [activeChapterId, incomingPage]);

  const openToc = () => setIsTocOpen(true);
  const closeToc = () => setIsTocOpen(false);

  const toggleCanvasTheme = useCallback(() => {
    setCanvasTheme((prev) => {
      const nextTheme = prev === "dark" ? "light" : "dark";
      AsyncStorage.setItem("pdf_canvas_theme", nextTheme).catch(() => {});
      return nextTheme;
    });
  }, []);

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

  const translateYTo = targetCenterY - fullHeight / 2;

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

  const like = async () => {
    if (!book) return;

    const nextLiked = !isLiked;
    const currentLikes = (book.likes || 0) + (nextLiked ? 1 : -1);
    const resolvedLikes = Math.max(0, currentLikes);

    setIsLiked(nextLiked);
    heartScale.setValue(0.7);
    particleAnim.setValue(0);
    Animated.parallel([
      Animated.spring(heartScale, {
        toValue: 1.3,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(particleAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      heartScale.setValue(1);
      particleAnim.setValue(0);
    });

    setBook((prev) => (prev ? { ...prev, likes: resolvedLikes } : prev));

    try {
      DeviceEventEmitter.emit("like-updated", {
        chapterId: activeChapterId,
        liked: nextLiked,
        count: resolvedLikes,
      });
    } catch {}

    await AsyncStorage.setItem(`liked_${activeChapterId}`, String(nextLiked));

    try {
      const cached = await AsyncStorage.getItem(`cached_ch_${activeChapterId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.likes = resolvedLikes;
        await AsyncStorage.setItem(
          `cached_ch_${activeChapterId}`,
          JSON.stringify(parsed)
        );
      }
    } catch {}

    if (!isConnected || !accessToken) return;

    try {
      await api.post("/chapter/like", { chapterId: activeChapterId });
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
      const cleanUrl = normalizeMediaUrl(book.media);
      const urlHash = getFastHash(cleanUrl);
      const downloadPath = `${targetDir}fastpdf_${book._id}_${urlHash}.pdf`;

      const downloadResumable = FileSystem.createDownloadResumable(
        cleanUrl,
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
        ramPdfUriMap.set(book._id, result.uri);
        ramUrlMap.set(book._id, cleanUrl);
        await AsyncStorage.multiSet([
          [`fast_pdf_uri_${book._id}`, result.uri],
          [`fast_pdf_url_${book._id}`, cleanUrl],
        ]);
        setPdfPath(result.uri);
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
      console.warn("In-place download error:", e);
      setIsDownloading(false);
      setDownloadProgress(0);
      showToast({ title: "Failed to download chapter" });
    }
  };

  const displayAuthor =
    book?.author && book.author.trim() !== "" ? book.author : "Readapt Creator";

  const isSeriesContent = Boolean(book?.series || seriesData);
  const showStandaloneRelated =
    !isSeriesContent && relatedStandaloneBooks.length > 0;

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
          backgroundColor: !isLocked ? currentBgColor : pallete.bgmain,
        },
      ]}>
      {/* Morphing Master Reader Canvas (Removed static hardware texture freeze so theme background updates instantly) */}
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
            <View
              style={[
                styles.pdfBackdropContainer,
                {
                  height: fullHeight,
                },
              ]}>
              <MemoizedPdfCanvas
                key={pdfSource.uri}
                pdfRef={pdfRef}
                source={pdfSource}
                initialPage={incomingPage}
                onPageChanged={onPageChangedHandler}
                onLoadComplete={onPdfLoadComplete}
                onPageSingleTap={onPdfPageSingleTap}
                onScaleChanged={onPdfScaleChanged}
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
                    <CompletedStrokesSvg
                      strokes={currentPageStrokes}
                      width={SCREEN_WIDTH}
                      height={fullHeight}
                    />
                    <Path
                      ref={activeSvgPathRef}
                      d=""
                      fill="none"
                      stroke={selectedColor}
                      strokeWidth={currentToolSize}
                      strokeOpacity={currentToolOpacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
            <View style={styles.expandOverlay} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.expandBadge}
                activeOpacity={0.8}
                onPress={() => {
                  setIsLocked(false);
                  scrollRef.current?.scrollTo({ y: 0, animated: true });
                }}>
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
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </Animated.View>

      {/* Main Page Scroll */}
      <Animated.ScrollView
        ref={scrollRef}
        contentOffset={INITIAL_CONTENT_OFFSET}
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
              <Text style={styles.statItem}>{book?.likes || 0} likes</Text>
              <View style={styles.divider} />
              <Text style={styles.statItem}>
                {Array.isArray(book?.comments)
                  ? book?.comments.length
                  : typeof book?.comments === "number"
                  ? book.comments
                  : 0}{" "}
                comments
              </Text>
            </View>

            <View style={styles.controlStatsBar}>
              <View style={styles.leftControls}>
                <PopButton onPress={like}>
                  <Animated.View
                    style={{
                      transform: [{ scale: heartScale }],
                      position: "relative",
                    }}>
                    <ControlButton
                      icon="heart"
                      strokeWidth={isLiked ? 0 : 2}
                      filled={isLiked ? "#eb4040" : "none"}
                    />
                    {[-1, 0, 1].map((spread) => (
                      <Animated.View
                        key={spread}
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          left: 9 + spread * 8,
                          top: 8,
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: spread === 0 ? "#ffffff" : "#fb7185",
                          opacity: particleAnim.interpolate({
                            inputRange: [0, 0.15, 0.75, 1],
                            outputRange: [0, 1, 1, 0],
                          }),
                          transform: [
                            {
                              translateY: particleAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -32 + spread * 8],
                              }),
                            },
                            {
                              translateX: particleAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, spread * 6],
                              }),
                            },
                            {
                              scale: particleAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.4, 1.3],
                              }),
                            },
                          ],
                        }}
                      />
                    ))}
                  </Animated.View>
                </PopButton>
                <PopButton onPress={() => setShowComments(true)}>
                  <ControlButton icon="message" />
                </PopButton>
                <PopButton onPress={share}>
                  <ControlButton icon="share" />
                </PopButton>

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
                      <Svg
                        width={22}
                        height={22}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#00D2B4"
                        strokeWidth="2.5">
                        <Polyline points="20 6 9 17 4 12" />
                      </Svg>
                    </View>
                  ) : (
                    <ControlButton icon="download" />
                  )}
                </PopButton>
              </View>

              <PopButton onPress={() => setShowDetailsPanel(true)}>
                <View style={styles.controlItem}>
                  <Feather name="info" size={22} color="#9ca3af" />
                </View>
              </PopButton>

              <PopButton onPress={() => setShowQnaPanel(true)}>
                <View style={styles.controlItem}>
                  <Feather name="help-circle" size={22} color="#e5e7eb" />
                  {questions && questions.length > 0 ? (
                    <View style={styles.qnaCountBadge}>
                      <Text style={styles.qnaCountBadgeText}>
                        {questions.length}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </PopButton>
            </View>
          </View>
        </View>

        {/* Section: Series vs Strictly Standalone */}
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
                  void saveRecentReadProgress();
                  navigation.push("ReadBook", {
                    bookId: String(nextId),
                    initialBookData: nextBook,
                  });
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
                    void saveRecentReadProgress();
                    navigation.push("ReadBook", {
                      bookId: String(relBook._id),
                      initialBookData: relBook,
                    });
                  }}>
                  <View pointerEvents="none">
                    <ContentCard
                      book={relBook}
                      index={-1}
                      seriesType={"standalone" as any}
                    />
                  </View>
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

          <VerticalSizeSlider
            visible={showSizeSlider}
            minSize={selectedTool === "highlighter" ? 10 : 1.5}
            maxSize={selectedTool === "highlighter" ? 42 : 16}
            currentSize={currentToolSize}
            color={selectedColor}
            onChangeSize={handleSizeChange}
            bottomOffset={insets.bottom + 68}
          />

          <View
            style={[
              styles.annotationBottomBar,
              { paddingBottom: insets.bottom + 8 },
            ]}>
            <View style={styles.annotToolsGroup}>
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

            <View style={styles.annotRightControls}>
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

              <TouchableOpacity
                style={[
                  styles.sizeIconButton,
                  showSizeSlider && styles.sizeIconButtonActive,
                ]}
                onPress={() => setShowSizeSlider((prev) => !prev)}
                activeOpacity={0.8}>
                <Svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={showSizeSlider ? "#ffffff" : "#d1d5db"}
                  strokeWidth="2">
                  <Circle cx="12" cy="12" r="9" strokeOpacity="0.45" />
                  <Circle
                    cx="12"
                    cy="12"
                    r="4"
                    fill={showSizeSlider ? "#ffffff" : pallete.accent}
                    stroke="none"
                  />
                </Svg>
                <Text style={styles.sizeBadgeLabel}>
                  {Math.round(currentToolSize)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ⚡ Smooth Native Fade Dialog Modal for Clear Page & Unsaved Changes */}
      <Modal
        visible={customModal.visible}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setCustomModal((prev) => ({ ...prev, visible: false }))}>
        <TouchableOpacity
          style={styles.customModalOverlay}
          activeOpacity={1}
          onPress={() => setCustomModal((prev) => ({ ...prev, visible: false }))}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.customModalContainer}
            onPress={() => {}}>
            <Text style={styles.customModalTitle}>{customModal.title}</Text>
            <Text style={styles.customModalDesc}>{customModal.description}</Text>

            <View style={styles.customModalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCustomModal((prev) => ({ ...prev, visible: false }))}
                activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>
                  {customModal.cancelText || "Cancel"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={customModal.onConfirm}
                activeOpacity={0.8}>
                <Text style={styles.modalConfirmText}>{customModal.confirmText}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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

      {/* FULLSCREEN QNA MODAL */}
      <Modal
        visible={showQnaPanel}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowQnaPanel(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#08090a",
            paddingTop: insets.top + 8,
          }}>
          <View style={styles.qnaHeader}>
            <Text style={styles.qnaHeaderTitle}>Questions</Text>
            <TouchableOpacity
              onPress={() => setShowQnaPanel(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, justifyContent: "center" }}>
            {questions && questions.length > 0 ? (
              <FlatList
                data={questions}
                keyExtractor={(item: IQuestion, index: number) =>
                  item?._id ? String(item._id) : `q_${index}`
                }
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }: { item: IQuestion }) => {
                  if (
                    !item ||
                    typeof item !== "object" ||
                    !item._id ||
                    !item.question ||
                    !Array.isArray(item.options) ||
                    item.options.length === 0
                  ) {
                    return null;
                  }

                  return (
                    <View
                      style={{
                        width: SCREEN_WIDTH,
                        paddingHorizontal: 20,
                        justifyContent: "center",
                        alignItems: "center",
                      }}>
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{
                          paddingVertical: 20,
                          width: "100%",
                        }}
                        style={{ width: "100%" }}>
                        <QuestionCard
                          question={item}
                          onCommentClick={() => {
                            setCommentedQueId(item._id);
                            setShowQnaComments(true);
                          }}
                          onAttempted={() => {
                            setSolvedIds((prev) => {
                              const next = new Set(prev);
                              next.add(String(item._id));
                              return next;
                            });
                          }}
                        />
                      </ScrollView>
                    </View>
                  );
                }}
              />
            ) : (
              <View style={styles.qnaEmptyState}>
                <Text style={styles.qnaEmptyText}>
                  No Q&A available for this chapter.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.qnaIndicatorBottomLeft}>
            <Text style={styles.qnaProgressText}>
              {solvedIds.size} / {questions?.length || 0}
            </Text>
          </View>
        </View>
      </Modal>

      <CommentsDrawer
        visible={showComments}
        reload={() => loadChapterAndPdfFast(activeChapterId)}
        onClose={() => setShowComments(false)}
        chapterId={activeChapterId}
        initialComments={Array.isArray(book?.comments) ? (book?.comments as any) : []}
        isQuestion={false}
      />

      <CommentsDrawer
        visible={showQnaComments}
        reload={() => loadChapterAndPdfFast(activeChapterId)}
        onClose={() => {
          setShowQnaComments(false);
          setCommentedQueId("");
        }}
        chapterId={commentedQueId}
        initialComments={[]}
        isQuestion={true}
      />

      {resumeBanner.visible && (
        <View style={styles.resumeBanner}>
          <Text style={styles.resumeBannerText}>Continue from page {resumeBanner.page}?</Text>

          <TouchableOpacity
            onPress={() => {
              goToPage(resumeBanner.page);
              setResumeBanner({ visible: false, page: 1 });
              if (resumeBannerTimer.current) {
                clearTimeout(resumeBannerTimer.current);
                resumeBannerTimer.current = null;
              }
            }}
            style={styles.resumeBannerIconBtn}
            activeOpacity={0.8}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setResumeBanner({ visible: false, page: 1 });
              if (resumeBannerTimer.current) {
                clearTimeout(resumeBannerTimer.current);
                resumeBannerTimer.current = null;
              }
            }}
            style={styles.resumeBannerIconBtn}
            activeOpacity={0.8}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5">
              <Line x1="18" y1="6" x2="6" y2="18" />
              <Line x1="6" y1="6" x2="18" y2="18" />
            </Svg>
          </TouchableOpacity>
        </View>
      )}
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
  pdfBackdropContainer: {
    width: SCREEN_WIDTH,
  },
  singlePdfView: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: "100%",
   backgroundColor: "#01000000",
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
  annotationBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 15, 20, 0.95)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  annotToolsGroup: {
    flexDirection: "row",
    gap: 8,
  },
  toolChip: {
    width: 40,
    height: 38,
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
    marginHorizontal: 8,
  },
  annotRightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  annotColorsGroup: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  colorDotWrapper: {
    padding: 2.5,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  colorDotWrapperActive: {
    borderColor: "#ffffff",
  },
  colorDot: {
    width: 19,
    height: 19,
    borderRadius: 9.5,
  },
  sizeIconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sizeIconButtonActive: {
    backgroundColor: pallete.accent,
    borderColor: pallete.accent,
  },
  sizeBadgeLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    minWidth: 14,
    textAlign: "center",
  },
  verticalSliderCard: {
    position: "absolute",
    right: 16,
    width: 52,
    backgroundColor: "rgba(18, 18, 26, 0.96)",
    borderRadius: 26,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 25,
  },
  sliderPreviewBox: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  sliderGestureArea: {
    width: 44,
    height: SLIDER_TRACK_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  sliderTrackBg: {
    width: 6,
    height: SLIDER_TRACK_HEIGHT,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  sliderTrackFill: {
    width: "100%",
    borderRadius: 3,
  },
  sliderThumb: {
    position: "absolute",
    top: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  customModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  customModalContainer: {
    width: "100%",
    backgroundColor: "#181820",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  customModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
  },
  customModalDesc: {
    fontSize: 13.5,
    color: "#9ca3af",
    lineHeight: 19,
    marginBottom: 22,
  },
  customModalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  modalCancelText: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600",
  },
  resumeBanner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(15, 15, 17, 0.98)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    zIndex: 9999,
    elevation: 12,
  },
  resumeBannerText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  resumeBannerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  qnaHeader: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  qnaHeaderTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  qnaEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  qnaEmptyText: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "500",
  },
  qnaIndicatorBottomLeft: {
    position: "absolute",
    left: 18,
    bottom: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  qnaProgressText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  qnaCountBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#eb4040",
    alignItems: "center",
    justifyContent: "center",
  },
  qnaCountBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  modalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#eb4040",
  },
  modalConfirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});

export default BookReaderScreen;