import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import pallete from "../../lib/Colors";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../nav/MainNavigation";
import CachedImage from "./CachedImage";

type Props = {
  id: string;
  title: string;
  author: string;
  cover: string;
  chapterCount: number;
  type?: string;
  cardWidth?: number;
  style?: any;
};

const SeriesCard = ({
  id,
  title,
  author,
  cover,
  chapterCount,
  type,
  cardWidth,
  style,
}: Props) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const isFramework = type === "framework";
  const isCompact = cardWidth !== undefined && cardWidth < 220;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 25,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 25,
    }).start();
  };

  const handlePress = () => {
    navigation.navigate("SeriesOverview", { seriesId: id });
  };

  const renderTitle = () => {
    return (
      <Text
        style={[styles.seriesTitle, isCompact && styles.compactTitle]}
        numberOfLines={2}>
        {title}
      </Text>
    );
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[
        styles.seriesCard,
        cardWidth !== undefined && {
          width: cardWidth,
          minWidth: cardWidth,
          marginRight: 0,
        },
        style,
      ]}>
      <Animated.View
        style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
        {/* Stacked Layers */}
        <View
          style={[
            styles.stackLayer1,
            isFramework && { backgroundColor: "#38bdf8" },
            isCompact && styles.compactStack1,
          ]}
        />
        <View
          style={[
            styles.stackLayer2,
            isFramework && { backgroundColor: "#38bdf8" },
            isCompact && styles.compactStack2,
          ]}
        />

        {/* Main Card */}
        <View style={styles.seriesMain}>
          <CachedImage
            uri={cover}
            label={title}
            style={styles.seriesImage}
            letterSize={44}
          />

          {/* Badge */}
          <View style={[styles.seriesBadge, isCompact && styles.compactBadge]}>
            <Svg
              width={isCompact ? 12 : 16}
              height={isCompact ? 12 : 16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={isFramework ? "#38bdf8" : pallete.accent}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round">
              <Line x1="8" y1="6" x2="21" y2="6" />
              <Line x1="8" y1="12" x2="21" y2="12" />
              <Line x1="8" y1="18" x2="21" y2="18" />
              <Line x1="3" y1="6" x2="3.01" y2="6" />
              <Line x1="3" y1="12" x2="3.01" y2="12" />
              <Line x1="3" y1="18" x2="3.01" y2="18" />
            </Svg>
            <Text style={[styles.badgeText, isCompact && styles.compactBadgeText]}>
              {chapterCount} {isFramework ? "LVL" : "CH"}
            </Text>
          </View>
        </View>

        {/* Info */}
        <View style={[styles.seriesInfo, isCompact && styles.compactInfo]}>
          {renderTitle()}
          <View style={styles.seriesMeta}>
            <Text
              style={[styles.metaText, isCompact && styles.compactMetaText]}
              numberOfLines={1}>
              {author}
            </Text>
            <View style={styles.dot} />
            <Text
              style={[styles.metaText, isCompact && styles.compactMetaText]}
              numberOfLines={1}>
              {isFramework ? "Framework" : "Series"}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  seriesCard: {
    width: 280,
    paddingTop: 18,
    minWidth: 280,
    marginRight: 16,
  },
  wrapper: {
    position: "relative",
  },
  stackLayer1: {
    position: "absolute",
    top: -12,
    left: "8%",
    width: "84%",
    height: 44,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: pallete.accent,
    opacity: 0.18,
    zIndex: 1,
  },
  compactStack1: {
    top: -8,
    height: 28,
    borderRadius: 8,
  },
  stackLayer2: {
    position: "absolute",
    top: -6,
    left: "5%",
    width: "90%",
    height: 18,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: pallete.accent,
    opacity: 0.12,
    zIndex: 2,
  },
  compactStack2: {
    top: -4,
    height: 14,
    borderRadius: 8,
  },
  seriesMain: {
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#171717",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    zIndex: 5,
  },
  seriesImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  seriesBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.12)",
  },
  compactBadge: {
    right: 6,
    bottom: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  badgeText: {
    color: "#fff",
    marginLeft: 6,
    fontWeight: "700",
    fontSize: 12,
  },
  compactBadgeText: {
    fontSize: 10,
    marginLeft: 4,
  },
  seriesInfo: {
    marginTop: 16,
  },
  compactInfo: {
    marginTop: 10,
  },
  seriesTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: pallete.textwhite,
    marginBottom: 6,
  },
  compactTitle: {
    fontSize: 13,
    lineHeight: 17,
    marginBottom: 4,
  },
  seriesMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 13,
    color: pallete.textgray,
  },
  compactMetaText: {
    fontSize: 11,
  },
  dot: {
    width: 4,
    height: 4,
    backgroundColor: pallete.textgray,
    borderRadius: 6,
    marginHorizontal: 8,
    opacity: 0.5,
  },
});

export default SeriesCard;
