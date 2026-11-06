import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  ScrollView,
  Platform,
  Pressable,
  Vibration,
} from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// --- SVGs ---
const BigCheckmarkIcon = () => (
  <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
    <Path
      d="M20 6L9 17L4 12"
      stroke="#ffffff"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const ClockCheckIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke="#10b981" strokeWidth={2} />
    <Path d="M12 7v5l3 3" stroke="#10b981" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const PercentCheckIcon = ({ color = "#10b981" }: { color?: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={2} />
    <Path
      d="M9 12l2 2 4-4"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const UnlockedLockIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
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

const ArrowRightIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 12h14M12 5l7 7-7 7"
      stroke="#090314"
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

const BackArrowIcon = () => (
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

// --- Realistic Falling Confetti Particles ---
const CONFETTI_DATA = [
  { id: 0, xPct: 6, delay: 0, duration: 2200, size: 9, shape: "rect", color: "#fbbf24" },
  { id: 1, xPct: 18, delay: 80, duration: 2500, size: 7, shape: "circle", color: "#38bdf8" },
  { id: 2, xPct: 32, delay: 40, duration: 2300, size: 10, shape: "rect", color: "#10b981" },
  { id: 3, xPct: 45, delay: 140, duration: 2600, size: 6, shape: "circle", color: "#f43f5e" },
  { id: 4, xPct: 58, delay: 20, duration: 2200, size: 10, shape: "rect", color: "#a855f7" },
  { id: 5, xPct: 72, delay: 100, duration: 2400, size: 8, shape: "circle", color: "#fbbf24" },
  { id: 6, xPct: 86, delay: 60, duration: 2100, size: 9, shape: "rect", color: "#34d399" },
  { id: 7, xPct: 12, delay: 180, duration: 2700, size: 7, shape: "circle", color: "#ec4899" },
  { id: 8, xPct: 26, delay: 140, duration: 2300, size: 11, shape: "rect", color: "#38bdf8" },
  { id: 9, xPct: 40, delay: 220, duration: 2500, size: 8, shape: "rect", color: "#fbbf24" },
  { id: 10, xPct: 54, delay: 120, duration: 2200, size: 6, shape: "circle", color: "#10b981" },
  { id: 11, xPct: 68, delay: 240, duration: 2800, size: 10, shape: "rect", color: "#f43f5e" },
  { id: 12, xPct: 82, delay: 160, duration: 2400, size: 7, shape: "circle", color: "#a855f7" },
  { id: 13, xPct: 22, delay: 280, duration: 2600, size: 9, shape: "rect", color: "#2dd4bf" },
  { id: 14, xPct: 50, delay: 200, duration: 2300, size: 8, shape: "circle", color: "#f59e0b" },
  { id: 15, xPct: 78, delay: 320, duration: 2500, size: 10, shape: "rect", color: "#38bdf8" },
];

const FallingConfettiPiece = ({ item, active }: { item: typeof CONFETTI_DATA[0]; active: boolean }) => {
  const fallY = useSharedValue(-60);
  const rotateVal = useSharedValue(0);
  const swayX = useSharedValue(0);

  useEffect(() => {
    if (active) {
      fallY.value = -60;
      rotateVal.value = 0;
      swayX.value = 0;

      fallY.value = withDelay(
        item.delay,
        withTiming(SCREEN_HEIGHT * 0.72, {
          duration: item.duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        })
      );
      rotateVal.value = withDelay(
        item.delay,
        withTiming(360 + (item.id % 2 === 0 ? 360 : -360), {
          duration: item.duration,
          easing: Easing.linear,
        })
      );
      swayX.value = withDelay(
        item.delay,
        withSequence(
          withTiming(item.id % 2 === 0 ? 20 : -20, { duration: item.duration * 0.5 }),
          withTiming(0, { duration: item.duration * 0.5 })
        )
      );
    }
  }, [active, item]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: fallY.value },
      { translateX: swayX.value },
      { rotate: `${rotateVal.value}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: `${item.xPct}%`,
          top: 0,
          width: item.shape === "rect" ? item.size : item.size,
          height: item.shape === "rect" ? item.size * 1.5 : item.size,
          borderRadius: item.shape === "circle" ? item.size / 2 : 2,
          backgroundColor: item.color,
          zIndex: 15,
        },
        animStyle,
      ]}
    />
  );
};

export interface LevelCompletionModalProps {
  visible: boolean;
  onClose: () => void;
  onNextLevel?: () => void;
  contentType?: "framework" | "series" | "standalone";
  levelNumber?: number;
  levelTitle?: string;
  nextLevelNumber?: number;
  nextLevelTitle?: string;
  hasNextLevel?: boolean;
  isAllLevelsCompleted?: boolean;
  totalLevels?: number;
  levelsSummary?: {
    levelNumber: number;
    title: string;
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
  }[];
  questions?: any[];
  userAnswers?: Record<
    string,
    {
      selectedIndex: number;
      isCorrect: boolean;
    }
  >;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function LevelCompletionModal({
  visible,
  onClose,
  onNextLevel,
  contentType = "framework",
  levelNumber = 1,
  levelTitle = "Foundation",
  nextLevelNumber = 2,
  nextLevelTitle = "Strategy & Observation",
  hasNextLevel = true,
  isAllLevelsCompleted = false,
  totalLevels = 1,
  levelsSummary = [],
  questions = [],
  userAnswers = {},
}: LevelCompletionModalProps) {
  const insets = useSafeAreaInsets();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const reviewSheetY = useSharedValue(SCREEN_HEIGHT);

  // 200ms subtle vibration when celebration modal opens
  useEffect(() => {
    if (visible) {
      try {
        Vibration.vibrate(200);
      } catch (_) {}
    }
  }, [visible]);

  const totalQuestions = Math.max(1, questions.length || 5);

  // Compute correct answers count
  let correctCount = 0;
  questions.forEach((q, idx) => {
    const qId = String(q?._id || idx);
    const ans = userAnswers[qId];
    if (ans?.isCorrect) {
      correctCount++;
    } else if (ans === undefined) {
      correctCount++;
    }
  });

  const accuracyRate = Math.round((correctCount / totalQuestions) * 100);

  // Dynamic accuracy color: Red (<50%), Orange (50-79%), Green (80%+)
  const accuracyColor =
    accuracyRate < 50 ? "#ef4444" : accuracyRate < 80 ? "#f59e0b" : "#10b981";

  // Titles based on type and all-levels completion
  const headingText = isAllLevelsCompleted
    ? contentType === "framework"
      ? "Framework Completed!"
      : "Series Completed!"
    : contentType === "framework"
    ? `Level ${levelNumber} Completed!`
    : contentType === "series"
    ? `Chapter ${levelNumber} Completed!`
    : "Chapter Completed!";

  const subtitleText = isAllLevelsCompleted
    ? `You've successfully completed all ${totalLevels} levels in this ${contentType === "framework" ? "framework" : "series"}.`
    : contentType === "framework"
    ? `You've successfully answered all ${totalQuestions} questions in this level.`
    : `You've successfully answered all ${totalQuestions} questions in this chapter.`;

  // Review Sheet Controls
  const openReviewSheet = () => {
    setIsReviewOpen(true);
    reviewSheetY.value = withTiming(0, {
      duration: 250,
      easing: Easing.out(Easing.quad),
    });
  };

  const closeReviewSheet = () => {
    reviewSheetY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 200, easing: Easing.in(Easing.quad) },
      () => {
        runOnJS(setIsReviewOpen)(false);
      }
    );
  };

  const reviewGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) reviewSheetY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 600) {
        runOnJS(closeReviewSheet)();
      } else {
        reviewSheetY.value = withTiming(0, { duration: 180 });
      }
    });

  const reviewSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reviewSheetY.value }],
  }));

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <GestureHandlerRootView style={styles.rootContainer}>
        {/* Top Header */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top + 8, 20) }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <BackArrowIcon />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 24, 30) },
          ]}
        >
          {/* Confetti & Glowing Alive Tick Icon */}
          <View style={styles.celebrationWrapper}>
            {/* Realistic Falling Confetti Particles */}
            {CONFETTI_DATA.map((item) => (
              <FallingConfettiPiece key={item.id} item={item} active={visible} />
            ))}

            {/* Glowing Center Alive Badge */}
            <View style={styles.glowOuterCircle}>
              <View style={styles.glowMiddleCircle}>
                <View style={styles.glowInnerCircle}>
                  <BigCheckmarkIcon />
                </View>
              </View>
            </View>
          </View>

          {/* Heading and Subtitle */}
          <Text style={styles.headingTitle}>{headingText}</Text>
          <Text style={styles.headingSubtitle}>{subtitleText}</Text>

          {/* Two Stat Boxes (Image 2) */}
          <View style={styles.statsTwoBoxRow}>
            {/* Box 1: Questions Completed or Levels Completed */}
            <View style={styles.statBox}>
              <View style={styles.statBoxTop}>
                <ClockCheckIcon />
                <Text style={styles.statBoxBigNumber}>
                  {isAllLevelsCompleted
                    ? `${totalLevels}/${totalLevels}`
                    : `${totalQuestions}/${totalQuestions}`}
                </Text>
              </View>
              <Text style={styles.statBoxLabel}>
                {isAllLevelsCompleted ? "Levels completed" : "Questions completed"}
              </Text>
            </View>

            {/* Box 2: Accuracy Rate with Dynamic Color */}
            <View style={styles.statBox}>
              <View style={styles.statBoxTop}>
                <PercentCheckIcon color={accuracyColor} />
                <Text style={[styles.statBoxBigNumber, { color: accuracyColor }]}>
                  {accuracyRate}%
                </Text>
              </View>
              <Text style={styles.statBoxLabel}>Accuracy rate</Text>
            </View>
          </View>

          {/* Next Level Unlocked Card OR Framework Mastered Card */}
          {hasNextLevel && !isAllLevelsCompleted ? (
            <View style={styles.nextLevelUnlockedCard}>
              <View style={styles.unlockedIconCircle}>
                <UnlockedLockIcon />
              </View>

              <View style={styles.unlockedTextCol}>
                <Text style={styles.unlockedTag}>Next Level Unlocked</Text>
                <Text style={styles.unlockedLevelTitle} numberOfLines={1}>
                  Level {nextLevelNumber} – {nextLevelTitle}
                </Text>
                <Text style={styles.unlockedSub}>Continue your learning journey.</Text>
              </View>
            </View>
          ) : isAllLevelsCompleted ? (
            <View style={styles.nextLevelUnlockedCard}>
              <View style={[styles.unlockedIconCircle, { backgroundColor: "rgba(16, 185, 129, 0.2)" }]}>
                <BigCheckmarkIcon />
              </View>

              <View style={styles.unlockedTextCol}>
                <Text style={[styles.unlockedTag, { color: "#10b981" }]}>All Levels Mastered</Text>
                <Text style={styles.unlockedLevelTitle} numberOfLines={1}>
                  {levelTitle || "Full Curriculum Completed"}
                </Text>
                <Text style={styles.unlockedSub}>You have successfully conquered all levels.</Text>
              </View>
            </View>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.actionButtonsCol}>
            {/* Primary Button */}
            <TouchableOpacity
              style={styles.primaryActionBtn}
              activeOpacity={0.85}
              onPress={() => {
                onClose();
                if (hasNextLevel && onNextLevel && !isAllLevelsCompleted) {
                  onNextLevel();
                }
              }}
            >
              <Text style={styles.primaryActionBtnText}>
                {isAllLevelsCompleted
                  ? "Explore Recommended"
                  : hasNextLevel
                  ? "Go to Next Level"
                  : "Continue"}
              </Text>
              <ArrowRightIcon />
            </TouchableOpacity>

            {/* Secondary: Review Your Answers / Review Levels */}
            <TouchableOpacity
              style={styles.reviewAnswersBtn}
              activeOpacity={0.7}
              onPress={openReviewSheet}
            >
              <Text style={styles.reviewAnswersBtnText}>
                {isAllLevelsCompleted ? "Review Levels" : "Review Your Answers"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* ============================================================ */}
        {/* REVIEW ANSWERS / LEVELS BOTTOM SHEET (Smooth & Fully Scrollable) */}
        {/* ============================================================ */}
        {isReviewOpen && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <Pressable style={styles.sheetBackdrop} onPress={closeReviewSheet} />
            <Animated.View style={[styles.reviewSheetPanel, reviewSheetStyle]}>
              {/* Top Drag Handle & Header wrapped in Pan Gesture */}
              <GestureDetector gesture={reviewGesture}>
                <View style={styles.sheetTopArea}>
                  <View style={styles.sheetDragHandle} />

                  <View style={styles.reviewSheetHeader}>
                    <View style={styles.reviewHeaderLeft}>
                      <Text style={styles.reviewSheetTitle}>
                        {isAllLevelsCompleted ? "Review Levels" : "Review Answers"}
                      </Text>
                      <View style={styles.scorePill}>
                        <Text style={styles.scorePillText}>
                          {isAllLevelsCompleted
                            ? `${totalLevels}/${totalLevels} Levels • ${accuracyRate}% Accuracy`
                            : `${correctCount}/${totalQuestions} Marks • ${accuracyRate}% Accuracy`}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.closeSheetBtn}
                      onPress={closeReviewSheet}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <CloseIcon />
                    </TouchableOpacity>
                  </View>
                </View>
              </GestureDetector>

              {/* Scrollable list of Question Review Cards or Level Breakdown Cards */}
              <ScrollView
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                bounces={true}
                style={{ flex: 1 }}
                contentContainerStyle={styles.questionsReviewScroll}
              >
                {isAllLevelsCompleted && levelsSummary && levelsSummary.length > 0 ? (
                  levelsSummary.map((lvl) => {
                    const lvlAccColor =
                      lvl.accuracy < 50
                        ? "#ef4444"
                        : lvl.accuracy < 80
                        ? "#f59e0b"
                        : "#10b981";
                    return (
                      <View key={lvl.levelNumber} style={styles.levelSummaryCard}>
                        <View style={styles.levelSummaryLeft}>
                          <View style={styles.levelNumberTag}>
                            <Text style={styles.levelNumberTagText}>
                              Level {lvl.levelNumber}
                            </Text>
                          </View>
                          <Text style={styles.levelSummaryTitle} numberOfLines={1}>
                            {lvl.title}
                          </Text>
                        </View>

                        <View style={styles.levelSummaryRight}>
                          <Text style={styles.levelMarksText}>
                            {lvl.correctCount}/{lvl.totalQuestions} Marks
                          </Text>
                          <View
                            style={[
                              styles.levelAccuracyPill,
                              {
                                backgroundColor:
                                  lvl.accuracy < 50
                                    ? "rgba(239, 68, 68, 0.15)"
                                    : lvl.accuracy < 80
                                    ? "rgba(245, 158, 11, 0.15)"
                                    : "rgba(16, 185, 129, 0.15)",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.levelAccuracyText,
                                { color: lvlAccColor },
                              ]}
                            >
                              {lvl.accuracy}%
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  questions.map((q, idx) => {
                    const qId = String(q?._id || idx);
                    const ans = userAnswers[qId];
                    const selectedIdx = ans?.selectedIndex ?? 0;
                    const correctIdx = Number(q?.correct ?? 0);
                    const isAnsCorrect = ans?.isCorrect ?? (selectedIdx === correctIdx);

                    const optionsList: string[] = Array.isArray(q?.options)
                      ? q.options
                      : ["Option A", "Option B", "Option C", "Option D"];

                    const selectedText = optionsList[selectedIdx] || "Selected option";
                    const selectedLetter = OPTION_LETTERS[selectedIdx] || "A";
                    const correctText = optionsList[correctIdx] || "Correct option";
                    const correctLetter = OPTION_LETTERS[correctIdx] || "A";

                    return (
                      <View
                        key={qId}
                        style={[
                          styles.reviewCard,
                          {
                            borderColor: isAnsCorrect
                              ? "rgba(16, 185, 129, 0.45)"
                              : "rgba(239, 68, 68, 0.45)",
                          },
                        ]}
                      >
                        <View style={styles.reviewCardTopRow}>
                          <View
                            style={[
                              styles.questionNumberPill,
                              { backgroundColor: isAnsCorrect ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.questionNumberText,
                                { color: isAnsCorrect ? "#10b981" : "#ef4444" },
                              ]}
                            >
                              Question {idx + 1}
                            </Text>
                          </View>

                          <Text
                            style={[
                              styles.resultStatusText,
                              { color: isAnsCorrect ? "#10b981" : "#ef4444" },
                            ]}
                          >
                            {isAnsCorrect ? "✓ Correct (+1)" : "✗ Incorrect"}
                          </Text>
                        </View>

                        <Text style={styles.questionPromptText}>
                          {q?.question || q?.title || `Question ${idx + 1}`}
                        </Text>

                        {/* Selected Option Card */}
                        <View
                          style={[
                            styles.optionResultRow,
                            {
                              backgroundColor: isAnsCorrect
                                ? "rgba(16, 185, 129, 0.08)"
                                : "rgba(239, 68, 68, 0.08)",
                              borderColor: isAnsCorrect
                                ? "rgba(16, 185, 129, 0.25)"
                                : "rgba(239, 68, 68, 0.25)",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionLetterBadge,
                              { color: isAnsCorrect ? "#10b981" : "#ef4444" },
                            ]}
                          >
                            {selectedLetter}.
                          </Text>
                          <Text style={styles.optionContentText}>{selectedText}</Text>
                        </View>

                        {/* If wrong, show correct answer */}
                        {!isAnsCorrect && (
                          <View style={styles.correctRevealRow}>
                            <Text style={styles.correctRevealLabel}>Correct answer:</Text>
                            <Text style={styles.correctRevealText}>
                              {correctLetter}. {correctText}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </Animated.View>
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#090314",
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  scrollContent: {
    paddingHorizontal: 22,
    alignItems: "center",
    paddingTop: 10,
  },

  // Celebration visual
  celebrationWrapper: {
    width: SCREEN_WIDTH - 44,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 10,
    overflow: "hidden",
  },
  glowOuterCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  glowMiddleCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(16, 185, 129, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  glowInnerCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },

  // Titles
  headingTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 14,
    textAlign: "center",
  },
  headingSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 16,
  },

  // Two Stat Boxes (Image 2)
  statsTwoBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    marginTop: 26,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#111625",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  statBoxTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  statBoxBigNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
  },
  statBoxLabel: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
  },

  // Next Level Unlocked Card (Image 2)
  nextLevelUnlockedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0d1720",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "rgba(16, 185, 129, 0.35)",
    width: "100%",
    marginTop: 20,
  },
  unlockedIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  unlockedTextCol: {
    flex: 1,
  },
  unlockedTag: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#10b981",
    letterSpacing: 0.5,
  },
  unlockedLevelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 3,
  },
  unlockedSub: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },

  // Action Buttons
  actionButtonsCol: {
    width: "100%",
    marginTop: 26,
    gap: 12,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    height: 52,
    borderRadius: 14,
    width: "100%",
  },
  primaryActionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#090314",
  },
  reviewAnswersBtn: {
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  reviewAnswersBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },

  // Review Answers Sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  reviewSheetPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.82,
    backgroundColor: "#0d0718",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    zIndex: 200,
  },
  sheetTopArea: {
    width: "100%",
  },
  sheetDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignSelf: "center",
    marginBottom: 16,
  },
  reviewSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  reviewHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  reviewSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  scorePill: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scorePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10b981",
  },
  closeSheetBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  questionsReviewScroll: {
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 30,
  },
  reviewCard: {
    backgroundColor: "#111625",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  reviewCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  questionNumberPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  questionNumberText: {
    fontSize: 11,
    fontWeight: "700",
  },
  resultStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  questionPromptText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    lineHeight: 20,
    marginBottom: 10,
  },
  optionResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionLetterBadge: {
    fontSize: 13,
    fontWeight: "700",
    marginRight: 8,
  },
  optionContentText: {
    fontSize: 13,
    color: "#ffffff",
    flex: 1,
  },
  correctRevealRow: {
    marginTop: 8,
    paddingLeft: 4,
  },
  correctRevealLabel: {
    fontSize: 11.5,
    color: "#94a3b8",
  },
  correctRevealText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#10b981",
    marginTop: 1,
  },

  // Level Summary Cards
  levelSummaryCard: {
    backgroundColor: "#111625",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  levelSummaryLeft: {
    flex: 1,
    marginRight: 10,
  },
  levelNumberTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    marginBottom: 4,
  },
  levelNumberTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  levelSummaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  levelSummaryRight: {
    alignItems: "flex-end",
  },
  levelMarksText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 4,
  },
  levelAccuracyPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  levelAccuracyText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
