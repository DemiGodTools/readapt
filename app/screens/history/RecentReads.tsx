import React, { useEffect, useState, useCallback } from "react";
import { Dimensions, View, DeviceEventEmitter } from "react-native";
import useAuth from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { FlatList, StyleSheet, Text } from "react-native";
import { IRecentRead } from "../../../types/Storage";
import { getRecentReads } from "../../../lib/userStorage";
import { useUser } from "../../../hooks/useUser";
import Contentprogress from "../../../components/props/ContentProgress";
import pallete from "../../../lib/Colors";
import { useFocusEffect } from "@react-navigation/native";

interface IRecentReadSection {
  date: string;
  data: IRecentRead[];
}
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../components/nav/MainNavigation";
import { Circle, G, Mask, Path, Rect, Svg } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
const { width } = Dimensions.get("window");

type Props = NativeStackScreenProps<RootStackParamList, "RecentReads">;

const formatDateHeader = (isoStringOrDate: string): string => {
  if (!isoStringOrDate) return "RECENT";
  const d = new Date(isoStringOrDate);
  if (isNaN(d.getTime())) return "RECENT";

  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  if (isToday) return "TODAY";

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "YESTERDAY";

  return d
    .toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .replace(/,/g, "")
    .toUpperCase();
};

const RecentReads = ({ route, navigation }: Props) => {
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const { user } = useUser();
  const [recentReads, setRecentReads] = useState<IRecentReadSection[] | null>(null);
  const insets = useSafeAreaInsets();

  const loadRecentReads = useCallback(async () => {
    try {
      const reads = await getRecentReads(user?._id || user?.userId);
      if (!reads || reads.length === 0) {
        setRecentReads([]);
        return;
      }

      // Sort strictly by timestamp descending (newest read first)
      const sorted = [...reads]
        .filter((r) => r && r.content && (r.content._id || (r.content as any).id))
        .sort((a, b) => {
          const tA = new Date(a.readAt || 0).getTime();
          const tB = new Date(b.readAt || 0).getTime();
          return tB - tA;
        });

      // Group into ordered sections by date descending
      const sectionMap = new Map<string, IRecentRead[]>();
      for (const item of sorted) {
        const header = formatDateHeader(item.readAt);
        const existing = sectionMap.get(header);
        if (existing) {
          existing.push(item);
        } else {
          sectionMap.set(header, [item]);
        }
      }

      const sections: IRecentReadSection[] = Array.from(sectionMap.entries()).map(
        ([date, data]) => ({
          date,
          data,
        })
      );

      setRecentReads(sections);
    } catch (error) {
      console.error("Error fetching recent reads:", error);
      showToast({ title: "Error" });
    }
  }, [user?._id, user?.userId, showToast]);

  useEffect(() => {
    loadRecentReads();
  }, [loadRecentReads, accessToken]);

  useFocusEffect(
    useCallback(() => {
      loadRecentReads();
    }, [loadRecentReads])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("RECENT_READS_UPDATED", () => {
      loadRecentReads();
    });
    return () => sub.remove();
  }, [loadRecentReads]);

  const renderContentCard = ({ item }: { item: IRecentReadSection }) => (
    <View style={styles.sectionItem} key={item.date}>
      <Text style={styles.date}>{item.date}</Text>

      {item.data.map((read: any, idx: number) => {
        const readId = String(read.content?._id || read.content?.id || idx);
        return (
          <Contentprogress
            key={readId}
            id={read.content?._id}
            cover={read.content?.cover}
            title={read.content?.title}
            readtill={read.readtill}
            total={read.total}
            type={read.content?.type}
            author={read.content?.author}
            learWidth={(width / 100) * 90}
          />
        );
      })}
    </View>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={recentReads}
        keyExtractor={(item) => item.date}
        renderItem={renderContentCard}
        numColumns={1}
        scrollEnabled={true}
        ListHeaderComponent={<Text style={styles.title}>Reading History</Text>}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          recentReads !== null ? (
            <View style={styles.emptyReadsPage}>
              <View style={styles.emptyIconCircle}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                  <Mask
                    id="mask0"
                    maskUnits="userSpaceOnUse"
                    x={0}
                    y={0}
                    width={24}
                    height={24}
                  >
                    <Rect width={24} height={24} fill="white" />
                    <Circle cx={18} cy={6} r={5} fill="black" />
                  </Mask>
                  <G mask="url(#mask0)">
                    <Path
                      d="M4 19C4 19 5.5 18 9 18C12.5 18 12 21 12 21C12 21 11.5 18 15 18C18.5 18 20 19 20 19V6C20 6 18.5 5 15 5C11.5 5 12 8 12 8C12 8 12.5 5 9 5C5.5 5 4 6 4 6V19Z"
                      stroke="#01796F"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </G>
                  <Circle
                    cx={18}
                    cy={6}
                    r={4}
                    stroke="#01796F"
                    strokeWidth={1.5}
                    fill="none"
                  />
                  <Path
                    d="M18 4.5V6L19 7"
                    stroke="#01796F"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
              <Text style={styles.emptyTitleText}>No Recent Reads</Text>
              <Text style={styles.emptySubText}>
                Books and audio chapters you read or listen to will appear here
                automatically.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain || "#090314",
    paddingTop: 70,
  },
  listContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingBottom: 30,
  },
  sectionItem: {
    marginBottom: 10,
    width: "100%",
    alignItems: "center",
  },
  date: {
    fontSize: 11,
    fontWeight: "600",
    color: pallete.textgray,
    marginVertical: 14,
    width: (width / 100) * 90,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
    color: pallete.textwhite,
    marginVertical: 24,
  },
  emptyReadsPage: {
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

export default RecentReads;
