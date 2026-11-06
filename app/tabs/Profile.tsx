import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Dimensions,
  Modal,
  TouchableOpacity,
  Alert,
  Animated,
  Vibration,
  Platform,
} from "react-native";
import Svg, { Path, Circle, Line, Polyline } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, ActivityIndicator } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import pallete from "../../lib/Colors";
import useAuth from "../../hooks/useAuth";
import { useUser } from "../../hooks/useUser";
import { ISeries } from "../../types/Series";
import { IChapter } from "../../types/Chapter";
import { api, getAccountDeletionUrl } from "../../lib/api";
import CachedImage from "../../components/props/CachedImage";
import PopButton from "../../components/props/PopButton";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { useToast } from "../../hooks/useToast";
import { getLevelTitle } from "../../lib/levels";
import { useStreak } from "../../hooks/useStreak";
import * as SecureStore from "expo-secure-store";
import Offline from "../../components/state/Offline";
import UpgradeSheet from "../../components/props/UpgradeSheet";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { IS_EARLY_ACCESS_FREE } from "../../lib/entitlements";
import { getRecentReads } from "../../lib/userStorage";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");
const PREVIEW_SIZE = Math.min(width * 0.82, 330);

// Level colors
const LEVEL_COLORS: Record<string, string> = {
  Novice: "#4ade80",
  Scholar: "#38bdf8",
  Awakened: "#fbbf24",
  Strategist: "#a78bfa",
};

// Early Access
const tierLabel: string[] = [
  IS_EARLY_ACCESS_FREE ? "Early Access VIP" : "FREE Tier",
  "Basic plan",
  "PRO TIER",
  "PREMIUM TIER",
];

type IRecentRead = {
  content: IChapter;
};

interface CircularProgressProps {
  progress: number;
}

const CircularProgress: React.FC<CircularProgressProps> = ({ progress }) => {
  const size = 44;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = circumference * (1 - clamped);
  const percentage = Math.round(clamped * 100);

  return (
    <View style={styles.circularProgressContainer}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#00D2B4"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.circularProgressCenter}>
        <Text style={styles.circularProgressText}>{percentage}%</Text>
      </View>
    </View>
  );
};

const ProfileScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { accessToken } = useAuth();
  const { user, reload, loadingUser, updateUser, logout } = useUser() as any;
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const pickAndUploadProfilePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permissions Required", "Photo library access is required to update your profile photo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images" as any],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
        base64: true,
        selectionLimit: 1,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setUploadingPhoto(true);
      setUploadProgress(0.08);

      const localAsset = result.assets[0];
      const localUri = localAsset?.uri;
      if (!localUri) {
        showToast({ title: "Unable to read selected image." });
        setUploadingPhoto(false);
        setUploadProgress(0);
        return;
      }

      setAvatar(localUri);

      let imageDataUri = localAsset?.base64
        ? `data:${localAsset.mimeType || "image/jpeg"};base64,${localAsset.base64}`
        : "";

      if (!imageDataUri) {
        try {
          const base64Image = await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageDataUri = `data:${localAsset.mimeType || "image/jpeg"};base64,${base64Image}`;
        } catch {}
      }

      setUploadProgress(0.24);

      let token = accessToken;
      if (!token) {
        const stored = await SecureStore.getItemAsync("accessToken");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            token = parsed?.token || (typeof parsed === "string" ? parsed : null);
          } catch {
            token = stored;
          }
        }
      }
      if (!token) {
        const asyncStored = await AsyncStorage.getItem("accessToken");
        if (asyncStored) {
          try {
            const parsed = JSON.parse(asyncStored);
            token = parsed?.token || (typeof parsed === "string" ? parsed : null);
          } catch {
            token = asyncStored;
          }
        }
      }

      const uploadHeaders: Record<string, string> = {};
      if (token) uploadHeaders["Authorization"] = `Bearer ${token.trim()}`;
      if (user?.email) uploadHeaders["x-user-email"] = user.email;

      let remoteUrl: string | null = null;
      const baseApiUrl = (api.defaults.baseURL || "https://redapt-admin-sand.vercel.app/api/user").replace(/\/+$/, "");
      let currentProgress = 0.24;
      const progressTimer = setInterval(() => {
        if (currentProgress < 0.88) {
          currentProgress += Math.max(0.02, (0.88 - currentProgress) * 0.16);
          setUploadProgress(Number(currentProgress.toFixed(2)));
        }
      }, 80);

      try {
        if (typeof (FileSystem as any).createUploadTask === "function") {
          const uploadTask = (FileSystem as any).createUploadTask(
            `${baseApiUrl}/update/profile`,
            localUri,
            {
              httpMethod: "POST",
              uploadType: FileSystem.FileSystemUploadType.MULTIPART,
              fieldName: "file",
              headers: uploadHeaders,
            },
            (data: any) => {
              if (data.totalBytesExpectedToSend > 0) {
                const ratio = data.totalBytesSent / data.totalBytesExpectedToSend;
                const mapped = 0.25 + ratio * 0.63;
                if (mapped > currentProgress) {
                  currentProgress = mapped;
                  setUploadProgress(Number(currentProgress.toFixed(2)));
                }
              }
            }
          );
          const uploadRes = await uploadTask.uploadAsync();
          if (uploadRes && uploadRes.status === 200 && uploadRes.body) {
            const parsed = JSON.parse(uploadRes.body);
            remoteUrl = parsed?.url || parsed?.user?.image || null;
          }
        } else {
          const uploadRes = await FileSystem.uploadAsync(
            `${baseApiUrl}/update/profile`,
            localUri,
            {
              httpMethod: "POST",
              uploadType: FileSystem.FileSystemUploadType.MULTIPART,
              fieldName: "file",
              headers: uploadHeaders,
            }
          );
          if (uploadRes.status === 200 && uploadRes.body) {
            const parsed = JSON.parse(uploadRes.body);
            remoteUrl = parsed?.url || parsed?.user?.image || null;
          }
        }
      } catch (e) {
        console.warn("Multipart upload attempt failed:", e);
      }

      if (!remoteUrl && imageDataUri) {
        try {
          const directRes = await api.post(
            "/update/profile-direct",
            { image: imageDataUri },
            {
              headers: { ...uploadHeaders, "Content-Type": "application/json" },
              timeout: 25000,
              onUploadProgress: (progressEvent: any) => {
                if (progressEvent.total) {
                  const ratio = progressEvent.loaded / progressEvent.total;
                  const mapped = 0.25 + ratio * 0.63;
                  if (mapped > currentProgress) {
                    currentProgress = mapped;
                    setUploadProgress(Number(currentProgress.toFixed(2)));
                  }
                }
              },
            }
          );
          if (directRes.status === 200) {
            remoteUrl = directRes.data?.url || directRes.data?.user?.image || null;
          }
        } catch (e) {
          console.warn("Direct upload endpoint attempt failed:", e);
        }
      }

      clearInterval(progressTimer);

      const finalImageUrl = remoteUrl || localUri;
      setAvatar(finalImageUrl);
      updateUser({ image: finalImageUrl } as any);
      reload().catch(() => {});

      setUploadProgress(1);
      await new Promise((r) => setTimeout(r, 320));

      Vibration.vibrate(40);
      showToast({ title: remoteUrl ? "Profile photo updated!" : "Profile photo saved!" });
    } catch (err: any) {
      console.error("Profile upload error:", err);
      showToast({ title: err?.message || "Upload failed. Please try again." });
    } finally {
      setUploadingPhoto(false);
      setUploadProgress(0);
    }
  };

  const [seriesData, setSeriesData] = useState<ISeries | null>(null);
  const [completeChapters, setCompleteChapters] = useState(0);
  const { streak } = useStreak();
  const [avatar, setAvatar] = useState(user?.image ?? "");
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const previewScale = useRef(new Animated.Value(0.35)).current;
  const previewOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user?.image) {
      setAvatar(user.image);
    }
  }, [user?.image]);

  const openAvatarPreview = () => {
    Vibration.vibrate(25);
    setAvatarPreviewVisible(true);
    previewScale.setValue(0.35);
    previewOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(previewScale, { toValue: 1, friction: 6.5, tension: 115, useNativeDriver: true }),
      Animated.timing(previewOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const closeAvatarPreview = () => {
    Animated.parallel([
      Animated.timing(previewScale, { toValue: 0.35, duration: 180, useNativeDriver: true }),
      Animated.timing(previewOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setAvatarPreviewVisible(false));
  };

  const [showStreakInfo, setShowStreakInfo] = useState(false);
  const [showLevelInfo, setShowLevelInfo] = useState(false);
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();

  useEffect(() => {
    if (!user || !accessToken) return;
    const getSeries = async () => {
      const rawId = user?.joinedSeries;
      const seriesId = typeof rawId === "string" ? rawId : rawId && typeof rawId === "object" ? (rawId as any)?._id || (rawId as any)?.id : null;
      if (!seriesId || typeof seriesId !== "string" || seriesId.trim() === "" || seriesId === "[object Object]") return;

      try {
        const cached = await AsyncStorage.getItem(`cached_series_${seriesId}`);
        if (cached) setSeriesData(JSON.parse(cached));
      } catch {}

      if (!isConnected) return;
      try {
        const data = await api.get(`/series/${seriesId}`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 });
        if (data?.data?.data) {
          setSeriesData(data.data.data);
          AsyncStorage.setItem(`cached_series_${seriesId}`, JSON.stringify(data.data.data)).catch(() => {});
        }
      } catch (error: any) {
        console.warn("Notice: series fetch in profile:", error?.message);
      }
    };
    getSeries();
  }, [user?.joinedSeries, accessToken, isConnected]);

  useEffect(() => {
    if (!seriesData?.cover || !user?.email) return;
    const getJoinedSeriesData = async () => {
      const recentReads = await getRecentReads(user?._id || user?.userId);
      if (!recentReads || recentReads.length === 0) {
        setCompleteChapters(0);
        return;
      }
      const json: IChapter[] = recentReads.map((r: any) => r.content);
      const ChapterIdsInSeries = seriesData?.chapters?.map((item: any) => item.content._id) || [];
      const readChaptersInSeries = json.filter((ch) => ChapterIdsInSeries.includes(ch._id));
      setCompleteChapters(readChaptersInSeries.length);
    };
    getJoinedSeriesData();
  }, [seriesData?.chapters, user, loadingUser, isConnected]);

  const progressPercent = ((completeChapters / (seriesData?.chapters || [])?.filter((item) => item.contentModel === "Chapter").length) * 100).toFixed(0);
  const levelName = user?.profileLevel ? getLevelTitle(user?.profileLevel) : "Novice";
  const levelColor = LEVEL_COLORS[levelName] || LEVEL_COLORS.Novice;

  const handleLogout = async () => {
    try {
      if (logout) await logout();
      else {
        await SecureStore.deleteItemAsync("accessToken").catch(() => {});
        await AsyncStorage.removeItem("accessToken").catch(() => {});
      }
    } catch {}
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const handleScheduleDeletion = async () => {
    if (!isConnected) { showToast({ title: "Please connect to the Internet." }); return; }
    setDeletingAccount(true);
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const res = await api.post("/deletion/request", { email: user?.email }, { headers });
      if (res.data?.success) {
        const { deletionToken, scheduledAt, email } = res.data;
        if (deletionToken) {
          await AsyncStorage.setItem("pending_deletion_info", JSON.stringify({ token: deletionToken, scheduledAt, email }));
        }
        if (logout) await logout();
        else {
          await SecureStore.deleteItemAsync("accessToken").catch(() => {});
          await AsyncStorage.removeItem("accessToken").catch(() => {});
        }
        setShowDeleteSheet(false);
        showToast({ title: "Account deletion scheduled (48h grace period)" });
        const webUrl = getAccountDeletionUrl(deletionToken, user?.email);
        Linking.openURL(webUrl).catch(() => {});
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      } else {
        showToast({ title: res.data?.message || "Failed to schedule deletion." });
      }
    } catch (err: any) {
      Alert.alert("Deletion Request Failed", err?.response?.data?.message || err?.message || "Error scheduling deletion.");
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header Bar with Settings Icon */}
      <View style={styles.topHeaderBar}>
        <Text style={styles.topHeaderTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.settingsIconBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate("Settings" as never)}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <Circle cx="12" cy="12" r="3" />
            <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </Svg>
        </TouchableOpacity>
      </View>

      <Modal visible={avatarPreviewVisible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={closeAvatarPreview}>
        <TouchableOpacity style={styles.avatarPreviewOverlay} activeOpacity={1} onPress={closeAvatarPreview}>
          <Animated.View style={[styles.avatarPreviewWrap, { transform: [{ scale: previewScale }], opacity: previewOpacity }]}>
            <CachedImage uri={avatar} label={user?.name} style={styles.avatarPreviewImage} letterSize={90} />
          </Animated.View>
          <Text style={styles.previewDismissHint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Profile Info */}
        <View style={styles.profileInfo}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { if (!uploadingPhoto) pickAndUploadProfilePhoto(); }} onLongPress={openAvatarPreview} delayLongPress={350}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatarPlaceholder}>
                <CachedImage uri={avatar} label={user?.name} style={styles.avatarImage} letterSize={38} transition={0} />
                {uploadingPhoto && <View style={styles.avatarUploadBackdrop}><CircularProgress progress={uploadProgress} /></View>}
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.infoDetails}>
            <View style={styles.nameHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{user?.name || "Readapt User"}</Text>
                <Text style={styles.userHandle}>@{user?.userId || "readapt_user"}</Text>
              </View>
              <TouchableOpacity
                style={styles.settingsPillBtn}
                activeOpacity={0.7}
                onPress={() => navigation.navigate("Settings" as never)}
              >
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={pallete.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="12" cy="12" r="3" />
                  <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </Svg>
                <Text style={styles.settingsPillText}>Settings</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.badgesRow}>
              <Pressable onPress={() => setShowLevelInfo(true)}>
                <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
                  <Text style={styles.levelBadgeText}>{levelName}</Text>
                </View>
              </Pressable>
              {user?.profession ? (
                <View style={styles.professionBadge}>
                  <Text style={styles.professionBadgeText}>{user.profession}</Text>
                </View>
              ) : null}
              {user?.visibility ? (
                <View style={styles.visibilityBadge}>
                  <Text style={styles.visibilityBadgeText}>
                    {user.visibility === "Private" ? "🔒 Private" : "🌐 Public"}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Bio & Interests Card */}
        {(Boolean(user?.bio) || (Array.isArray(user?.interests) && user.interests.length > 0)) && (
          <View style={styles.section}>
            <View style={styles.bioCard}>
              {user?.bio ? (
                <Text style={styles.bioText}>"{user.bio}"</Text>
              ) : null}

              {Array.isArray(user?.interests) && user.interests.length > 0 && (
                <View style={[styles.interestsSection, Boolean(user?.bio) && { marginTop: 12 }]}>
                  <Text style={styles.interestsHeader}>TOPICS OF INTEREST</Text>
                  <View style={styles.interestsWrap}>
                    {user.interests.map((topic: string) => (
                      <View key={topic} style={styles.interestChip}>
                        <Text style={styles.interestChipText}>{topic}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Progress Card */}
        {user?.joinedSeries && seriesData && completeChapters !== null && (
          <View style={styles.section}>
            <PopButton onPress={() => navigation.navigate("SeriesOverview", { seriesId: user?.joinedSeries || "" })}>
              <View style={styles.progressCard}>
                <View style={styles.progressContent}>
                  <Text style={styles.progressTitle}>{seriesData.title}</Text>
                  <Text style={styles.progressMeta}>Chapter {completeChapters} • <Text style={styles.accentText}>{progressPercent}% Complete</Text></Text>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: (width / 100) * Number(progressPercent) }]} /></View>
                </View>
                <Svg width={20} height={20} viewBox="0 0 16 16" fill="none"><Path fillRule="evenodd" clipRule="evenodd" d="M10.853333333333333 7.6466666666666665a0.5 0.5 0 0 1 0 0.7066666666666667l-5 5a0.5 0.5 0 0 1 -0.7066666666666667 -0.7066666666666667L9.793333333333333 8 5.1466666666666665 3.3533333333333335a0.5 0.5 0 0 1 0.7066666666666667 -0.7066666666666667l5 5Z" fill={pallete.textwhite} /></Svg>
              </View>
            </PopButton>
          </View>
        )}

        {/* Streak Card */}
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.streakCard, pressed && { transform: [{ scale: 0.99 }] }]}
            onPress={() => (navigation as any).navigate('DailyRewards')}
            onLongPress={() => setShowStreakInfo(true)}
            delayLongPress={400}
          >
            <View style={styles.streakVisual}>
              <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
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
            
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={pallete.textgray} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 18l6-6-6-6" />
            </Svg>
          </Pressable>
        </View>

        {/* Outside Log Out Button */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutDirectBtn}
            activeOpacity={0.8}
            onPress={() => setShowLogoutSheet(true)}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4" />
              <Polyline points="16 17 21 12 16 7" />
              <Line x1="21" y1="12" x2="9" y2="12" />
            </Svg>
            <Text style={styles.logoutDirectBtnText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>© 2026 Readapt · Version 1.0.2</Text>
      </ScrollView>

      {/* Info Panels */}
      <UpgradeSheet visible={showStreakInfo} onClose={() => setShowStreakInfo(false)} title="How Streak Works?">
        <View style={styles.infoSheetBody}>
          <Text style={styles.panelDescription}>
            <Text style={{ fontWeight: "700" }}>Read or listen</Text> to a chapter <Text style={{ fontWeight: "700" }}>every day</Text> and keep your <Text style={{ fontWeight: "700" }}>streak</Text> going! Keep learning for <Text style={{ fontWeight: "700" }}>7, 14, and 21 days</Text> in a row and <Text style={{ fontStyle: "italic" }}>unlock exciting rewards</Text> and surprises at every milestone.
            {"\n\n"}<Text style={{ color: "#f59e0b", fontWeight: "700" }}>Are you ready?</Text>
          </Text>
        </View>
      </UpgradeSheet>

      <UpgradeSheet visible={showLevelInfo} onClose={() => setShowLevelInfo(false)} title="How Levels Works?">
        <View style={styles.infoSheetBody}>
          <Text style={styles.panelDescription}>
            Can you <Text style={{ fontWeight: "700" }}>reach the top</Text>? Your intelligence is your greatest weapon.
            {"\n\n"}<Text style={{ color: "#f59e0b", fontWeight: "700" }}>• The Rule of Three:</Text> Answer <Text style={{ fontStyle: "italic" }}>3 questions correctly in a row</Text> to <Text style={{ fontWeight: "700" }}>Level Up</Text>.
            {"\n\n"}<Text style={{ color: "#f59e0b", fontWeight: "700" }}>• High Stakes:</Text> A <Text style={{ fontStyle: "italic" }}>single incorrect answer</Text> triggers an <Text style={{ fontWeight: "700" }}>immediate Level Down</Text>.
          </Text>
        </View>
      </UpgradeSheet>

      <UpgradeSheet visible={showLogoutSheet} onClose={() => setShowLogoutSheet(false)} title="Are you sure want to LogOut">
        <View style={styles.logoutSheetBody}>
          <View style={styles.logoutActions}>
            <TouchableOpacity style={[styles.logoutBtn, styles.logoutDismissBtn]} activeOpacity={0.8} onPress={() => setShowLogoutSheet(false)}><Text style={styles.logoutBtnText}>Dismiss</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.logoutBtn, styles.logoutConfirmBtn]} activeOpacity={0.8} onPress={() => { setShowLogoutSheet(false); handleLogout(); }}><Text style={styles.logoutBtnText}>Log Out</Text></TouchableOpacity>
          </View>
        </View>
      </UpgradeSheet>

      <UpgradeSheet visible={showDeleteSheet} onClose={() => !deletingAccount && setShowDeleteSheet(false)} title="Delete Your Account?">
        <View style={styles.logoutSheetBody}>
          <Text style={styles.panelDescription}>
            Your account will enter a <Text style={{ color: "#f59e0b", fontWeight: "700" }}>48-hour grace period</Text>.
            {"\n\n"}• Streaks, progress, bookmarks, and downloads will be <Text style={{ color: "#ef4444", fontWeight: "700" }}>permanently deleted</Text>.
            {"\n"}• Chapter comments will remain <Text style={{ color: "#00D2B4", fontWeight: "700" }}>anonymized</Text> to keep discussions intact.
            {"\n"}• You can cancel anytime within 48 hours simply by logging back in or using the web portal.
          </Text>
          <View style={styles.logoutActions}>
            <TouchableOpacity style={[styles.logoutBtn, styles.logoutDismissBtn]} activeOpacity={0.8} disabled={deletingAccount} onPress={() => setShowDeleteSheet(false)}><Text style={styles.logoutBtnText}>Keep Account</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.logoutBtn, styles.logoutConfirmBtn]} activeOpacity={0.8} disabled={deletingAccount} onPress={handleScheduleDeletion}>{deletingAccount ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.logoutBtnText}>Schedule Deletion</Text>}</TouchableOpacity>
          </View>
        </View>
      </UpgradeSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505", paddingTop: Platform.OS === "android" ? 45 : 55 },
  scrollContent: { paddingBottom: 40 },
  section: { marginBottom: 24, paddingHorizontal: 20 },

  // Top Header Bar with Settings
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topHeaderTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  settingsIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  profileInfo: { flexDirection: "row", alignItems: "center", marginTop: 10, marginBottom: 24, paddingHorizontal: 20 },
  avatarContainer: { width: 86, height: 86, alignItems: "center", justifyContent: "center", position: "relative" },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, overflow: "hidden", backgroundColor: pallete.bgcard, borderWidth: 3, borderColor: pallete.accent, shadowColor: pallete.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 15, elevation: 8, position: "relative" },
  avatarImage: { width: "100%", height: "100%", resizeMode: "cover" },
  avatarUploadBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.65)", alignItems: "center", justifyContent: "center" },
  circularProgressContainer: { width: 44, height: 44, alignItems: "center", justifyContent: "center", position: "relative" },
  circularProgressCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  circularProgressText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF", letterSpacing: -0.3, textAlign: "center" },
  
  avatarPreviewOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.88)", alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  avatarPreviewWrap: { width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: PREVIEW_SIZE / 2, borderWidth: 4, borderColor: pallete.accent, backgroundColor: "#0d0d12", alignItems: "center", justifyContent: "center", overflow: "hidden", shadowColor: pallete.accent, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.55, shadowRadius: 28, elevation: 25 },
  avatarPreviewImage: { width: "100%", height: "100%", borderRadius: PREVIEW_SIZE / 2 },
  previewDismissHint: { color: "rgba(255, 255, 255, 0.55)", fontSize: 13, fontWeight: "500", letterSpacing: 0.3, marginTop: 24 },
  
  infoDetails: { marginLeft: 16, flex: 1 },
  nameHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 },
  userName: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 2 },
  userHandle: { fontSize: 13, color: pallete.textgray, fontWeight: "500" },
  settingsPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  settingsPillText: {
    color: pallete.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  levelBadgeText: { color: "#050505", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  professionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: "rgba(56, 189, 248, 0.15)", borderWidth: 1, borderColor: "rgba(56, 189, 248, 0.3)" },
  professionBadgeText: { color: "#38bdf8", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  visibilityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: "rgba(255, 255, 255, 0.08)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.12)" },
  visibilityBadgeText: { color: "#cbd5e1", fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },

  bioCard: { backgroundColor: pallete.bgcard, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 14, padding: 16 },
  bioText: { color: "#e2e8f0", fontSize: 14, fontStyle: "italic", lineHeight: 21 },
  interestsSection: { marginTop: 12 },
  interestsHeader: { color: pallete.textgray, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 },
  interestsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  interestChip: { backgroundColor: "rgba(56, 189, 248, 0.1)", borderWidth: 1, borderColor: "rgba(56, 189, 248, 0.25)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  interestChipText: { color: "#38bdf8", fontSize: 12, fontWeight: "600" },

  progressCard: { backgroundColor: pallete.bgcard, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressContent: { flex: 1, marginRight: 16 },
  progressTitle: { fontSize: 16, fontWeight: "600", color: "#fff", marginBottom: 6 },
  progressMeta: { fontSize: 12, color: pallete.textgray, marginBottom: 10 },
  accentText: { color: pallete.accent, fontWeight: "700" },
  progressTrack: { width: "100%", height: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 10, backgroundColor: pallete.accent },

  streakCard: { backgroundColor: "rgba(245, 158, 11, 0.1)", borderWidth: 1, borderColor: "rgba(245, 158, 11, 0.3)", borderRadius: 16, padding: 20, flexDirection: "row", alignItems: "center" },
  streakVisual: { marginRight: 15 },
  streakDetails: { flex: 1 },
  streakLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: "#f59e0b", marginBottom: 4 },
  streakDayNumber: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  num: { fontSize: 44, fontWeight: "800", color: "#fff" },
  day: { fontSize: 22, color: "#ccc", fontWeight: "600" },

  logoutDirectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  logoutDirectBtnText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
  },

  footer: { fontSize: 11, color: "#555", textAlign: "center", paddingVertical: 15, fontWeight: "500" },

  panelDescription: { fontSize: 14, lineHeight: 22, color: "#d1d5db", textAlign: "center" },
  infoSheetBody: { paddingHorizontal: 24 },
  logoutSheetBody: { paddingHorizontal: 24 },
  logoutActions: { flexDirection: "row", gap: 16, marginTop: 24, paddingHorizontal: 12 },
  logoutBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  logoutDismissBtn: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  logoutConfirmBtn: { backgroundColor: "#ef4444" },
  logoutBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" }
});

export default ProfileScreen;