import React, { useEffect, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { IChapter } from "../../types/Chapter";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DETAILS_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.58, 480);

const formatDurationStats = (totalSec: number): string => {
  if (!totalSec || isNaN(totalSec) || totalSec <= 0) return "0:00";
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

interface ChapterDetailsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  book: IChapter | null;
  durationSec?: number;
  totalPages?: number;
}

export const ChapterDetailsPanel = memo(({
  isOpen,
  onClose,
  book,
  durationSec = 0,
  totalPages,
}: ChapterDetailsPanelProps) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(DETAILS_SHEET_HEIGHT);

  useEffect(() => {
    if (isOpen) {
      translateY.value = withTiming(0, { duration: 200 });
    } else {
      translateY.value = withTiming(DETAILS_SHEET_HEIGHT, { duration: 160 });
    }
  }, [isOpen, translateY]);

  const handleClose = useCallback(() => {
    translateY.value = withTiming(
      DETAILS_SHEET_HEIGHT,
      { duration: 160 },
      () => {
        runOnJS(onClose)();
      }
    );
  }, [onClose, translateY]);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .onChange((event) => {
          if (event.translationY > 0) {
            translateY.value = event.translationY;
          }
        })
        .onEnd((event) => {
          if (event.translationY > 60 || event.velocityY > 400) {
            runOnJS(handleClose)();
          } else {
            translateY.value = withTiming(0, { duration: 140 });
          }
        }),
    [handleClose, translateY]
  );

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!isOpen) return null;

  const publishedDate = (book as any)?.createdAt
    ? new Date((book as any).createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Recent";

  const authorName =
    book?.author && book.author.trim() !== "" ? book.author : "Readapt Creator";

  const likesCount =
    typeof book?.likes === "number"
      ? book.likes
      : Array.isArray(book?.likes)
      ? (book?.likes as any).length
      : 0;

  const commentsCount =
    typeof book?.comments === "number"
      ? book.comments
      : Array.isArray(book?.comments)
      ? (book?.comments as any).length
      : 0;

  const firstMetricVal =
    totalPages && totalPages > 0
      ? `${totalPages} pages`
      : formatDurationStats(durationSec);

  const firstMetricLabel = totalPages && totalPages > 0 ? "Length" : "Duration";

  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.detailsBackdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
      <GestureDetector gesture={dragGesture}>
        <Reanimated.View
          style={[
            styles.detailsPanel,
            { paddingBottom: insets.bottom + 24 },
            animatedStyles,
          ]}
        >
          <View style={styles.dragHandle} />
          <Text style={styles.panelHeading} numberOfLines={1}>
            {book?.title || "Chapter Overview"}
          </Text>
          <View style={styles.authorRow}>
            <Text style={styles.authorLabel}>By</Text>
            <Text style={styles.authorNameVal}>{authorName}</Text>
          </View>
          <View style={styles.panelSRow}>
            <View style={styles.pItem}>
              <Text style={styles.pVal}>{firstMetricVal}</Text>
              <Text style={styles.pLabel}>{firstMetricLabel}</Text>
            </View>
            <View style={styles.pDivider} />
            <View style={styles.pItem}>
              <Text style={styles.pVal}>{likesCount}</Text>
              <Text style={styles.pLabel}>Likes</Text>
            </View>
            <View style={styles.pDivider} />
            <View style={styles.pItem}>
              <Text style={styles.pVal}>{commentsCount}</Text>
              <Text style={styles.pLabel}>Comments</Text>
            </View>
            <View style={styles.pDivider} />
            <View style={styles.pItem}>
              <Text style={styles.pVal}>{publishedDate}</Text>
              <Text style={styles.pLabel}>Published</Text>
            </View>
          </View>
          <ScrollView
            style={styles.descScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.descTitle}>About this Chapter</Text>
            <Text style={styles.panelDescription}>
              {(book as any)?.details ||
                (book as any)?.shortDescription ||
                "No detailed description has been added for this chapter yet."}
            </Text>
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
});

export default ChapterDetailsPanel;

const styles = StyleSheet.create({
  detailsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    zIndex: 9999,
    elevation: 9999,
  },
  detailsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: DETAILS_SHEET_HEIGHT,
    backgroundColor: "rgba(18, 18, 24, 0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
    elevation: 10000,
    zIndex: 10000,
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
    color: "#ffffff",
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
  authorLabel: { fontSize: 12, color: "#9ca3af" },
  authorNameVal: { fontSize: 13, fontWeight: "600", color: "#01796F" },
  panelSRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 14,
  },
  pItem: { flexDirection: "column", alignItems: "center", gap: 4 },
  pVal: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
  pLabel: {
    fontSize: 10,
    color: "#9ca3af",
    textTransform: "uppercase",
  },
  pDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  descScroll: { maxHeight: 150 },
  descTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#01796F",
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

