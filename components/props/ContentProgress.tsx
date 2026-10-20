import React, { memo, useEffect } from "react";
import {
  Image,
  Text,
  View,
  StyleSheet,
  Pressable,
  Dimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../nav/MainNavigation";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import pallete from "../../lib/Colors";

const { width } = Dimensions.get("window");

type Props = {
  id: string;
  cover: string;
  title: string;
  readtill: any;
  total: any;
  type: string;
  author: string;
  media?: string;
  learWidth?: number;
  fileSize?: string;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const toSeconds = (val: any): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") {
    return val > 10000 ? Math.floor(val / 1000) : Math.floor(val);
  }
  const str = String(val).trim();
  if (str === "00:10" || str === "10") return 0;
  if (str.includes(":")) {
    const parts = str.split(":").map((p) => parseFloat(p) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const n = parseFloat(str);
  if (isNaN(n) || n <= 0) return 0;
  return n > 10000 ? Math.floor(n / 1000) : Math.floor(n);
};

const formatClock = (sec: number): string => {
  if (!sec || sec <= 0 || isNaN(sec)) return "00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);

  if (h > 0) {
    return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
};

const Contentprogress: React.FC<Props> = memo(
  ({
    id,
    cover,
    title,
    readtill,
    total,
    type,
    author,
    media,
    learWidth,
    fileSize,
  }) => {
    const navigation = useNavigation<NavigationProp>();

    const scaleAnim = useSharedValue(1);
    const progressFillAnim = useSharedValue(0);

    const isAudio = String(type || "").toLowerCase().includes("audio");
    const accentColor = isAudio ? "#38bdf8" : "#22c55e";

    let currentSec = 0;
    let totalSec = 0;
    let displayCurrent = "1";
    let displayTotal = "1";
    let progressPct = 0;
    let targetPage = 1;
    let resolvedTotalPages = 0;

    if (isAudio) {
      currentSec = toSeconds(readtill);
      totalSec = toSeconds(total);
      if (totalSec > 0 && totalSec < currentSec) totalSec = currentSec;

      displayCurrent = formatClock(currentSec);
      displayTotal = totalSec > 0 ? formatClock(totalSec) : "--:--";
      progressPct =
        totalSec > 0
          ? Math.min(100, Math.max(0, (currentSec / totalSec) * 100))
          : 0;
    } else {
      targetPage = Math.max(1, parseInt(String(readtill), 10) || 1);
      const parsedTotal = parseInt(String(total), 10) || 0;
      resolvedTotalPages =
        parsedTotal > 0 ? Math.max(targetPage, parsedTotal) : 0;

      displayCurrent = String(targetPage);
      displayTotal =
        resolvedTotalPages > 0 ? String(resolvedTotalPages) : "--";
      progressPct =
        resolvedTotalPages > 0
          ? Math.min(100, Math.max(0, (targetPage / resolvedTotalPages) * 100))
          : 0;
    }

    // Smooth UI Thread progress interpolation
    useEffect(() => {
      progressFillAnim.value = withTiming(progressPct, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
    }, [progressPct]);

    const animatedFillStyle = useAnimatedStyle(() => ({
      width: `${progressFillAnim.value}%`,
    }));

    const animatedCardStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scaleAnim.value }],
    }));

    const handlePressIn = () => {
      scaleAnim.value = withTiming(0.98, {
        duration: 90,
        easing: Easing.out(Easing.quad),
      });
    };

    const handlePressOut = () => {
      scaleAnim.value = withTiming(1, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      });
    };

    const handlePress = () => {
      if (!id) return;

      if (isAudio) {
        (navigation as any).navigate("AudioRdr", {
          bookId: id,
          seekTime: currentSec,
          initialBookData: {
            _id: id,
            title,
            cover,
            author: author || "READAPT",
            type: "audio",
            media: media || undefined,
            duration: totalSec > 0 ? totalSec : undefined,
            total: totalSec > 0 ? totalSec : undefined,
          },
        });
      } else {
        (navigation as any).navigate("ReadBook", {
          bookId: id,
          page: targetPage,
          initialPage: targetPage,
          startPage: targetPage,
          initialBookData: {
            _id: id,
            title,
            cover,
            author: author || "READAPT",
            type: "pdf",
            media: media || undefined,
            total: resolvedTotalPages > 0 ? resolvedTotalPages : undefined,
          },
        });
      }
    };

    return (
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={styles.listItem}>
        <Animated.View
          style={[
            styles.container,
            { width: learWidth ? learWidth : (width / 100) * 85 },
            animatedCardStyle,
          ]}>
          <View style={styles.itemContent}>
            {/* Thumbnail */}
            <View style={styles.thumbWrapper}>
              <Image source={{ uri: cover }} style={styles.listThumb} />
              <View
                style={[
                  styles.thumbBadge,
                  { backgroundColor: accentColor },
                ]}>
                <Text style={styles.badgeText}>
                  {isAudio ? "AUDIO" : "BOOK"}
                </Text>
              </View>
            </View>

            {/* Info */}
            <View style={styles.listInfo}>
              <Text style={styles.listTitle} numberOfLines={1}>
                {title}
              </Text>

              <Text style={styles.listAuthor} numberOfLines={1}>
                {author || "READAPT"}
              </Text>

              {fileSize ? (
                <Text style={styles.fileSize}>{fileSize}</Text>
              ) : null}

              {/* Progress Count */}
              <View style={styles.progressTextContainer}>
                {isAudio ? (
                  <>
                    <Text style={styles.progressRead}>{displayCurrent}</Text>
                    <Text style={styles.progressTotal}>
                      {` / ${displayTotal} mins`}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.progressRead}>{displayCurrent}</Text>
                    <Text style={styles.progressTotal}>
                      {` / ${displayTotal} pages`}
                    </Text>
                  </>
                )}
              </View>

              {/* Smooth Animated Progress Track */}
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    { backgroundColor: accentColor },
                    animatedFillStyle,
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Chevron */}
          <Svg
            width={18}
            height={18}
            viewBox="0 0 16 16"
            fill="rgba(255,255,255,0.4)">
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M10.853 7.647a.5.5 0 0 1 0 .706l-5 5a.5.5 0 0 1-.706-.706L9.793 8 5.147 3.353a.5.5 0 0 1 .706-.706l5 5Z"
            />
          </Svg>
        </Animated.View>
      </Pressable>
    );
  }
);

const styles = StyleSheet.create({
  listItem: {
    marginBottom: 10,
    width: "100%",
    alignItems: "center",
  },
  container: {
    backgroundColor: pallete.bgcard,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  thumbWrapper: {
    position: "relative",
    width: 52,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
    marginRight: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  listThumb: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  thumbBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    alignItems: "center",
  },
  badgeText: {
    fontSize: 7.5,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 0.5,
  },
  listInfo: {
    flex: 1,
    justifyContent: "center",
  },
  listTitle: {
    fontFamily: "Playfair Display",
    fontSize: 14,
    fontWeight: "700",
    color: pallete.textwhite,
    marginBottom: 2,
  },
  listAuthor: {
    fontSize: 11,
    color: pallete.textgray,
    marginBottom: 6,
  },
  fileSize: {
    fontSize: 10,
    color: "#9ca3af",
    marginBottom: 6,
  },
  progressTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  progressRead: {
    fontSize: 11,
    color: pallete.textwhite,
    fontWeight: "700",
  },
  progressTotal: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    fontWeight: "500",
  },
  progressTrack: {
    height: 4.5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
});

export default Contentprogress;