import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../lib/api";
import { useUser } from "../../hooks/useUser";
import { ISeries } from "../../types/Series";
import CachedImage from "./CachedImage";

const COMPLETED_QNA_KEY_PREFIX = "@completed_qna_chapters_";

// --- SVG Icons (Pure Native Paths) ---
const CheckmarkIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path
      d="M20 6L9 17L4 12"
      stroke="#ffffff"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const LockIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Rect
      x={3}
      y={11}
      width={18}
      height={11}
      rx={2}
      ry={2}
      stroke="#ffffff"
      strokeWidth={2}
    />
    <Path
      d="M7 11V7a5 5 0 0 1 10 0v4"
      stroke="#ffffff"
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

const UnlockedLockIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Rect
      x={3}
      y={11}
      width={18}
      height={11}
      rx={2}
      ry={2}
      stroke="#10b981"
      strokeWidth={2}
    />
    <Path
      d="M7 11V7a5 5 0 0 1 9.9-1"
      stroke="#10b981"
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

const QnaBubbleIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      stroke="#2dd4bf"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M12 8v4M12 16h.01"
      stroke="#2dd4bf"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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

interface FrameworkLevelProgressProps {
  currentChapter: any;
  seriesData?: ISeries | null;
  seriesId?: string;
  onOpenQna?: () => void;
  onOpenNextLevel?: () => void;
  questions?: any[];
}

export default function FrameworkLevelProgress({
  currentChapter,
  seriesData: propSeriesData,
  seriesId: propSeriesId,
  onOpenQna,
  onOpenNextLevel,
  questions: propQuestions,
}: FrameworkLevelProgressProps) {
  const { user } = useUser();
  const [internalSeries, setInternalSeries] = useState<ISeries | null>(propSeriesData || null);
  const [isCompletedInStorage, setIsCompletedInStorage] = useState(false);

  // Safely resolve series ID
  const cleanSeriesId = useMemo(() => {
    let raw: any = propSeriesId;
    if (!raw || raw === "undefined" || raw === "null") {
      raw = propSeriesData?._id;
    }
    if (!raw || raw === "undefined" || raw === "null") {
      const seriesObj = currentChapter?.series;
      if (seriesObj) {
        if (typeof seriesObj === "object" && seriesObj._id) {
          raw = seriesObj._id;
        } else if (typeof seriesObj === "string") {
          raw = seriesObj;
        }
      }
    }
    if (!raw || raw === "undefined" || raw === "null") {
      raw = user?.joinedSeries;
    }

    const str = String(raw || "").trim();
    if (
      str &&
      str !== "undefined" &&
      str !== "null" &&
      str !== "[object Object]" &&
      str.length >= 10
    ) {
      return str;
    }
    return null;
  }, [propSeriesId, propSeriesData?._id, currentChapter?.series, user?.joinedSeries]);

  // Sync / fetch series details if not provided
  useEffect(() => {
    let cancel = false;
    if (propSeriesData) {
      setInternalSeries(propSeriesData);
      return;
    }
    if (!cleanSeriesId) return;

    const fetchSeries = async () => {
      try {
        const res = await api.get(`/series/${cleanSeriesId}`);
        if (res?.data?.data && !cancel) {
          setInternalSeries(res.data.data);
        }
      } catch (e) {
        // Silently handle if series lookup fails
      }
    };

    fetchSeries();
    return () => {
      cancel = true;
    };
  }, [cleanSeriesId, propSeriesData]);

  // Check if current chapter Q&A is completed
  const currentChapterId = String(currentChapter?._id || currentChapter?.id || "");
  useEffect(() => {
    if (!currentChapterId) return;
    const checkCompletion = async () => {
      try {
        const storageKey = `${COMPLETED_QNA_KEY_PREFIX}${user?._id || user?.userId || "guest"}`;
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const list: string[] = JSON.parse(raw);
          setIsCompletedInStorage(list.includes(currentChapterId));
        }
      } catch {}
    };
    checkCompletion();
  }, [currentChapterId, user?._id, user?.userId]);

  // Chapter levels list
  const chapterItems = useMemo(() => {
    return internalSeries?.chapters?.filter((item) => item.contentModel === "Chapter") || [];
  }, [internalSeries?.chapters]);

  const totalLevels = Math.max(1, chapterItems.length || 1);

  // Find index of current chapter in the framework
  const currentIndex = useMemo(() => {
    if (chapterItems.length === 0) return 0;
    const idx = chapterItems.findIndex((item) => {
      const raw = item.content as any;
      const id = typeof raw === "object" ? String(raw?._id || raw?.id || "") : String(raw || "");
      return id && currentChapterId && id === currentChapterId;
    });
    return idx >= 0 ? idx : 0;
  }, [chapterItems, currentChapterId]);

  const currentLevelNumber = currentIndex + 1;
  const currentLevelTitle =
    (typeof chapterItems[currentIndex]?.content === "object"
      ? (chapterItems[currentIndex]?.content as any)?.title
      : null) ||
    currentChapter?.title ||
    "Foundation";

  // Next level info
  const nextItem = chapterItems[currentIndex + 1];
  const hasNextLevel = Boolean(nextItem);
  const nextLevelNumber = currentLevelNumber + 1;
  const nextLevelRaw = nextItem?.content;
  const nextLevelData: any = typeof nextLevelRaw === "object" ? nextLevelRaw : null;
  const nextLevelTitle = nextLevelData?.title || "Building Strength";
  const nextLevelCover = nextLevelData?.cover || null;

  // Questions calculation
  const totalQuestions = useMemo(() => {
    if (propQuestions && propQuestions.length > 0) return propQuestions.length;
    if (Array.isArray(currentChapter?.questions) && currentChapter.questions.length > 0) {
      return currentChapter.questions.length;
    }
    return 5;
  }, [propQuestions, currentChapter?.questions]);

  // Attempted questions calculation
  const answeredQuestions = useMemo(() => {
    if (isCompletedInStorage) return totalQuestions;
    const userAttempts = user?.questionsAttempted || [];
    if (userAttempts.length === 0) return 0;

    let count = 0;
    const qList = propQuestions || currentChapter?.questions || [];
    if (Array.isArray(qList)) {
      qList.forEach((q: any) => {
        const qText = q?.question || q?.title;
        if (qText && userAttempts.some((att) => att.question === qText)) {
          count++;
        }
      });
    }

    return Math.min(totalQuestions, count);
  }, [isCompletedInStorage, totalQuestions, user?.questionsAttempted, propQuestions, currentChapter?.questions]);

  const isCurrentLevelDone = isCompletedInStorage || (totalQuestions > 0 && answeredQuestions >= totalQuestions);

  // Circular progress math (Safe, integer-rounded values)
  const size = 66;
  const strokeWidth = 5;
  const radius = 28;
  const circumference = Math.round(2 * Math.PI * radius); // ~176
  const progressRatio = isCurrentLevelDone
    ? 1
    : totalQuestions > 0
    ? Math.max(0, Math.min(1, answeredQuestions / totalQuestions))
    : 0;
  const strokeDashoffset = Math.round(circumference * (1 - progressRatio));

  return (
    <View style={styles.container}>
      {/* 1. CURRENT LEVEL PROGRESS CARD (Matches Image 2) */}
      <View style={styles.currentLevelCard}>
        <View style={styles.cardTopRow}>
          {/* Circular Progress Indicator with Safe Transform */}
          <View style={styles.circleWrap}>
            <View style={styles.svgRotator}>
              <Svg width={size} height={size}>
                {/* Background Track */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                {/* Colored Progress Arc */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="#10b981"
                  strokeWidth={strokeWidth}
                  strokeDasharray={[circumference, circumference]}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                />
              </Svg>
            </View>

            <View style={styles.circleInnerContent}>
              <Text style={styles.ratioText}>
                {answeredQuestions}/{totalQuestions}
              </Text>
            </View>
          </View>

          {/* Level Header Texts */}
          <View style={styles.levelInfoCol}>
            <Text style={styles.levelSmallTag}>LEVEL {currentLevelNumber}</Text>
            <Text style={styles.levelHeadingTitle} numberOfLines={1}>
              {currentLevelTitle}
            </Text>
            <Text style={styles.levelUnlockSub}>
              {hasNextLevel
                ? isCurrentLevelDone
                  ? `Level ${nextLevelNumber} is unlocked! You can continue now.`
                  : `Complete all questions to unlock Level ${nextLevelNumber}.`
                : "Complete all questions to master this framework."}
            </Text>
          </View>
        </View>

        {/* Divider Line */}
        <View style={styles.cardDivider} />

        {/* Bottom Q&A Progress Row with Chevron */}
        <TouchableOpacity
          style={styles.qnaProgressRow}
          activeOpacity={0.7}
          onPress={onOpenQna}
        >
          <View style={styles.qnaLeft}>
            <View style={styles.qnaIconCircle}>
              <QnaBubbleIcon />
            </View>
            <View style={styles.qnaTextCol}>
              <Text style={styles.qnaTitle}>Q&A Progress</Text>
              <Text style={styles.qnaCountSub}>
                {answeredQuestions} / {totalQuestions} completed
              </Text>
            </View>
          </View>

          <ChevronRightIcon color="#2dd4bf" size={18} />
        </TouchableOpacity>
      </View>

      {/* 2. NEXT LEVEL DYNAMIC STATUS CARD (Matches Image 2) */}
      {hasNextLevel && (
        <View style={styles.nextLevelSection}>
          <Text style={styles.nextLevelHeading}>Next Level</Text>

          <TouchableOpacity
            style={[
              styles.nextLevelCard,
              isCurrentLevelDone && styles.nextLevelCardUnlocked,
            ]}
            activeOpacity={isCurrentLevelDone ? 0.7 : 0.9}
            onPress={() => {
              if (isCurrentLevelDone) {
                onOpenNextLevel?.();
              }
            }}
          >
            {/* Blended subtle blurred cover backdrop */}
            {nextLevelCover ? (
              <CachedImage
                uri={nextLevelCover}
                style={styles.nextLevelCoverBackdrop}
                blurRadius={10}
                transition={0}
                showInitial={false}
              />
            ) : null}
            <View style={styles.nextLevelBackdropOverlay} />

            <View
              style={[
                styles.lockIconCircle,
                isCurrentLevelDone && styles.unlockedIconCircle,
              ]}
            >
              {isCurrentLevelDone ? <UnlockedLockIcon /> : <LockIcon />}
            </View>

            <View style={styles.nextLevelInfo}>
              <Text style={styles.nextLevelName}>Level {nextLevelNumber}</Text>
              <Text style={styles.nextLevelSubtitle} numberOfLines={1}>
                {nextLevelTitle}
              </Text>
              <Text
                style={[
                  styles.nextLevelRequirement,
                  isCurrentLevelDone && styles.nextLevelRequirementUnlocked,
                ]}
              >
                {isCurrentLevelDone
                  ? "Unlocked • Ready to start"
                  : `Complete Level ${currentLevelNumber} to unlock`}
              </Text>
            </View>

            <ChevronRightIcon
              color={isCurrentLevelDone ? "#10b981" : "#475569"}
              size={18}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 24,
  },
  // Card 1: Current Level
  currentLevelCard: {
    backgroundColor: "#0d1720",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  circleWrap: {
    width: 66,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  svgRotator: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 66,
    height: 66,
    transform: [{ rotate: "-90deg" }],
  },
  circleInnerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  ratioText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  levelInfoCol: {
    flex: 1,
    marginLeft: 16,
  },
  levelSmallTag: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  levelHeadingTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 2,
  },
  levelUnlockSub: {
    fontSize: 12.5,
    color: "#94a3b8",
    marginTop: 3,
    lineHeight: 17,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 14,
  },
  qnaProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qnaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qnaIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  qnaTextCol: {
    justifyContent: "center",
  },
  qnaTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  qnaCountSub: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },

  // Card 2: Next Level Locked
  nextLevelSection: {
    marginTop: 22,
  },
  nextLevelHeading: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 10,
  },
  nextLevelCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",
  },
  nextLevelCoverBackdrop: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    opacity: 0.28,
    resizeMode: "cover",
  },
  nextLevelBackdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 16, 24, 0.76)",
  },
  lockIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  nextLevelInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  nextLevelName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  nextLevelSubtitle: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 2,
  },
  nextLevelRequirement: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  nextLevelCardUnlocked: {
    borderColor: "rgba(16, 185, 129, 0.4)",
    backgroundColor: "rgba(16, 185, 129, 0.05)",
  },
  unlockedIconCircle: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  nextLevelRequirementUnlocked: {
    color: "#10b981",
    fontWeight: "600",
  },
  checkBadgeDone: {
    backgroundColor: "#10b981",
  },
});
