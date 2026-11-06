import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  DeviceEventEmitter,
} from "react-native";

import AsyncStorage from '@react-native-async-storage/async-storage';

import Svg, { Path, Polyline, Line } from "react-native-svg";

import { useDownloads, DownloadedChapter, ActiveDownloadItem } from "../../hooks/useDownloads";
import CachedImage from "../../components/props/CachedImage";
import { IRecentRead } from "../../types/Storage";
import { getRecentReads } from "../../lib/userStorage";
import { useUser } from "../../hooks/useUser";
import Contentprogress from "../../components/props/ContentProgress";
import UpgradeSheet from "../../components/props/UpgradeSheet";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

const ACCENT = "#01796F";

const TrashIcon = ({
  size = 16,
  color = "#9ca3af",
}: {
  size?: number;
  color?: string;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round">
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <Path d="M10 11v6" />
    <Path d="M14 11v6" />
    <Path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </Svg>
);

const DownloadIcon = ({
  size = 24,
  color = "#01796F",
}: {
  size?: number;
  color?: string;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round">
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <Polyline points="7 10 12 15 17 10" />
    <Line x1="12" y1="15" x2="12" y2="3" />
  </Svg>
);

const FileIcon = ({
  size = 23,
  color = "#9ca3af",
}: {
  size?: number;
  color?: string;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Polyline points="14 2 14 8 20 8" />
    <Line x1="8" y1="13" x2="16" y2="13" />
    <Line x1="8" y1="17" x2="16" y2="17" />
  </Svg>
);

const HeadphonesIcon = ({
  size = 23,
  color = "#9ca3af",
}: {
  size?: number;
  color?: string;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round">
    <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <Path d="M3 18a3 3 0 0 0 3 3h1v-8H6a3 3 0 0 0-3 3v2z" />
    <Path d="M21 18a3 3 0 0 1-3 3h-1v-8h1a3 3 0 0 1 3 3v2z" />
  </Svg>
);

export default function Downloads() {
  const {
    downloads,
    isLoading,
    activeDownloads,
    downloadStatuses,
    deleteChapter,
    refreshDownloads,
  } = useDownloads();
  const { user } = useUser();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [continueReading, setContinueReading] = useState<IRecentRead[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DownloadedChapter | null>(null);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);

  const closeDeletePanel = () => {
    setDeleteSheetVisible(false);
  };

  const openDeletePanel = (item: DownloadedChapter) => {
    setDeleteTarget(item);
    setDeleteSheetVisible(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget._id;
    setDeleteSheetVisible(false);
    await deleteChapter(id);
  };

  const groupedDownloads = useMemo(() => {
    const groups: Record<string, DownloadedChapter[]> = {};
    downloads.forEach((item: DownloadedChapter) => {
      const date = new Date(item.dateAdded).toLocaleDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(item);
    });
    return Object.entries(groups);
  }, [downloads]);

  const loadRecentReads = async () => {
    try {
      const userId = user?._id || user?.userId;
      const recentReads = await getRecentReads(userId);
      setContinueReading(recentReads || []);
    } catch (error) {
      console.error('Error loading recent reads:', error);
      setContinueReading([]);
    }
  };

  useEffect(() => {
    loadRecentReads();

    const subRecent = DeviceEventEmitter.addListener('RECENT_READS_UPDATED', (data) => {
      if (Array.isArray(data)) {
        setContinueReading(data);
      } else {
        loadRecentReads();
      }
    });

    const subDl = DeviceEventEmitter.addListener('DOWNLOADS_CHANGED', () => {
      loadRecentReads();
    });

    return () => {
      subRecent.remove();
      subDl.remove();
    };
  }, [user?._id, user?.userId]);

  const getRecentRead = (id: string): IRecentRead | null => {
    try {
      return continueReading?.find((item) => item?.content?._id === id || (item?.content as any)?.id === id) || null;
    } catch (error) {
      return null;
    }
  };

  const openDownloadedItem = (item: DownloadedChapter) => {
    const readTill = getRecentRead(item._id);
    const targetPage = Math.max(1, parseInt(String(readTill?.readtill || "1"), 10) || 1);
    const resolvedTotal = readTill?.total || (item as any)?.duration || item?.total || 0;
    const initialBookData = {
      _id: item._id,
      title: item.title,
      cover: item.cover,
      author: item.author || "READAPT",
      type: item.type,
      media: item.localUri || item.media,
      total: parseInt(String(resolvedTotal), 10) || 1,
      duration: resolvedTotal,
    };

    if (String(item.type || "").toLowerCase().includes("audio")) {
      const seekSec = typeof readTill?.readtill === "number" ? readTill.readtill : parseFloat(String(readTill?.readtill || "0")) || 0;
      (navigation as any).navigate("AudioRdr", {
        bookId: item._id,
        seekTime: seekSec,
        initialBookData,
      });
    } else {
      (navigation as any).navigate("ReadBook", {
        bookId: item._id,
        page: targetPage,
        initialPage: targetPage,
        startPage: targetPage,
        initialBookData,
      });
    }
  };

  const renderItem = ({ item }: { item: DownloadedChapter }) => {
    const readTill = getRecentRead(item._id);
    const resolvedTotal = readTill?.total || (item as any)?.duration || item?.total || 0;
    const resolvedReadtill = readTill?.readtill !== undefined ? String(readTill.readtill) : "0";

    return (
      <Pressable
        style={({ pressed }) => [styles.itemContent, pressed && { opacity: 0.88 }]}
        onPress={() => openDownloadedItem(item)}
        onLongPress={() => openDeletePanel(item)}
        delayLongPress={450}>
        <View style={{ flex: 1 }} pointerEvents="none">
          <Contentprogress
            id={item._id}
            cover={item.cover}
            title={item.title}
            readtill={resolvedReadtill}
            total={resolvedTotal}
            type={item.type}
            author={item.author}
            fileSize={item.fileSize}
          />
        </View>
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {downloads.length === 0 && activeDownloads.length === 0 ? (
        <EmptyDownloads reload={refreshDownloads} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={styles.listContent}>
          {/* Active Downloads Section */}
          {activeDownloads.length > 0 && (
            <View style={styles.activeSection}>
              <Text style={styles.activeSectionTitle}>
                Downloading ({activeDownloads.length})
              </Text>
              {activeDownloads.map((ad) => {
                const isAudio = String(ad.chapter.type || "").toLowerCase().includes("audio");
                const mbWritten = (ad.bytesWritten / (1024 * 1024)).toFixed(1);
                const mbTotal = (ad.totalBytes / (1024 * 1024)).toFixed(1);
                const sizeText =
                  ad.totalBytes > 0
                    ? `${mbWritten} MB / ${mbTotal} MB`
                    : ad.percent > 0
                    ? `${ad.percent}%`
                    : "Connecting...";

                return (
                  <View key={ad.id} style={styles.activeCard}>
                    <View style={styles.activeCardRow}>
                      {ad.chapter.cover ? (
                        <CachedImage
                          uri={ad.chapter.cover}
                          label={ad.chapter.title}
                          style={styles.activeThumb}
                          transition={0}
                          letterSize={14}
                        />
                      ) : (
                        <View style={styles.activeThumbFallback}>
                          {isAudio ? (
                            <HeadphonesIcon size={20} color="#38bdf8" />
                          ) : (
                            <FileIcon size={20} color="#22c55e" />
                          )}
                        </View>
                      )}
                      <View style={styles.activeInfo}>
                        <View style={styles.activeTitleRow}>
                          <Text style={styles.activeTitle} numberOfLines={1}>
                            {ad.chapter.title}
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              ad.status === "completed" && {
                                backgroundColor: "rgba(34, 197, 94, 0.15)",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                ad.status === "completed" && { color: "#22c55e" },
                              ]}
                            >
                              {ad.status === "completed" ? "Done" : `${ad.percent}%`}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.activeAuthor} numberOfLines={1}>
                          {ad.chapter.author || "READAPT"} • {sizeText}
                        </Text>
                        <View style={styles.activeProgressTrack}>
                          <View
                            style={[
                              styles.activeProgressFill,
                              {
                                width: `${Math.max(4, ad.percent)}%`,
                                backgroundColor: isAudio ? "#38bdf8" : "#22c55e",
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {groupedDownloads.map(([date, items]) => (
            <View style={styles.dateGroup} key={date}>
              <Text style={styles.dateTitle}>{date}</Text>

              {items.map((item) => (
                <View key={item._id}>{renderItem({ item })}</View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Delete confirmation bottom sheet */}
      <UpgradeSheet
        visible={deleteSheetVisible}
        onClose={closeDeletePanel}
        onClosed={() => setDeleteTarget(null)}
        title="Are you sure to delete"
      >
        <View style={styles.deleteSheetBody}>
          <Text style={styles.deleteTitle} numberOfLines={1}>
            {deleteTarget?.title}
          </Text>

          <View style={styles.panelActions}>
            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={closeDeletePanel}>
              <Text style={styles.cancelText}>Dismiss</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.continueButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={confirmDelete}>
              <Text style={styles.continueText}>Yes</Text>
            </Pressable>
          </View>
        </View>
      </UpgradeSheet>
    </View>
  );
}

function EmptyDownloads({reload}: {reload: () => void}) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <DownloadIcon />
      </View>

      <Text style={styles.emptyTitle}>No Downloads Yet</Text>

      <Text style={styles.emptySubtitle}>
        Items you download for offline reading or listening will appear here.
      </Text>
      <TouchableOpacity onPress={reload}><Text>REfresh</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    
    paddingBottom: 40,
    backgroundColor: "#090314",
  },

  listContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    marginTop: 120,
  },

  dateGroup: {
    marginBottom: 20,
  },

  dateTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#9ca3af",
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 8,
  },

  item: {
    minHeight: 84,
    backgroundColor: "rgba(20,20,20,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 12,

    flexDirection: "row",
    alignItems: "center",

    marginBottom: 12,
  },

  itemPressed: {
    transform: [{ scale: 0.99 }],
  },

  itemContent: {
    minWidth: 80,
    // flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  thumbWrapper: {
    width: 60,
    height: 60,
    position: "relative",
    flexShrink: 0,
  },

  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },

  thumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  typeBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,

    paddingHorizontal: 6,
    paddingVertical: 2,

    borderRadius: 4,

    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },

  typeBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  info: {
    flex: 1,
    marginLeft: 16,
    minWidth: 0,
  },

  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },

  author: {
    color: "#9ca3af",
    fontSize: 10,
    marginBottom: 6,
  },

  progressTextRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  progressText: {
    color: "#9ca3af",
    fontSize: 10,
    fontWeight: "500",
  },

  progressStrong: {
    color: "#fff",
    fontWeight: "700",
  },

  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#9ca3af",
    opacity: 0.5,
    marginHorizontal: 8,
  },

  fileSize: {
    color: "#9ca3af",
    fontSize: 10,
    fontWeight: "500",
  },

  progressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 10,
  },

  downloadingText: {
    color: ACCENT,
    fontSize: 9,
    marginTop: 4,
  },

  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,

    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",

    alignItems: "center",
    justifyContent: "center",

    marginLeft: 12,
  },

  deletePressed: {
    transform: [{ scale: 0.9 }],
    backgroundColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.2)",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#9ca3af",
    fontSize: 13,
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: 60,
  },

  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,

    backgroundColor: "rgba(1,121,111,0.1)",
    borderWidth: 1,
    borderColor: "rgba(1,121,111,0.2)",

    alignItems: "center",
    justifyContent: "center",

    marginBottom: 16,
  },

  emptyTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },

  emptySubtitle: {
    color: "#9ca3af",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 240,
  },

  deleteSheetBody: {
    paddingHorizontal: 24,
  },

  deleteTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  panelActions: {
    flexDirection: "row",
    gap: 16,

    marginTop: 24,
    paddingHorizontal: 12,
  },

  cancelButton: {
    flex: 1,

    paddingVertical: 14,

    borderRadius: 12,

    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",

    alignItems: "center",
  },

  continueButton: {
    flex: 1,

    paddingVertical: 14,

    borderRadius: 12,

    backgroundColor: "#ef4444",

    alignItems: "center",
  },

  cancelText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  continueText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  buttonPressed: {
    transform: [{ scale: 0.97 }],
  },
  activeSection: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  activeSectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    opacity: 0.85,
  },
  activeCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  activeCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activeThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  activeThumbFallback: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeInfo: {
    flex: 1,
    gap: 4,
  },
  activeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  activeTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  statusBadge: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "700",
  },
  activeAuthor: {
    color: "#9ca3af",
    fontSize: 11.5,
  },
  activeProgressTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4,
  },
  activeProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
});