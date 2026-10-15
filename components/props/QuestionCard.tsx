import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Easing,
  Vibration,
} from "react-native";
import Svg, { Path, Circle, Rect, Line } from "react-native-svg";
import useAuth from "../../hooks/useAuth";
import pallete from "../../lib/Colors";
import { IQuestion } from "../../types/Question";
import { api } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { updateStreak } from "../../hooks/useStreak";
import { useUser } from "../../hooks/useUser";
import { useNetworkStatus } from "../../hooks/useNetwork";

const { width } = Dimensions.get("window");

type Props = {
  question: IQuestion;
  onAttempted?: (isCorrect: boolean) => void;
  onCommentClick: () => void;
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

const QuestionCard = ({ question, onAttempted, onCommentClick}: Props) => {
  const { accessToken } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prevAnswer, setPrevAnswer] = useState<number | null>(null);
  const { showToast } = useToast();
  const { user } = useUser();
  const {isConnected} = useNetworkStatus()

  // Animations
  const fillAnims = useRef(
    question.options.map(() => new Animated.Value(0)),
  ).current;
  const explanationAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
    } catch {
      return "";
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const handleSelect = async (index: number, isForce: boolean = false) => {
    console.log("handleSelect called with index:", index, "isForce:", isForce);
     if (!isConnected && !isForce) {
      showToast({
        title: "Please connect to the Internet.",
      });
      return;
    }
    if (prevAnswer !== null) return;
    if (selectedIndex !== null || submitting) return;

    const correct = index === question.correct;
    setSelectedIndex(index);
    setIsCorrect(correct);
    setSubmitting(true);

    if (correct) {
      Vibration.vibrate(30);
    } else {
      Vibration.vibrate([0, 20, 60, 20]);
    }

    // Bubble fill animation
    Animated.timing(fillAnims[index], {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // If wrong, also highlight the correct one lightly
    if (!correct) {
      Animated.timing(fillAnims[question.correct], {
        toValue: 1,
        duration: 500,
        delay: 200,
        useNativeDriver: false,
      }).start();
    }

    // Show explanation with slide + fade
    setTimeout(() => {
      setShowExplanation(true);
      Animated.timing(explanationAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, 380);

    if (isForce) {
      setSubmitting(false);
      onAttempted?.(correct);
      setPrevAnswer(index);
      return;
    }

    updateStreak();
    showToast({
      title: correct
        ? "Correct Answer! Streak Updated"
        : "Wrong Answer!, But Streak Updated",
    });

    // API call
    try {
      const data = await api.post(
        "/question/attempt",
        {
          questionId: question._id,
          Answer: index,
          iscorrect: correct,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const levelUpgraded: boolean = data.data;
      if (levelUpgraded) {
        showToast({ title: "Level Upgraded" });
      }
    } catch (err) {
      console.error("Attempt failed:", err);
    } finally {
      setSubmitting(false);
      onAttempted?.(correct);
      setPrevAnswer(index);
    }
  };

  useEffect(() => {
    if (!user?.questionsAttempted) return;
    if (user?.questionsAttempted.length === 0) return;
      const prevAnswer = user.questionsAttempted.find(
        (questionAt) => questionAt.question === question._id,
      )?.answered;
      console.log(user.questionsAttempted, "ques attempted bu user")
      setSelectedIndex(prevAnswer ?? null);
      if(prevAnswer) {

      }
      handleSelect(prevAnswer ?? -1, true);
    
  }, [user?.questionsAttempted]);

  const getTrackStyle = (index: number) => {
    if (selectedIndex === null) return styles.pollTrack;

    const isSelected = selectedIndex === index;
    const isRightAnswer = index === question.correct;

    if (isSelected && isCorrect) {
      return [styles.pollTrack, styles.trackUserTrue];
    }
    if (isSelected && !isCorrect) {
      return [styles.pollTrack, styles.trackUserFalse];
    }
    if (!isSelected && isRightAnswer) {
      return [styles.pollTrack, styles.trackTrue];
    }
    if (!isSelected && !isRightAnswer && selectedIndex !== null) {
      return [styles.pollTrack, styles.trackFalse];
    }
    return styles.pollTrack;
  };

  return (
    <Animated.View
      style={[styles.pollBox]}>
      {/* Time & Date */}
      <View style={styles.pollTimes}>
        <View style={styles.timeItem}>
          <Svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke={pallete.textgray}
            strokeWidth="2">
            <Circle cx="12" cy="12" r="9" />
            <Path d="M12 7V12L14.5 14.5" />
          </Svg>
          <Text style={styles.timeText}>{formatTime(question.createdAt)}</Text>
        </View>
        <View style={styles.timeItem}>
          <Svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke={pallete.textgray}
            strokeWidth="2">
            <Rect x="3" y="6" width="18" height="15" rx="2" />
            <Path d="M3 11H21" />
            <Path d="M9 3V7" />
            <Path d="M15 3V7" />
          </Svg>
          <Text style={styles.timeText}>{formatDate(question.createdAt)}</Text>
        </View>
      </View>

      {/* Question */}
      <Text style={styles.pollQuestion}>{question.question}</Text>

      {/* Options */}
      <View style={styles.pollOptions}>
        {question.options.map((opt, index) => {
          const fillWidth = fillAnims[index].interpolate({
            inputRange: [0, 1],
            outputRange: ["0%", "100%"],
          });

          const isSelected = selectedIndex === index;
          const isRight = index === question.correct;
          const showIcon = selectedIndex !== null && (isSelected || isRight);

          return (
            <Pressable
              key={index}
              disabled={selectedIndex !== null}
              onPress={() => handleSelect(index)}
              style={styles.pollOptionItem}>
              <View style={styles.pollLabelRow}>
                <Text style={styles.optionLabel}>
                  {OPTION_LABELS[index]}) {opt}
                </Text>
              </View>

              <View style={styles.pollSliderContainer}>
                <View style={getTrackStyle(index)}>
                  {/* Animated fill */}
                  <Animated.View
                    style={[
                      styles.fillBar,
                      {
                        width: fillWidth,
                        backgroundColor:
                          isSelected && isCorrect
                            ? "rgba(52, 211, 153, 0.45)"
                            : isSelected && !isCorrect
                              ? "rgba(251, 113, 133, 0.45)"
                              : isRight
                                ? "rgba(52, 211, 153, 0.3)"
                                : "transparent",
                      },
                    ]}
                  />

                  {/* Status icon */}
                  {showIcon && (
                    <View style={styles.pollStatusIcon}>
                      {isRight ? (
                        <Svg
                          width={12}
                          height={12}
                          viewBox="0 0 24 24"
                          fill={pallete.true || "#34d399"}>
                          <Path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </Svg>
                      ) : (
                        <Svg
                          width={12}
                          height={12}
                          viewBox="0 0 24 24"
                          fill={pallete.false || "#fb7185"}>
                          <Path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </Svg>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Explanation (slide + fade) */}
      {showExplanation && question.explanation ? (
        <Animated.View
          style={[
            styles.explanationBox,
            {
              opacity: explanationAnim,
              transform: [
                {
                  translateY: explanationAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}>
          <Text style={styles.explanationLabel}>
            {isCorrect ? "Correct!" : "Explanation"}
          </Text>
          <Text style={styles.explanationText}>{question.explanation}</Text>
        </Animated.View>
      ) : null}

      {/* Footer */}
      <View style={styles.pollFooter}>
        <Pressable style={styles.pollCommentIcon} onPress={onCommentClick}>
          <Svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke={pallete.textgray}
            strokeWidth="2">
            <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </Svg>
          <Text style={styles.commentCount}>
            {(() => {
              const count =
                typeof question.comments === "number"
                  ? question.comments
                  : Array.isArray(question.comments)
                  ? (question.comments as any).length
                  : 0;
              return count >= 1000 ? `${(count / 1000).toFixed(0)}k` : count;
            })()}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  pollBox: {
    minWidth: (width / 100) * 85,
    maxWidth: 400,
    backgroundColor: pallete.bgcard || "rgba(20,20,20,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 16,
  },
  pollTimes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    opacity: 0.7,
  },
  timeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "500",
    color: pallete.textgray,
  },
  pollQuestion: {
    fontSize: 16,
    fontWeight: "500",
    color: pallete.textwhite || "#fff",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  pollOptions: {
    gap: 14,
  },
  pollOptionItem: {
    gap: 6,
  },
  pollLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  optionLabel: {
    fontSize: 13,
    color: pallete.textgray,
  },
  pollSliderContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  pollTrack: {
    flex: 1,
    height: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
  },
  trackUserTrue: {
    borderWidth: 2,
    borderColor: pallete.true || "#34d399",
    backgroundColor: "rgba(52, 211, 153, 0.2)",
  },
  trackUserFalse: {
    borderWidth: 2,
    borderColor: pallete.false || "#fb7185",
    backgroundColor: "rgba(251, 113, 133, 0.2)",
  },
  trackTrue: {
    backgroundColor: "rgba(52, 211, 153, 0.2)",
  },
  trackFalse: {
    backgroundColor: "rgba(251, 113, 133, 0.15)",
  },
  fillBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 20,
  },
  pollStatusIcon: {
    position: "absolute",
    right: 6,
    top: "50%",
    marginTop: -6,
    width: 12,
    height: 12,
    zIndex: 2,
  },
  explanationBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: pallete.accent,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#d1d5db",
  },
  pollFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  pollCommentIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 50,
  },
  commentCount: {
    fontSize: 13,
    color: pallete.textgray,
    opacity: 0.6,
  },
});

export default QuestionCard;
