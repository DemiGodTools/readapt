// File: components/props/QuestionCard.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import Svg, { Path, Line, Polyline } from "react-native-svg";
import useAuth from "../../hooks/useAuth";
import pallete from "../../lib/Colors";
import { IQuestion } from "../../types/Question";
import { api } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { updateStreak } from "../../hooks/useStreak";
import { useUser } from "../../hooks/useUser";
import { useNetworkStatus } from "../../hooks/useNetwork";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  question: any;
  index?: number;
  total?: number;
  qnaCommentCount?: number;
  onAttempted?: (isCorrect: boolean, selectedIndex?: number) => void;
  onCommentClick: () => void;
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

const QuestionCard = ({
  question: rawQuestion,
  qnaCommentCount = 0,
  onAttempted,
  onCommentClick,
}: Props) => {
  const question: IQuestion =
    rawQuestion?.content && typeof rawQuestion.content === "object"
      ? rawQuestion.content
      : typeof rawQuestion === "object" && rawQuestion !== null
      ? rawQuestion
      : ({} as any);

  const safeOptions: string[] = Array.isArray(question?.options)
    ? question.options
    : [];

  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const { user } = useUser();
  const { isConnected } = useNetworkStatus();

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Animation values
  const explanationOpacity = useRef(new Animated.Value(0)).current;
  const explanationTranslateY = useRef(new Animated.Value(15)).current;

  const handleSelect = async (optIndex: number, isForce: boolean = false) => {
    if (!isConnected && !isForce) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }
    if (selectedIndex !== null || submitting) return;

    const correct = optIndex === Number(question.correct);
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    setSelectedIndex(optIndex);
    setIsCorrect(correct);
    setSubmitting(true);
    setShowExplanation(true);

    Animated.parallel([
      Animated.timing(explanationOpacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(explanationTranslateY, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start();

    if (isForce) {
      setSubmitting(false);
      onAttempted?.(correct, optIndex);
      return;
    }

    updateStreak(user?._id || user?.userId);

    try {
     /* await api.post(
        "/question/attempt",
        {
          questionId: question._id,
          Answer: optIndex,
          iscorrect: correct,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      ); */
    } catch (err) {
      console.log("Question attempt error:", err);
    } finally {
      setSubmitting(false);
      onAttempted?.(correct, optIndex);
    }
  };

  useEffect(() => {
   // User progress loading is temp disabled
  }, [user?.questionsAttempted, question?._id]);

  const getOptionStyle = (optIndex: number) => {
    if (selectedIndex === null) return styles.optionBox;

    const isSelected = selectedIndex === optIndex;
    const isRightAnswer = optIndex === Number(question.correct);

    if (isSelected && isCorrect) return [styles.optionBox, styles.optionBoxTrue];
    if (isSelected && !isCorrect) return [styles.optionBox, styles.optionBoxFalse];
    if (!isSelected && isRightAnswer) return [styles.optionBox, styles.optionBoxTrue];

    return [styles.optionBox, { opacity: 0.4 }];
  };

  return (
    <View style={styles.pollBox}>
      <Text style={styles.pollQuestion}>
        {question.question || "What is your answer?"}
      </Text>

      <View style={styles.pollOptions}>
        {safeOptions.map((opt, optIdx) => {
          const isSelected = selectedIndex === optIdx;
          const isRight = optIdx === Number(question.correct);
          const showIcon = selectedIndex !== null && (isSelected || isRight);
          let iconColor = "#9ca3af";
          if (showIcon) iconColor = isRight ? "#34d399" : "#fb7185";

          return (
            <TouchableOpacity
              key={`opt_${optIdx}`}
              disabled={selectedIndex !== null}
              onPress={() => handleSelect(optIdx)}
              activeOpacity={0.7}
              style={getOptionStyle(optIdx)}>
              <View style={styles.optionContentRow}>
                <View
                  style={[
                    styles.radioOuter,
                    showIcon && { borderColor: iconColor, backgroundColor: "transparent" },
                  ]}>
                  {showIcon ? (
                    isRight ? (
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <Polyline points="20 6 9 17 4 12" />
                      </Svg>
                    ) : (
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <Line x1="18" y1="6" x2="6" y2="18" />
                        <Line x1="6" y1="6" x2="18" y2="18" />
                      </Svg>
                    )
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.optionLabel,
                    selectedIndex === optIdx && { color: "#ffffff", fontWeight: "600" },
                  ]}>
                  <Text style={{ fontWeight: "700" }}>{OPTION_LABELS[optIdx]} </Text>
                  {opt}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {showExplanation && question.explanation ? (
        <Animated.View
          style={[
            styles.explanationBox,
            {
              opacity: explanationOpacity,
              transform: [{ translateY: explanationTranslateY }],
            },
          ]}>
          <View style={styles.explanationHeaderRow}>
            {isCorrect ? (
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="20 6 9 17 4 12" />
              </Svg>
            ) : (
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <Line x1="18" y1="6" x2="6" y2="18" />
                <Line x1="6" y1="6" x2="18" y2="18" />
              </Svg>
            )}
            <Text
              style={[
                styles.explanationLabel,
                { color: isCorrect ? "#34d399" : "#fb7185" },
              ]}>
              {isCorrect ? "Correct Explanation" : "Explanation"}
            </Text>
          </View>
          <Text style={styles.explanationText}>{question.explanation}</Text>
        </Animated.View>
      ) : null}

      <View style={styles.pollFooter}>
        <TouchableOpacity
          style={styles.pollCommentIcon}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onCommentClick}
          activeOpacity={0.7}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
            <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </Svg>
          <Text style={styles.commentCount}>
            {qnaCommentCount > 0
              ? qnaCommentCount >= 1000
                ? `${(qnaCommentCount / 1000).toFixed(1)}k`
                : qnaCommentCount
              : "0"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  pollBox: {
    width: "100%",
    backgroundColor: "rgba(22, 24, 28, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  pollQuestion: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 25,
    color: "#ffffff",
    marginBottom: 20,
  },
  pollOptions: {
    gap: 12,
  },
  optionBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  optionBoxTrue: {
    borderColor: "rgba(52, 211, 153, 0.6)",
    backgroundColor: "rgba(52, 211, 153, 0.12)",
  },
  optionBoxFalse: {
    borderColor: "rgba(251, 113, 133, 0.6)",
    backgroundColor: "rgba(251, 113, 133, 0.12)",
  },
  optionContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  optionLabel: {
    fontSize: 15,
    color: "#e5e7eb",
    lineHeight: 22,
    fontWeight: "400",
    flexShrink: 1,
  },
  explanationBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  explanationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  explanationLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  explanationText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#d1d5db",
  },
  pollFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  pollCommentIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 50,
  },
  commentCount: {
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "600",
  },
});

export default QuestionCard;