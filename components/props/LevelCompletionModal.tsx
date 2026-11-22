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
  BackHandler,
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
  withRepeat,
  Easing,
  runOnJS,
  interpolate,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const THEME = {
  bgBase: "#0B0F17",
  cardBg: "#111625",
  cardBorder: "rgba(255, 255, 255, 0.08)",
  primaryBlue: "#38BDF8",
  primaryBlueStrong: "#0EA5E9",
  primaryBlueSoft: "rgba(56, 189, 248, 0.14)",
  primaryBlueBorder: "rgba(56, 189, 248, 0.35)",
  successGreen: "#10B981",
  successGreenSoft: "rgba(16, 185, 129, 0.14)",
  successGreenBorder: "rgba(16, 185, 129, 0.35)",
  warningAmber: "#F59E0B",
  dangerRed: "#EF4444",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textOnAccent: "#06101D",
};

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

const ClockCheckIcon = ({ color = THEME.primaryBlue }: { color?: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={2} />
    <Path
      d="M12 7v5l3 3"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

const PercentCheckIcon = ({ color = THEME.successGreen }: { color?: string }) => (
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
      stroke={THEME.primaryBlue}
      strokeWidth={2}
    />
    <Path
      d="M7 11V7a5 5 0 0 1 9.9-1"
      stroke={THEME.primaryBlue}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

const TrophyStarIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z"
      stroke={THEME.primaryBlue}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const ArrowRightIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 12h14M12 5l7 7-7 7"
      stroke={THEME.textOnAccent}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const CloseIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M18 6L6 18M6 6L18 18"
      stroke={THEME.textSecondary}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

const CloseModalIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M18 6L6 18M6 6L18 18"
      stroke="#ffffff"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const BURST_PARTICLES = [
  { id: 0, angle: -155, dist: 125, size: 9, shape: "rect", color: "#38BDF8" },
  { id: 1, angle: -130, dist: 145, size: 7, shape: "circle", color: "#FBBF24" },
  { id: 2, angle: -105, dist: 135, size: 10, shape: "rect", color: "#10B981" },
  { id: 3, angle: -75, dist: 140, size: 8, shape: "circle", color: "#38BDF8" },
  { id: 4, angle: -50, dist: 150, size: 9, shape: "rect", color: "#A855F7" },
  { id: 5, angle: -25, dist: 125, size: 7, shape: "circle", color: "#FBBF24" },
  { id: 6, angle: 15, dist: 115, size: 8, shape: "rect", color: "#34D399" },
  { id: 7, angle: 165, dist: 115, size: 8, shape: "circle", color: "#F43F5E" },
  { id: 8, angle: -142, dist: 95, size: 6, shape: "circle", color: "#0EA5E9" },
  { id: 9, angle: -90, dist: 155, size: 9, shape: "rect", color: "#F59E0B" },
  { id: 10, angle: -38, dist: 100, size: 6, shape: "circle", color: "#10B981" },
  { id: 11, angle: -118, dist: 110, size: 8, shape: "rect", color: "#F43F5E" },
];

const SHOWER_PARTICLES = [
  { id: 0, xPct: 5, delay: 40, duration: 2400, size: 9, shape: "rect", color: "#38BDF8" },
  { id: 1, xPct: 14, delay: 140, duration: 2700, size: 7, shape: "circle", color: "#FBBF24" },
  { id: 2, xPct: 24, delay: 70, duration: 2500, size: 10, shape: "rect", color: "#10B981" },
  { id: 3, xPct: 35, delay: 200, duration: 2800, size: 6, shape: "circle", color: "#F43F5E" },
  { id: 4, xPct: 46, delay: 30, duration: 2350, size: 10, shape: "rect", color: "#0EA5E9" },
  { id: 5, xPct: 57, delay: 160, duration: 2650, size: 8, shape: "circle", color: "#FBBF24" },
  { id: 6, xPct: 68, delay: 90, duration: 2450, size: 9, shape: "rect", color: "#34D399" },
  { id: 7, xPct: 79, delay: 220, duration: 2900, size: 7, shape: "circle", color: "#A855F7" },
  { id: 8, xPct: 90, delay: 110, duration: 2500, size: 10, shape: "rect", color: "#38BDF8" },
  { id: 9, xPct: 10, delay: 320, duration: 2750, size: 8, shape: "rect", color: "#F59E0B" },
  { id: 10, xPct: 29, delay: 260, duration: 2550, size: 6, shape: "circle", color: "#10B981" },
  { id: 11, xPct: 51, delay: 340, duration: 2850, size: 9, shape: "rect", color: "#F43F5E" },
  { id: 12, xPct: 73, delay: 280, duration: 2600, size: 7, shape: "circle", color: "#38BDF8" },
  { id: 13, xPct: 85, delay: 380, duration: 2700, size: 9, shape: "rect", color: "#FBBF24" },
  { id: 14, xPct: 41, delay: 420, duration: 2650, size: 7, shape: "circle", color: "#2DD4BF" },
  { id: 15, xPct: 63, delay: 450, duration: 2750, size: 9, shape: "rect", color: "#0EA5E9" },
];

const BurstConfettiPiece = ({
  item,
  active,
}: {
  item: (typeof BURST_PARTICLES)[0];
  active: boolean;
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withDelay(
        80,
        withTiming(1, {
          duration: 1100,
          easing: Easing.out(Easing.cubic),
        })
      );
    }
  }, [active, item]);

  const rad = (item.angle * Math.PI) / 180;
  const targetX = Math.cos(rad) * item.dist;
  const targetY = Math.sin(rad) * item.dist;

  const animStyle = useAnimatedStyle(() => {
    const tx = interpolate(progress.value, [0, 1], [0, targetX]);
    const ty = interpolate(progress.value, [0, 0.75, 1], [0, targetY, targetY + 28]);
    const opacity = interpolate(progress.value, [0, 0.15, 0.75, 1], [0, 1, 1, 0]);
    const scale = interpolate(progress.value, [0, 0.25, 1], [0.3, 1.15, 0.85]);
    const rotate = interpolate(progress.value, [0, 1], [0, item.id % 2 === 0 ? 240 : -240]);

    return {
      opacity,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: item.size,
          height: item.shape === "rect" ? item.size * 1.55 : item.size,
          borderRadius: item.shape === "circle" ? item.size / 2 : 2.5,
          backgroundColor: item.color,
        },
        animStyle,
      ]}
    />
  );
};

const FallingConfettiPiece = ({
  item,
  active,
}: {
  item: (typeof SHOWER_PARTICLES)[0];
  active: boolean;
}) => {
  const fallY = useSharedValue(-40);
  const rotateVal = useSharedValue(0);
  const swayX = useSharedValue(0);
  const opacityVal = useSharedValue(0);

  useEffect(() => {
    if (active) {
      fallY.value = -40;
      rotateVal.value = 0;
      swayX.value = 0;
      opacityVal.value = 0;

      opacityVal.value = withDelay(
        item.delay,
        withSequence(
          withTiming(0.95, { duration: 220 }),
          withDelay(item.duration - 650, withTiming(0, { duration: 430 }))
        )
      );

      fallY.value = withDelay(
        item.delay,
        withTiming(SCREEN_HEIGHT * 0.88, {
          duration: item.duration,
          easing: Easing.out(Easing.quad),
        })
      );

      rotateVal.value = withDelay(
        item.delay,
        withTiming(item.id % 2 === 0 ? 540 : -540, {
          duration: item.duration,
          easing: Easing.linear,
        })
      );

      swayX.value = withDelay(
        item.delay,
        withSequence(
          withTiming(item.id % 2 === 0 ? 22 : -22, {
            duration: item.duration * 0.45,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(item.id % 2 === 0 ? -14 : 14, {
            duration: item.duration * 0.55,
            easing: Easing.inOut(Easing.sin),
          })
        )
      );
    }
  }, [active, item]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacityVal.value,
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
          width: item.size,
          height: item.shape === "rect" ? item.size * 1.55 : item.size,
          borderRadius: item.shape === "circle" ? item.size / 2 : 2,
          backgroundColor: item.color,
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
  const badgeScale = useSharedValue(0.65);
  const badgeOpacity = useSharedValue(0);
  const haloPulse = useSharedValue(1);
  const headerEntrance = useSharedValue(0);
  const cardsEntrance = useSharedValue(0);
  const actionsEntrance = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      try {
        Vibration.vibrate(140);
      } catch (_) {}

      badgeScale.value = 0.65;
      badgeOpacity.value = 0;
      haloPulse.value = 1;
      headerEntrance.value = 0;
      cardsEntrance.value = 0;
      actionsEntrance.value = 0;

      badgeOpacity.value = withTiming(1, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
      });
      badgeScale.value = withTiming(1, {
        duration: 360,
        easing: Easing.out(Easing.cubic),
      });

      haloPulse.value = withDelay(
        350,
        withRepeat(
          withSequence(
            withTiming(1.07, {
              duration: 1300,
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(1, {
              duration: 1300,
              easing: Easing.inOut(Easing.sin),
            })
          ),
          -1,
          true
        )
      );

      headerEntrance.value = withDelay(
        120,
        withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) })
      );
      cardsEntrance.value = withDelay(
        210,
        withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) })
      );
      actionsEntrance.value = withDelay(
        300,
        withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) })
      );
    }
  }, [visible]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [{ scale: badgeScale.value }],
  }));

  const haloAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloPulse.value }],
  }));

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerEntrance.value,
    transform: [
      { translateY: interpolate(headerEntrance.value, [0, 1], [14, 0]) },
    ],
  }));

  const cardsAnimatedStyle = useAnimatedStyle(() => ({
    width: "100%",
    opacity: cardsEntrance.value,
    transform: [
      { translateY: interpolate(cardsEntrance.value, [0, 1], [16, 0]) },
    ],
  }));

  const actionsAnimatedStyle = useAnimatedStyle(() => ({
    width: "100%",
    opacity: actionsEntrance.value,
    transform: [
      { translateY: interpolate(actionsEntrance.value, [0, 1], [16, 0]) },
    ],
  }));

  const hasQuestions = Array.isArray(questions) && questions.length > 0;
  const totalQuestions = hasQuestions ? questions.length : 1;

  let correctCount = 0;
  if (hasQuestions) {
    questions.forEach((q, idx) => {
      const qId = String(q?._id ?? idx);
      const ans = userAnswers[qId];
      if (ans?.isCorrect === true) {
        correctCount++;
      }
    });
  }

  const accuracyRate = hasQuestions
    ? Math.round((correctCount / totalQuestions) * 100)
    : 100;

  const accuracyColor =
    accuracyRate < 50
      ? THEME.dangerRed
      : accuracyRate < 80
      ? THEME.warningAmber
      : THEME.successGreen;

  const badgeLabel = isAllLevelsCompleted
    ? contentType === "framework"
      ? "FRAMEWORK MASTERED"
      : "SERIES COMPLETED"
    : contentType === "framework"
    ? `LEVEL ${levelNumber} COMPLETE`
    : `CHAPTER ${levelNumber} COMPLETE`;

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
    ? `You've successfully completed all ${totalLevels} levels in this ${
        contentType === "framework" ? "framework" : "series"
      }.`
    : contentType === "framework"
    ? `You've answered all ${totalQuestions} questions in ${levelTitle || `Level ${levelNumber}`}.`
    : `You've answered all ${totalQuestions} questions in ${levelTitle || `Chapter ${levelNumber}`}.`;

  const openReviewSheet = () => {
    setIsReviewOpen(true);
    reviewSheetY.value = withTiming(0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  };

  const closeReviewSheet = () => {
    reviewSheetY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
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
        reviewSheetY.value = withTiming(0, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const reviewSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reviewSheetY.value }],
  }));

  useEffect(() => {
    if (!visible) return;
    const onBackPress = () => {
      if (isReviewOpen) {
        closeReviewSheet();
        return true;
      }
      onClose();
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [visible, isReviewOpen, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={() => {
        if (isReviewOpen) {
          closeReviewSheet();
        } else {
          onClose();
        }
      }}
    >
      <GestureHandlerRootView style={styles.rootContainer}>
        {/* Full-screen unclipped confetti shower */}
        <View style={styles.fullScreenConfettiLayer} pointerEvents="none">
          {SHOWER_PARTICLES.map((item) => (
            <FallingConfettiPiece key={item.id} item={item} active={visible} />
          ))}
        </View>

        {/* Top Header */}
        <View
          style={[styles.topBar, { paddingTop: Math.max(insets.top + 8, 20) }]}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Close"
          >
            <CloseModalIcon />
          </TouchableOpacity>

          <View style={styles.topBarSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 24, 32) },
          ]}
        >
          {/* Center Burst + Glowing Checkmark Badge */}
          <View style={styles.celebrationWrapper}>
            <View style={styles.burstAnchor} pointerEvents="none">
              {BURST_PARTICLES.map((item) => (
                <BurstConfettiPiece key={item.id} item={item} active={visible} />
              ))}
            </View>

            <Animated.View style={[styles.glowOuterCircle, haloAnimatedStyle]}>
              <Animated.View style={[styles.glowMiddleCircle, badgeAnimatedStyle]}>
                <View style={styles.glowInnerCircle}>
                  <BigCheckmarkIcon />
                </View>
              </Animated.View>
            </Animated.View>
          </View>

          {/* Heading and Subtitle */}
          <Animated.View style={[styles.titleBlock, headerAnimatedStyle]}>
            <Text style={styles.headingTitle}>{headingText}</Text>
            <Text style={styles.headingSubtitle}>{subtitleText}</Text>
          </Animated.View>

          {/* Stats & Unlocked Card */}
          <Animated.View style={cardsAnimatedStyle}>
            <View style={styles.statsTwoBoxRow}>
              <View style={styles.statBox}>
                <View style={styles.statBoxTop}>
                  <ClockCheckIcon color={THEME.primaryBlue} />
                  <Text style={styles.statBoxBigNumber}>
                    {isAllLevelsCompleted
                      ? `${totalLevels}/${totalLevels}`
                      : `${totalQuestions}/${totalQuestions}`}
                  </Text>
                </View>
                <Text style={styles.statBoxLabel}>
                  {isAllLevelsCompleted
                    ? "Levels completed"
                    : "Questions completed"}
                </Text>
              </View>

              <View style={styles.statBox}>
                <View style={styles.statBoxTop}>
                  <PercentCheckIcon color={accuracyColor} />
                  <Text
                    style={[styles.statBoxBigNumber, { color: accuracyColor }]}
                  >
                    {accuracyRate}%
                  </Text>
                </View>
                <Text style={styles.statBoxLabel}>Accuracy rate</Text>
              </View>
            </View>

            {hasNextLevel && !isAllLevelsCompleted ? (
              <View style={styles.nextLevelUnlockedCard}>
                <View style={styles.unlockedIconCircle}>
                  <UnlockedLockIcon />
                </View>

                <View style={styles.unlockedTextCol}>
                  <Text style={styles.unlockedTag}>NEXT LEVEL UNLOCKED</Text>
                  <Text style={styles.unlockedLevelTitle} numberOfLines={1}>
                    {contentType === "framework" ? "Level" : "Chapter"}{" "}
                    {nextLevelNumber} – {nextLevelTitle}
                  </Text>
                  <Text style={styles.unlockedSub}>
                    Continue your learning journey.
                  </Text>
                </View>
              </View>
            ) : isAllLevelsCompleted ? (
              <View style={styles.nextLevelUnlockedCard}>
                <View style={styles.unlockedIconCircle}>
                  <TrophyStarIcon />
                </View>

                <View style={styles.unlockedTextCol}>
                  <Text style={styles.unlockedTag}>ALL LEVELS MASTERED</Text>
                  <Text style={styles.unlockedLevelTitle} numberOfLines={1}>
                    {levelTitle || "Full Curriculum Completed"}
                  </Text>
                  <Text style={styles.unlockedSub}>
                    You have successfully conquered every stage.
                  </Text>
                </View>
              </View>
            ) : null}
          </Animated.View>

          {/* Action Buttons */}
          <Animated.View style={[styles.actionButtonsCol, actionsAnimatedStyle]}>
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
                  ? contentType === "framework"
                    ? "Go to Next Level"
                    : "Go to Next Chapter"
                  : "Continue"}
              </Text>
              <ArrowRightIcon />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reviewAnswersBtn}
              activeOpacity={0.75}
              onPress={openReviewSheet}
            >
              <Text style={styles.reviewAnswersBtnText}>
                {isAllLevelsCompleted ? "Review Levels" : "Review Your Answers"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>

        {/* Review Answers / Levels Bottom Sheet */}
        {isReviewOpen && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <Pressable style={styles.sheetBackdrop} onPress={closeReviewSheet} />
            <Animated.View style={[styles.reviewSheetPanel, reviewSheetStyle]}>
              <GestureDetector gesture={reviewGesture}>
                <View style={styles.sheetTopArea}>
                  <View style={styles.sheetDragHandle} />

                  <View style={styles.reviewSheetHeader}>
                    <View style={styles.reviewHeaderLeft}>
                      <Text style={styles.reviewSheetTitle}>
                        {isAllLevelsCompleted
                          ? "Review Levels"
                          : "Review Answers"}
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

              <ScrollView
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                bounces={true}
                style={{ flex: 1 }}
                contentContainerStyle={styles.questionsReviewScroll}
              >
                {isAllLevelsCompleted &&
                levelsSummary &&
                levelsSummary.length > 0 ? (
                  levelsSummary.map((lvl) => {
                    const lvlAccColor =
                      lvl.accuracy < 50
                        ? THEME.dangerRed
                        : lvl.accuracy < 80
                        ? THEME.warningAmber
                        : THEME.successGreen;
                    return (
                      <View
                        key={lvl.levelNumber}
                        style={styles.levelSummaryCard}
                      >
                        <View style={styles.levelSummaryLeft}>
                          <View style={styles.levelNumberTag}>
                            <Text style={styles.levelNumberTagText}>
                              Level {lvl.levelNumber}
                            </Text>
                          </View>
                          <Text
                            style={styles.levelSummaryTitle}
                            numberOfLines={1}
                          >
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
                    const qId = String(q?._id ?? idx);
                    const ans = userAnswers[qId];
                    const selectedIdx = ans?.selectedIndex ?? 0;
                    const correctIdx = Number(q?.correct ?? 0);
                    const isAnsCorrect =
                      ans?.isCorrect ?? selectedIdx === correctIdx;

                    const optionsList: string[] = Array.isArray(q?.options)
                      ? q.options
                      : ["Option A", "Option B", "Option C", "Option D"];

                    const selectedText =
                      optionsList[selectedIdx] || "Selected option";
                    const selectedLetter = OPTION_LETTERS[selectedIdx] || "A";
                    const correctText =
                      optionsList[correctIdx] || "Correct option";
                    const correctLetter = OPTION_LETTERS[correctIdx] || "A";

                    return (
                      <View
                        key={qId}
                        style={[
                          styles.reviewCard,
                          {
                            borderColor: isAnsCorrect
                              ? "rgba(16, 185, 129, 0.4)"
                              : "rgba(239, 68, 68, 0.4)",
                          },
                        ]}
                      >
                        <View style={styles.reviewCardTopRow}>
                          <View
                            style={[
                              styles.questionNumberPill,
                              {
                                backgroundColor: isAnsCorrect
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : "rgba(239, 68, 68, 0.15)",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.questionNumberText,
                                {
                                  color: isAnsCorrect
                                    ? THEME.successGreen
                                    : THEME.dangerRed,
                                },
                              ]}
                            >
                              Question {idx + 1}
                            </Text>
                          </View>

                          <Text
                            style={[
                              styles.resultStatusText,
                              {
                                color: isAnsCorrect
                                  ? THEME.successGreen
                                  : THEME.dangerRed,
                              },
                            ]}
                          >
                            {isAnsCorrect ? "✓ Correct (+1)" : "✗ Incorrect"}
                          </Text>
                        </View>

                        <Text style={styles.questionPromptText}>
                          {q?.question || q?.title || `Question ${idx + 1}`}
                        </Text>

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
                              {
                                color: isAnsCorrect
                                  ? THEME.successGreen
                                  : THEME.dangerRed,
                              },
                            ]}
                          >
                            {selectedLetter}.
                          </Text>
                          <Text style={styles.optionContentText}>
                            {selectedText}
                          </Text>
                        </View>

                        {!isAnsCorrect && (
                          <View style={styles.correctRevealRow}>
                            <Text style={styles.correctRevealLabel}>
                              Correct answer:
                            </Text>
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
    backgroundColor: THEME.bgBase,
  },
  fullScreenConfettiLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
    zIndex: 60,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  topStatusPill: {
    backgroundColor: THEME.primaryBlueSoft,
    borderWidth: 1,
    borderColor: THEME.primaryBlueBorder,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  topStatusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.primaryBlue,
    letterSpacing: 0.8,
  },
  topBarSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 22,
    alignItems: "center",
    paddingTop: 12,
  },
  celebrationWrapper: {
    width: SCREEN_WIDTH - 44,
    height: 168,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 8,
  },
  burstAnchor: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  glowOuterCircle: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  glowMiddleCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  glowInnerCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.successGreen,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: THEME.successGreen,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  titleBlock: {
    alignItems: "center",
    width: "100%",
  },
  headingTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginTop: 10,
    textAlign: "center",
  },
  headingSubtitle: {
    fontSize: 14,
    color: THEME.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 14,
  },
  statsTwoBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    marginTop: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
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
    color: THEME.textPrimary,
  },
  statBoxLabel: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: "500",
  },
  nextLevelUnlockedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.primaryBlueBorder,
    width: "100%",
    marginTop: 14,
  },
  unlockedIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: THEME.primaryBlueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  unlockedTextCol: {
    flex: 1,
  },
  unlockedTag: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.primaryBlue,
    letterSpacing: 0.6,
  },
  unlockedLevelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.textPrimary,
    marginTop: 3,
  },
  unlockedSub: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 2,
  },
  actionButtonsCol: {
    width: "100%",
    marginTop: 24,
    gap: 12,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.primaryBlue,
    height: 52,
    borderRadius: 14,
    width: "100%",
  },
  primaryActionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.textOnAccent,
  },
  reviewAnswersBtn: {
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    width: "100%",
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  reviewAnswersBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3, 6, 12, 0.78)",
    zIndex: 150,
  },
  reviewSheetPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.82,
    backgroundColor: THEME.bgBase,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
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
    backgroundColor: "rgba(255, 255, 255, 0.22)",
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
    color: THEME.textPrimary,
  },
  scorePill: {
    marginTop: 5,
    alignSelf: "flex-start",
    backgroundColor: THEME.primaryBlueSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scorePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.primaryBlue,
  },
  closeSheetBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  questionsReviewScroll: {
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 30,
  },
  reviewCard: {
    backgroundColor: THEME.cardBg,
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
    color: THEME.textPrimary,
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
    color: THEME.textPrimary,
    flex: 1,
  },
  correctRevealRow: {
    marginTop: 8,
    paddingLeft: 4,
  },
  correctRevealLabel: {
    fontSize: 11.5,
    color: THEME.textSecondary,
  },
  correctRevealText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: THEME.successGreen,
    marginTop: 1,
  },
  levelSummaryCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
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
    backgroundColor: THEME.primaryBlueSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    marginBottom: 4,
  },
  levelNumberTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: THEME.primaryBlue,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  levelSummaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  levelSummaryRight: {
    alignItems: "flex-end",
  },
  levelMarksText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSecondary,
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