import React, { useMemo } from "react";
import { View, Dimensions } from "react-native";
import ContentCard from "../../../components/props/ContentCard";
import { FlatList, StyleSheet, Text } from "react-native";
import { useUser } from "../../../hooks/useUser";
import pallete from "../../../lib/Colors";

import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../components/nav/MainNavigation";
import { Path, Svg } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Offline from "../../../components/state/Offline";
import { useNetworkStatus } from "../../../hooks/useNetwork";

type Props = NativeStackScreenProps<RootStackParamList, "LikedContent">;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const HORIZONTAL_PADDING = 16;
const GRID_GAP = 10;
const CARD_WIDTH = Math.floor(
  (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS
);

const LikedContent = ({ route, navigation }: Props) => {
  const { user, loadingUser } = useUser();
  const insets = useSafeAreaInsets();
  const { isConnected } = useNetworkStatus();

  const sortedLikes = useMemo(() => {
    if (!user?.likes || !Array.isArray(user.likes)) return [];
    return [...user.likes].sort((a: any, b: any) => {
      const timeB = new Date(b?.updatedAt || b?.likedAt || b?.createdAt || 0).getTime();
      const timeA = new Date(a?.updatedAt || a?.likedAt || a?.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return 0;
    });
  }, [user?.likes]);

  const renderContentCard = ({ item, index }: { item: any; index: number }) => {
    return (
      <ContentCard
        key={String(item?._id || item?.id || index)}
        book={item}
        index={index}
        isLiked={true}
        compact={true}
        cardWidth={CARD_WIDTH}
      />
    );
  };

  if (!user && !isConnected) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <Offline />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {sortedLikes && !loadingUser && (
        <FlatList
          key="liked-grid-3-col"
          data={sortedLikes}
          keyExtractor={(item: any, index) => String(item?._id || (item as any)?.id || index)}
          renderItem={renderContentCard}
          numColumns={NUM_COLUMNS}
          scrollEnabled={true}
          columnWrapperStyle={{
            gap: GRID_GAP,
          }}
          ListHeaderComponent={<Text style={styles.title}>Liked Content</Text>}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingHorizontal: HORIZONTAL_PADDING,
              paddingBottom: insets.bottom + 24,
            },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyLikedBox}>
              <View style={styles.emptyIconCircle}>
                <Svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill={pallete.accent || "#01796F"}>
                  <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </Svg>
              </View>

              <Text style={styles.emptyTitleText}>No Liked Content</Text>
              <Text style={styles.emptySubText}>
                Books and audios you like will appear here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain || "#090314",
    paddingTop: 90,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
    color: pallete.textwhite,
    marginVertical: 40,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  emptyLikedBox: {
    flex: 1,
    paddingVertical: 60,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(1, 121, 111, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(1, 121, 111, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 6,
    textAlign: "center",
  },
  emptySubText: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 18,
    maxWidth: 240,
    textAlign: "center",
  },
});

export default LikedContent;
