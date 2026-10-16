import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  TextInput,
  Dimensions,
  Modal,
  TouchableOpacity,
  Alert,
  Animated,
} from "react-native";
import Svg, { Path, Circle, Line, Polyline } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import pallete from "../../lib/Colors";
import useAuth from "../../hooks/useAuth";
import { useUser } from "../../hooks/useUser";
import { ISeries } from "../../types/Series";
import { IChapter } from "../../types/Chapter";
import { api } from "../../lib/api";
import PopButton from "../../components/props/PopButton";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../hooks/useToast";
import { getLevelTitle } from "../../lib/levels";
import { useStreak } from "../../hooks/useStreak";
import * as SecureStore from "expo-secure-store";
import Offline from "../../components/state/Offline";
import { useNetworkStatus } from "../../hooks/useNetwork";
const { width, height } = Dimensions.get("window");

// Level colors
const LEVEL_COLORS: Record<string, string> = {
  Novice: "#4ade80",
  Scholar: "#38bdf8",
  Awakened: "#fbbf24",
  Strategist: "#a78bfa",
};

const tierLabel: string[] = [
  "FREE Tier",
  "Basic plan",
  "PRO TIER",
  "PREMIUM TIER",
];

type IRecentRead = {
  content: IChapter;
  // add other fields if needed
};

const ProfileScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { accessToken } = useAuth();
  const { user, reload, loadingUser, updateUser } = useUser();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const pickAndUploadProfilePhoto = async () => {
    if (!isConnected) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }
    if (!user?.email) {
      showToast({ title: "Profile is not loaded yet." });
      return;
    }

    try {
      setUploadingPhoto(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permissions Required", "Photo library access is required.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images" as any],
        quality: 0.75,
        selectionLimit: 1,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const localAsset = result.assets[0];
      const localUri = localAsset?.uri;
      if (!localUri) {
        showToast({ title: "Unable to read selected image." });
        return;
      }

      // Instant local preview while remote upload is in-flight
      setAvatar(localUri);

      const response = await FileSystem.uploadAsync(
        "https://redapt-admin-sand.vercel.app/api/user/update/profile",
        localUri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "file",
          headers: {
            "x-user-email": user.email,
          },
          parameters: {},
        }
      );

      if (response.status !== 200) {
        showToast({ title: "Upload Error try again later" });
        return;
      }

      const data = JSON.parse(response.body || "{}");
      const remoteUrl = data?.url;

      if (!remoteUrl) {
        showToast({ title: "Upload Error try again later" });
        return;
      }

      setAvatar(remoteUrl);
      updateUser({ image: remoteUrl } as any);
      reload();
    } catch (err: any) {
      showToast({ title: err?.message || "Upload Error try again later" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const [seriesData, setSeriesData] = useState<ISeries | null>(null);
  const [completeChapters, setCompleteChapters] = useState(0);
  const { showModal } = useModal();
  const { streak } = useStreak();
  const [avatar, setAvatar] = useState(user?.image ?? "");

  // Panels
  const [showStreakInfo, setShowStreakInfo] = useState(false);
  const [showLevelInfo, setShowLevelInfo] = useState(false);

  const { showToast } = useToast();
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [newUsername, setNewUsername] = useState(user?.name ?? "");
  const [updatingUsername, setUpdatingUsername] = useState(false);
  const { isConnected } = useNetworkStatus();

  useEffect(() => {
    if (user?.name) {
      setNewUsername(user.name);
    }
  }, [user?.name]);

  // ─── Fetch Series ───────────────────────────────────────────
  useEffect(() => {
    if (!user || !accessToken) return;
    const getSeries = async () => {
      if (user && user?.joinedSeries) {
        try {
          console.log(
            "Fetching series data for joinedSeries:",
            user.joinedSeries,
          );
          const data = await api.get(`/series/${user.joinedSeries}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          setSeriesData(data.data.data);
        } catch (error) {
          console.error("Error fetching series data in profile:", error);
        }
      }
    };
    getSeries();
  }, [user, loadingUser, accessToken, isConnected]);

  // ─── Calculate Progress from recentReads ────────────────────
  useEffect(() => {
    if (!seriesData?.cover || !user?.email) return;

    const getJoinedSeriesData = async () => {
      const readChapters = await AsyncStorage.getItem("recentReads");
      if (!readChapters) return;
      const recentReads: IRecentRead[] = JSON.parse(readChapters);

      // const recentReads: IRecentRead[] = JSON.parse(readChapters);
      const json: IChapter[] = recentReads.map((r) => r.content);

      const ChapterIdsInSeries =
        seriesData?.chapters?.map((item: any) => item.content._id) || [];

      const readChaptersInSeries = json.filter((ch) =>
        ChapterIdsInSeries.includes(ch._id),
      );

      setCompleteChapters(readChaptersInSeries.length);
    };

    getJoinedSeriesData();
  }, [seriesData?.chapters, user, loadingUser, isConnected]);

  // ─── Helpers ────────────────────────────────────────────────
  const progressPercent = (
    (completeChapters /
      (seriesData?.chapters || [])?.filter(
        (item) => item.contentModel === "Chapter",
      ).length) *
    100
  ).toFixed(0);

  const levelName = user?.profileLevel
    ? getLevelTitle(user?.profileLevel)
    : "Novice";
  const levelColor = LEVEL_COLORS[levelName] || LEVEL_COLORS.Novice;

  const handleLogout = async () => {
    // Your logout logic here
    await SecureStore.deleteItemAsync("accessToken");
    navigation.reset({
      index: 0,
      routes: [{ name: "Login" }],
    });
  };

  const uploadSpinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!uploadingPhoto) {
      uploadSpinValue.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(uploadSpinValue, {
        toValue: 1,
        duration: 700,
        easing: undefined,
        useNativeDriver: true,
      })
    );
    loop.start();

    return () => loop.stop();
  }, [uploadingPhoto, uploadSpinValue]);

  const updateUsername = async () => {
     if (!isConnected) {
      showToast({
        title: "Please connect to the Internet.",
      });
      return;
    }
    if (!newUsername.trim()) {
      showToast({ title: "Username cannot be empty" });
      return;
    }

    const previousName = user?.name || "";

    try {
      setUpdatingUsername(true);
      const nextName = newUsername.trim();

      updateUser({ name: nextName } as any);
      setShowUsernameModal(false);

      const newUser = await api.post(
        "/update/username",
        {
          newUsername: nextName,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      reload();
    } catch (err: any) {
      updateUser({ name: previousName } as any);
      Alert.alert(
        "Error",
        err?.response?.data?.message ?? "Unable to update username.",
      );
    } finally {
      setUpdatingUsername(false);
    }
  };

  // ─── Menu Item ──────────────────────────────────────────────
  const MenuItem = ({
    icon,
    label,
    onPress,
    isLogout = false,
    isCurrentPlan = false,
  }: {
    icon?: React.ReactNode;
    label: string;
    onPress?: () => void;
    isLogout?: boolean;
    isCurrentPlan?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        isCurrentPlan && styles.currentPlan,
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}>
      <View style={styles.itemContent}>
        {icon}
        <Text
          style={[
            styles.itemName,
            isLogout && { color: "#ef4444" },
            isCurrentPlan && styles.currentPlanText,
          ]}>
          {label}
        </Text>
      </View>

      {!isCurrentPlan && (
        <Svg
          width={18}
          height={18}
          viewBox="0 0 16 16"
          fill={isLogout ? "#ef4444" : "#fff"}>
          <Path
            fillRule="evenodd"
            d="M10.853333333333333 7.6466666666666665a0.5 0.5 0 0 1 0 0.7066666666666667l-5 5a0.5 0.5 0 0 1 -0.7066666666666667 -0.7066666666666667L9.793333333333333 8 5.1466666666666665 3.3533333333333335a0.5 0.5 0 0 1 0.7066666666666667 -0.7066666666666667l5 5Z"
            clipRule="evenodd"
          />
        </Svg>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {/* ── Profile Info ─────────────────────────────────────── */}
        <View style={styles.profileInfo}>
          <TouchableOpacity
            onPress={() => {
              if (uploadingPhoto) return;

              void pickAndUploadProfilePhoto();
            }}>
            <View style={styles.avatarPlaceholder}>
              <Image
                source={{
                  uri: avatar || "https://via.placeholder.com/160",
                }}
                style={styles.avatarImage}
              />
              {uploadingPhoto && (
                <Animated.View
                  style={[
                    styles.avatarUploadRing,
                    {
                      transform: [
                        {
                          rotate: uploadSpinValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0deg", "360deg"],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.infoDetails}>
            <PopButton onPress={() => setShowUsernameModal(true)}>
              <Text style={styles.userName}>
                {user?.name || "Readapt User"}
              </Text>
            </PopButton>
            <PopButton>
              <Text style={styles.userHandle}>
                @{user?.userId || "readapt_user"}
              </Text>
            </PopButton>

            <Pressable onPress={() => setShowLevelInfo(true)}>
              <View
                style={[styles.levelBadge, { backgroundColor: levelColor }]}>
                <Text style={styles.levelBadgeText}>{levelName}</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── Continue Reading Progress Card ───────────────────── */}
        {user?.joinedSeries && seriesData && completeChapters !== null && (
          <>
            <View style={styles.section}>
              <PopButton
                onPress={() => {
                  navigation.navigate("SeriesOverview", {
                    seriesId: user?.joinedSeries || "",
                  });
                }}>
                <View style={styles.progressCard}>
                  <View style={styles.progressContent}>
                    <Text style={styles.progressTitle}>{seriesData.title}</Text>

                    <Text style={styles.progressMeta}>
                      Chapter {completeChapters} •{" "}
                      <Text style={styles.accentText}>
                        {progressPercent}% Complete
                      </Text>
                    </Text>

                    {/* Progress Track */}
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: (width / 100) * Number(progressPercent),
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Chevron Right Icon */}
                  <Svg width={20} height={20} viewBox="0 0 16 16" fill="none">
                    <Path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10.853333333333333 7.6466666666666665a0.5 0.5 0 0 1 0 0.7066666666666667l-5 5a0.5 0.5 0 0 1 -0.7066666666666667 -0.7066666666666667L9.793333333333333 8 5.1466666666666665 3.3533333333333335a0.5 0.5 0 0 1 0.7066666666666667 -0.7066666666666667l5 5Z"
                      fill={pallete.textwhite}
                    />
                  </Svg>
                </View>
              </PopButton>
            </View>
          </>
        )}

        {/* ── Streak Card ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [
              styles.streakCard,
              pressed && { transform: [{ scale: 0.99 }] },
            ]}
            onPress={() => setShowStreakInfo(true)}>
            <View style={styles.streakVisual}>
              <Svg
                width={30}
                height={30}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2">
                <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
              </Svg>
            </View>

            <View style={styles.streakDetails}>
              <Text style={styles.streakLabel}>Current Streak</Text>
              <View style={styles.streakDayNumber}>
                <Text style={styles.num}>{streak}</Text>
                <Text style={styles.day}>Days</Text>
              </View>
            </View>

            <Svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke={pallete.textgray}
              strokeWidth="2">
              <Circle cx="12" cy="12" r="10" />
              <Line x1="12" y1="16" x2="12" y2="12" />
              <Line x1="12" y1="8" x2="12.01" y2="8" />
            </Svg>
          </Pressable>
        </View>

        {/* ── Action List ──────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.actionList}>
            <MenuItem
              label="Recent Reads"
              onPress={() => navigation.navigate("RecentReads")}
              icon={
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={pallete.accent}
                  strokeWidth="1.5">
                  <Path d="M4 19C4 19 5.5 18 9 18C12.5 18 12 21 12 21C12 21 11.5 18 15 18C18.5 18 20 19 20 19V6C20 6 18.5 5 15 5C11.5 5 12 8 12 8C12 8 12.5 5 9 5C5.5 5 4 6 4 6V19Z" />
                  <Circle cx="18" cy="6" r="4" />
                  <Path d="M18 4.5V6L19 7" />
                </Svg>
              }
            />

            <MenuItem
              label="Liked Content"
              onPress={() => navigation.navigate("LikedContent")}
              icon={
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={pallete.accent}
                  strokeWidth="2">
                  <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </Svg>
              }
            />

            <MenuItem
              label="About this App"
              onPress={() => navigation.navigate("About")}
              icon={
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={pallete.accent}
                  strokeWidth="2">
                  <Circle cx="12" cy="12" r="10" />
                  <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <Line x1="12" y1="17" x2="12.01" y2="17" />
                </Svg>
              }
            />

            <MenuItem
              label="Upgrade"
              onPress={() => navigation.navigate("Subscription")}
              icon={
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={pallete.accent}
                  strokeWidth="1.5">
                  <Path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5Z" />
                  <Path d="M5 20H19" />
                </Svg>
              }
            />
            {user?.subscription && (
              <MenuItem
                label={tierLabel[user?.subscription.plan]}
                isCurrentPlan
              />
            )}
            <MenuItem
              label="Log Out"
              isLogout
              onPress={() =>
                showModal({
                  title: "Are you sure want to LogOut",
                  onConfirm: handleLogout,
                })
              }
              icon={
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2">
                  <Path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4" />
                  <Polyline points="16 17 21 12 16 7" />
                  <Line x1="21" y1="12" x2="9" y2="12" />
                </Svg>
              }
            />
          </View>
        </View>

        <Text style={styles.footer}>© 2026 Readapt · Version 1.0.2</Text>
      </ScrollView>

      <Modal
        visible={showUsernameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUsernameModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.usernameModal}>
            <Text style={styles.modalTitle}>Change Username</Text>

            <TextInput
              value={newUsername}
              onChangeText={setNewUsername}
              placeholder="Enter username"
              placeholderTextColor="#888"
              style={styles.usernameInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowUsernameModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                disabled={updatingUsername}
                onPress={updateUsername}>
                <Text style={styles.saveButtonText}>
                  {updatingUsername ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Streak Info Panel ──────────────────────────────────── */}
      <Modal visible={showStreakInfo} transparent animationType="slide">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowStreakInfo(false)}
        />
        <View style={styles.detailsPanel}>
          <View style={styles.dragHandle} />
          <Text style={styles.panelHeader}>How Streak Works?</Text>
          <Text style={styles.panelDescription}>
            <Text style={{ fontWeight: "700" }}>Read or listen</Text> to a
            chapter <Text style={{ fontWeight: "700" }}>every day</Text> and
            keep your <Text style={{ fontWeight: "700" }}>streak</Text> going!
            Keep learning for{" "}
            <Text style={{ fontWeight: "700" }}>7, 14, and 21 days</Text> in a
            row and{" "}
            <Text style={{ fontStyle: "italic" }}>unlock exciting rewards</Text>{" "}
            and surprises at every milestone.
            {"\n\n"}
            <Text style={{ color: "#f59e0b", fontWeight: "700" }}>
              Are you ready?
            </Text>
          </Text>
        </View>
      </Modal>

      {/* ── Level Info Panel ───────────────────────────────────── */}
      <Modal visible={showLevelInfo} transparent animationType="slide">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowLevelInfo(false)}
        />
        <View style={styles.detailsPanel}>
          <View style={styles.dragHandle} />
          <Text style={styles.panelHeader}>How Levels Works?</Text>
          <Text style={styles.panelDescription}>
            Can you <Text style={{ fontWeight: "700" }}>reach the top</Text>?
            Your intelligence is your greatest weapon.
            {"\n\n"}
            <Text style={{ color: "#f59e0b", fontWeight: "700" }}>
              • The Rule of Three:
            </Text>{" "}
            Answer{" "}
            <Text style={{ fontStyle: "italic" }}>
              3 questions correctly in a row
            </Text>{" "}
            to <Text style={{ fontWeight: "700" }}>Level Up</Text>.{"\n\n"}
            <Text style={{ color: "#f59e0b", fontWeight: "700" }}>
              • High Stakes:
            </Text>{" "}
            A{" "}
            <Text style={{ fontStyle: "italic" }}>single incorrect answer</Text>{" "}
            triggers an{" "}
            <Text style={{ fontWeight: "700" }}>immediate Level Down</Text>.
          </Text>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050505",
    paddingTop: 90,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginBottom: 30,
    paddingHorizontal: 24,
  },

  // Profile Info
  profileInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 30,
    marginBottom: 30,
    paddingHorizontal: 24,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
    backgroundColor: pallete.bgcard,
    borderWidth: 3,
    borderColor: pallete.accent,
    shadowColor: pallete.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  avatarUploadRing: {
    position: "absolute",
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.35)",
    borderTopColor: "#ffffff",
    borderRightColor: "#ffffff",
  },
  infoDetails: {
    marginLeft: 18,
    flex: 1,
  },
  userName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  userHandle: {
    fontSize: 13,
    color: pallete.textgray,
    fontWeight: "500",
    marginBottom: 8,
  },
  levelBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  levelBadgeText: {
    color: "#050505",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Progress Card
  progressCard: {
    backgroundColor: pallete.bgcard,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressContent: {
    flex: 1,
    marginRight: 16,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 6,
  },
  progressMeta: {
    fontSize: 12,
    color: pallete.textgray,
    marginBottom: 10,
  },
  accentText: {
    color: pallete.accent,
    fontWeight: "700",
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
    backgroundColor: pallete.accent,
  },

  // Streak Card
  streakCard: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  streakVisual: {
    marginRight: 15,
  },
  streakDetails: {
    flex: 1,
  },
  streakLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#f59e0b",
    marginBottom: 4,
  },
  streakDayNumber: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
  },
  num: {
    fontSize: 48,
    fontWeight: "800",
    color: "#fff",
  },
  day: {
    fontSize: 24,
    color: "#ccc",
    fontWeight: "600",
  },

  // Action List
  actionList: {
    backgroundColor: pallete.bgcard,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#fff",
  },
  currentPlan: {
    backgroundColor: "transparent",
    borderBottomWidth: 0,
    paddingVertical: 12,
  },
  currentPlanText: {
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: pallete.accent,
  },

  footer: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
    paddingVertical: 15,
    fontWeight: "500",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: pallete.panelbg,
    justifyContent: "center",
    alignItems: "center",
  },

  usernameModal: {
    width: "88%",
    borderRadius: 18,
    backgroundColor: pallete.bgcard,
    padding: 22,
    borderWidth: 1,
    borderColor: pallete.bgcard,
  },

  modalTitle: {
    color: pallete.textwhite,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 18,
  },

  usernameInput: {
    backgroundColor: pallete.bgcard,
    color: pallete.textwhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pallete.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },

  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
  },

  cancelButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginRight: 10,
  },

  cancelButtonText: {
    color: pallete.textwhite,
    fontWeight: "600",
  },

  saveButton: {
    backgroundColor: pallete.true,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },

  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
  },

  // Panels
  modalBackdrop: {
    flex: 1,
    height: 2 * height,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  detailsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  dragHandle: {
    width: 48,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    alignSelf: "center",
    marginBottom: 16,
  },
  panelHeader: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: pallete.accent,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  panelDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: "#d1d5db",
    textAlign: "center",
  },
  panelActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 24,
  },
  panelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnCancel: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  btnCancelText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  btnContinue: {
    backgroundColor: "#ef4444",
  },
  btnContinueText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default ProfileScreen;
