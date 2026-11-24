import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Vibration,
  Platform,
  Linking,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle, Rect, Line, Polyline } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import CachedImage from "../../components/props/CachedImage";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { api, getAccountDeletionUrl } from "../../lib/api";
import { useNetworkStatus } from "../../hooks/useNetwork";
import UpgradeSheet from "../../components/props/UpgradeSheet";
import ProfileEditSheet from "../../components/props/ProfileEditSheet";
import { ProfessionIcon } from "../../components/props/ProfessionIcon";
import { createAvatarVariants, uploadAvatarVariants, validateImageAsset } from "../../lib/imageUpload";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import useAuth from "../../hooks/useAuth";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* --------------------------------------------------------------------------
 * READAPT Signature Teal & Deep Dark Palette
 * ----------------------------------------------------------------------- */
const THEME = {
  bgMain: "#070B0D",
  bgSurface: "#11171A",
  bgCard: "#131B1F",
  bgModal: "#0D1316",
  border: "rgba(255, 255, 255, 0.08)",
  borderTeal: "rgba(0, 210, 180, 0.28)",
  tealLight: "#5EEAD4",
  tealPrimary: "#00D2B4",
  tealMid: "#2DD4BF",
  tealDeep: "#01796F",
  tealSoftBg: "rgba(0, 210, 180, 0.11)",
  textPrimary: "#FFFFFF",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textOnTeal: "#041614",
  errorColor: "#EF4444",
  errorSoftBg: "rgba(239, 68, 68, 0.11)",
  amberAccent: "#FBBF24",
  amberSoftBg: "rgba(251, 191, 36, 0.12)",
  roseAccent: "#FB7185",
  roseSoftBg: "rgba(251, 113, 133, 0.12)",
};

type Visibility = "Public" | "Private";
const NAME_MAX_LENGTH = 40;
const RING_CIRCUMFERENCE = 289; // 2 * PI * 46

/* --------------------------------------------------------------------------
 * Material Professional Vector Icons
 * ----------------------------------------------------------------------- */
const MaterialIcons = {
  BackChevron: ({ size = 24, color = "#FFFFFF" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  ),
  EditPencil: ({ size = 15, color = THEME.textOnTeal }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <Path d="m15 5 4 4" />
    </Svg>
  ),
  PublicGlobe: ({ size = 22, color = THEME.tealPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="2" y1="12" x2="22" y2="12" />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  ),
  PrivateLock: ({ size = 22, color = THEME.tealPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  ),
  HistoryBook: ({ size = 20, color = THEME.tealPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </Svg>
  ),
  FavoriteHeart: ({ size = 20, color = THEME.roseAccent }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  ),
  InfoCircle: ({ size = 20, color = THEME.tealPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="16" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12.01" y2="8" />
    </Svg>
  ),
  HelpSupport: ({ size = 20, color = THEME.amberAccent }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <Line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
  ),
  LogoutExit: ({ size = 20, color = THEME.amberAccent }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  ),
  DeleteTrash: ({ size = 20, color = THEME.errorColor }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Line x1="10" y1="11" x2="10" y2="17" />
      <Line x1="14" y1="11" x2="14" y2="17" />
    </Svg>
  ),
  Camera: ({ size = 15, color = THEME.textOnTeal }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx="12" cy="13" r="4" />
    </Svg>
  ),
  ChevronRight: ({ size = 18, color = THEME.textMuted }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  ),
  CloseX: ({ size = 20, color = THEME.textSecondary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  ),
  Check: ({ size = 18, color = THEME.tealPrimary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  ),
  Mail: ({ size = 18, color = THEME.textOnTeal }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Svg>
  ),
};

/* --------------------------------------------------------------------------
 * Main Settings Screen Component
 * ----------------------------------------------------------------------- */
const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, updateUser, reload, logout } = useUser() as any;
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();

  // --- Edit Profile State ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // --- Visibility State ---
  const [visibility, setVisibility] = useState<Visibility>(
    (user?.visibility as Visibility) || "Public"
  );
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);

  // --- Delete Account State ---
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // --- Help Center State ---
  const [showHelpSheet, setShowHelpSheet] = useState(false);

  useEffect(() => {
    if (user?.visibility) {
      setVisibility(user.visibility as Visibility);
    }
  }, [user?.visibility]);

  // --- Photo Upload Handling ---
  const handlePickPhoto = async () => {
    if (isUploadingPhoto) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Photo library access is required to update your photo."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images" as any],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        exif: false,
        selectionLimit: 1,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      await validateImageAsset(asset);

      setIsUploadingPhoto(true);

      const { variants, previewUri, base64Fallback } = await createAvatarVariants(asset);
      if (updateUser) updateUser({ image: previewUri } as any);

      const uploaded = await uploadAvatarVariants(variants, {
        base64Fallback,
        timeoutMs: 30000,
      });

      if (uploaded.user && updateUser) {
        updateUser(uploaded.user);
      } else if (uploaded.urls && updateUser) {
        updateUser(uploaded.urls as any);
      }
      showToast({ title: "Profile photo updated" });
      if (reload) reload().catch(() => {});
    } catch (err: any) {
      showToast({ title: err?.message || "Failed to upload photo" });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // --- Change Visibility ---
  const handleSelectVisibility = async (newVis: Visibility) => {
    if (newVis === visibility || isUpdatingVisibility) return;
    setIsUpdatingVisibility(true);
    setVisibility(newVis);
    try {
      Vibration.vibrate(20);
    } catch {}

    try {
      if (updateUser) updateUser({ visibility: newVis } as any);
      const res = await api.post("/update/visibility", { visibility: newVis });
      if (res.data?.success) {
        showToast({ title: `Profile set to ${newVis}` });
      }
      if (reload) reload().catch(() => {});
    } catch (err: any) {
      console.warn("Visibility update error:", err?.message);
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  // --- Schedule Deletion ---
  const handleScheduleDeletion = async () => {
    if (!isConnected) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }
    setDeletingAccount(true);
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const res = await api.post("/deletion/request", { email: user?.email }, { headers });
      if (res.data?.success) {
        const { deletionToken, scheduledAt, email } = res.data;
        if (deletionToken) {
          await AsyncStorage.setItem(
            "pending_deletion_info",
            JSON.stringify({ token: deletionToken, scheduledAt, email })
          );
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
      Alert.alert(
        "Deletion Request Failed",
        err?.response?.data?.message || err?.message || "Error scheduling deletion."
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const SettingRow = ({
    icon,
    iconBg = THEME.tealSoftBg,
    label,
    value,
    onPress,
    isDanger = false,
    isLast = false,
  }: {
    icon: React.ReactNode;
    iconBg?: string;
    label: string;
    value?: string;
    onPress?: () => void;
    isDanger?: boolean;
    isLast?: boolean;
  }) => (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.settingRow, isLast && styles.settingRowLast]}
    >
      <View style={styles.settingRowLeft}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: isDanger ? THEME.errorSoftBg : iconBg },
          ]}
        >
          {icon}
        </View>
        <Text
          style={[
            styles.settingLabel,
            isDanger && { color: THEME.errorColor },
          ]}
        >
          {label}
        </Text>
      </View>
      <View style={styles.settingRowRight}>
        {value ? <Text style={styles.settingValue}>{value}</Text> : null}
        <MaterialIcons.ChevronRight
          size={18}
          color={isDanger ? "rgba(239, 68, 68, 0.7)" : THEME.textMuted}
        />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Ambient Top Teal Glow */}
      <LinearGradient
        colors={["rgba(0, 210, 180, 0.14)", "rgba(7, 11, 13, 0)"]}
        locations={[0, 0.4]}
        style={styles.ambientTopGlow}
        pointerEvents="none"
      />

      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons.BackChevron size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 28, 40) },
        ]}
      >
        {/* Profile Card Summary & Edit Pill CTA */}
        <View style={styles.profileSummaryCard}>
          <CachedImage
            uri={user?.image}
            label={user?.name}
            style={styles.summaryAvatar}
            letterSize={24}
            transition={0}
          />
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryName} numberOfLines={1}>
              {user?.name || "Readapt Reader"}
            </Text>
            <Text style={styles.summaryHandle} numberOfLines={1}>
              @{user?.userId || "reader"}
            </Text>
            {user?.profession ? (
              <View style={styles.professionPill}>
                <ProfessionIcon
                  type={user.profession}
                  color={THEME.tealPrimary}
                  size={12}
                />
                <Text style={styles.professionPillText} numberOfLines={1}>
                  {user.profession}
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.editProfileBtn}
            activeOpacity={0.85}
            onPress={() => setShowEditModal(true)}
          >
            <LinearGradient
              colors={[THEME.tealLight, THEME.tealPrimary, THEME.tealDeep]}
              start={{ x: 0.08, y: 0 }}
              end={{ x: 0.92, y: 1 }}
              style={styles.editProfileBtnGradient}
            >
              <MaterialIcons.EditPencil size={14} color={THEME.textOnTeal} />
              <Text style={styles.editProfileBtnText}>Edit</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Profile Visibility Options */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PROFILE VISIBILITY</Text>

          <TouchableOpacity
            style={[
              styles.visibilityCard,
              visibility === "Public" && styles.visibilityCardActive,
            ]}
            activeOpacity={0.78}
            onPress={() => handleSelectVisibility("Public")}
          >
            <View
              style={[
                styles.visIconBadge,
                visibility === "Public" && styles.visIconBadgeActive,
              ]}
            >
              <MaterialIcons.PublicGlobe
                size={21}
                color={
                  visibility === "Public"
                    ? THEME.tealPrimary
                    : THEME.textSecondary
                }
              />
            </View>
            <View style={styles.visTextWrap}>
              <Text style={styles.visTitle}>Public Profile</Text>
              <Text style={styles.visDesc}>
                Visible to the community. Others can view your profile and stats.
              </Text>
            </View>
            <View
              style={[
                styles.radioBtn,
                visibility === "Public" && styles.radioBtnActive,
              ]}
            >
              {visibility === "Public" && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.visibilityCard,
              visibility === "Private" && styles.visibilityCardActive,
            ]}
            activeOpacity={0.78}
            onPress={() => handleSelectVisibility("Private")}
          >
            <View
              style={[
                styles.visIconBadge,
                visibility === "Private" && styles.visIconBadgeActive,
              ]}
            >
              <MaterialIcons.PrivateLock
                size={21}
                color={
                  visibility === "Private"
                    ? THEME.tealPrimary
                    : THEME.textSecondary
                }
              />
            </View>
            <View style={styles.visTextWrap}>
              <Text style={styles.visTitle}>Private Profile</Text>
              <Text style={styles.visDesc}>
                Only you can view your personal profile and reading records.
              </Text>
            </View>
            <View
              style={[
                styles.radioBtn,
                visibility === "Private" && styles.radioBtnActive,
              ]}
            >
              {visibility === "Private" && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>
        </View>

        {/* Content & History Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>CONTENT &amp; HISTORY</Text>
          <View style={styles.cardGroup}>
            <SettingRow
              icon={<MaterialIcons.HistoryBook size={19} color={THEME.tealPrimary} />}
              iconBg={THEME.tealSoftBg}
              label="Recent Reads"
              onPress={() => navigation.navigate("RecentReads")}
            />
            <SettingRow
              icon={<MaterialIcons.FavoriteHeart size={19} color={THEME.roseAccent} />}
              iconBg={THEME.roseSoftBg}
              label="Liked Content"
              isLast
              onPress={() => navigation.navigate("LikedContent")}
            />
          </View>
        </View>

        {/* Support & About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SUPPORT &amp; ABOUT</Text>
          <View style={styles.cardGroup}>
            <SettingRow
              icon={<MaterialIcons.InfoCircle size={19} color={THEME.tealPrimary} />}
              iconBg={THEME.tealSoftBg}
              label="About this App"
              onPress={() => navigation.navigate("About")}
            />
            <SettingRow
              icon={<MaterialIcons.HelpSupport size={19} color={THEME.amberAccent} />}
              iconBg={THEME.amberSoftBg}
              label="Help Center"
              isLast
              onPress={() => setShowHelpSheet(true)}
            />
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCOUNT</Text>
          <View style={styles.cardGroup}>
            <SettingRow
              icon={<MaterialIcons.LogoutExit size={19} color={THEME.amberAccent} />}
              iconBg={THEME.amberSoftBg}
              label="Log Out"
              onPress={() => {
                Alert.alert(
                  "Log Out",
                  "Are you sure you want to log out of READAPT?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Log Out",
                      style: "destructive",
                      onPress: async () => {
                        if (logout) await logout();
                        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
                      },
                    },
                  ]
                );
              }}
            />
            <SettingRow
              icon={<MaterialIcons.DeleteTrash size={19} color={THEME.errorColor} />}
              label="Delete Account"
              isDanger
              isLast
              onPress={() => setShowDeleteSheet(true)}
            />
          </View>
        </View>

        <Text style={styles.appVersion}>READAPT · Version 1.0.2</Text>
      </ScrollView>

      {/* Edit Profile Full-Screen Sheet */}
      <ProfileEditSheet
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        onChangePhoto={handlePickPhoto}
        isUploadingPhoto={isUploadingPhoto}
      />

      {/* Help Center Sheet */}
      <UpgradeSheet
        visible={showHelpSheet}
        onClose={() => setShowHelpSheet(false)}
        title="Help & Support"
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetText}>
            Need assistance with your account, reading streaks, or audio playback?
            {"\n\n"}•{" "}
            <Text style={{ color: THEME.tealPrimary, fontWeight: "700" }}>
              Email Support:
            </Text>{" "}
            readaptsupport@gmail.com
            {"\n"}•{" "}
            <Text style={{ color: THEME.tealPrimary, fontWeight: "700" }}>
              Response Time:
            </Text>{" "}
            Within 24 hours
            {"\n"}•{" "}
            <Text style={{ color: THEME.tealPrimary, fontWeight: "700" }}>
              Account Issues:
            </Text>{" "}
            Include your username in your request.
          </Text>
          <TouchableOpacity
            style={styles.helpActionBtn}
            activeOpacity={0.86}
            onPress={() => {
              Linking.openURL("mailto:readaptsupport@gmail.com").catch(() => {});
            }}
          >
            <LinearGradient
              colors={[THEME.tealLight, THEME.tealPrimary, THEME.tealDeep]}
              start={{ x: 0.08, y: 0 }}
              end={{ x: 0.92, y: 1 }}
              style={styles.saveBtnGradient}
            >
              <MaterialIcons.Mail size={17} color={THEME.textOnTeal} />
              <Text style={styles.helpActionBtnText}>Contact Support</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </UpgradeSheet>

      {/* Delete Account Confirmation Sheet */}
      <UpgradeSheet
        visible={showDeleteSheet}
        onClose={() => !deletingAccount && setShowDeleteSheet(false)}
        title="Delete Your Account?"
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetText}>
            Your account will enter a{" "}
            <Text style={{ color: THEME.amberAccent, fontWeight: "700" }}>
              48-hour grace period
            </Text>
            .{"\n\n"}• Streaks, progress, bookmarks, and downloads will be{" "}
            <Text style={{ color: THEME.errorColor, fontWeight: "700" }}>
              permanently deleted
            </Text>
            .{"\n"}• Chapter comments will remain{" "}
            <Text style={{ color: THEME.tealPrimary, fontWeight: "700" }}>
              anonymized
            </Text>
            .{"\n"}• You can cancel anytime within 48 hours simply by logging back in.
          </Text>
          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetDismissBtn]}
              activeOpacity={0.8}
              disabled={deletingAccount}
              onPress={() => setShowDeleteSheet(false)}
            >
              <Text style={styles.sheetDismissText}>Keep Account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetConfirmBtn]}
              activeOpacity={0.85}
              disabled={deletingAccount}
              onPress={handleScheduleDeletion}
            >
              {deletingAccount ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.sheetConfirmText}>Schedule Deletion</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </UpgradeSheet>
    </View>
  );
};

/* --------------------------------------------------------------------------
 * Styles (Consistent with READAPT Design System)
 * ----------------------------------------------------------------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bgMain,
  },
  ambientTopGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  headerTitle: {
    fontSize: 18.5,
    fontWeight: "800",
    color: THEME.textPrimary,
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 10,
  },

  /* Profile Summary Card */
  profileSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.borderTeal,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  summaryAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: THEME.tealPrimary,
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  summaryName: {
    color: THEME.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 2,
  },
  summaryHandle: {
    color: THEME.tealPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  professionPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(0, 210, 180, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(0, 210, 180, 0.28)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
    gap: 5,
  },
  professionPillText: {
    color: THEME.tealPrimary,
    fontSize: 11.5,
    fontWeight: "700",
  },
  editProfileBtn: {
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    shadowColor: THEME.tealPrimary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  editProfileBtnGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    gap: 6,
  },
  editProfileBtnText: {
    color: THEME.textOnTeal,
    fontSize: 13.5,
    fontWeight: "800",
  },

  /* Sections & Card Groups */
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    fontSize: 11.5,
    fontWeight: "800",
    color: THEME.textSecondary,
    letterSpacing: 0.9,
    marginBottom: 10,
    marginLeft: 4,
  },
  cardGroup: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 20,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  settingRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingValue: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontWeight: "500",
  },

  /* Visibility Cards */
  visibilityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 11,
  },
  visibilityCardActive: {
    borderColor: THEME.tealPrimary,
    backgroundColor: "rgba(0, 210, 180, 0.09)",
  },
  visIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  visIconBadgeActive: {
    backgroundColor: THEME.tealSoftBg,
  },
  visTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },
  visTitle: {
    color: THEME.textPrimary,
    fontSize: 15.5,
    fontWeight: "700",
    marginBottom: 3,
  },
  visDesc: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    lineHeight: 17.5,
  },
  radioBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioBtnActive: {
    borderColor: THEME.tealPrimary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.tealPrimary,
  },
  appVersion: {
    fontSize: 12,
    color: THEME.textMuted,
    textAlign: "center",
    marginTop: 6,
    fontWeight: "500",
  },

  /* Edit Profile Bottom Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: THEME.bgModal,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.2,
    borderTopColor: THEME.borderTeal,
    paddingHorizontal: 22,
    paddingTop: 10,
    maxHeight: "90%",
  },
  modalHandleWrap: {
    alignItems: "center",
    paddingVertical: 6,
  },
  modalHandle: {
    width: 42,
    height: 4.5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
  },
  modalHeaderTitle: {
    color: THEME.textPrimary,
    fontSize: 18.5,
    fontWeight: "800",
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoPickerContainer: {
    alignItems: "center",
    marginBottom: 22,
  },
  photoPickerWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  editAvatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  staticPhotoRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2.5,
    borderColor: THEME.tealPrimary,
  },
  photoOverlayBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: THEME.tealPrimary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: THEME.bgModal,
  },
  spinnerRing: {
    position: "absolute",
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: "600",
    marginTop: 8,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: "800",
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.7,
  },
  nameInputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 18,
    paddingHorizontal: 18,
    height: 56,
  },
  nameTextInput: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 14,
  },
  inlineCharCounter: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 18,
    paddingHorizontal: 18,
    height: 56,
  },
  inputError: {
    borderColor: THEME.errorColor,
    backgroundColor: "rgba(239, 68, 68, 0.06)",
  },
  inputSuccess: {
    borderColor: THEME.tealPrimary,
    backgroundColor: "rgba(0, 210, 180, 0.06)",
  },
  fixedAt: {
    color: THEME.tealPrimary,
    fontSize: 16.5,
    fontWeight: "700",
    marginRight: 6,
  },
  inputFlex: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 14,
  },
  availIconWrap: {
    marginLeft: 8,
    width: 22,
    alignItems: "center",
  },
  feedbackText: {
    fontSize: 12.5,
    fontWeight: "600",
    marginTop: 7,
    paddingHorizontal: 6,
    color: THEME.textSecondary,
  },
  saveProfileBtn: {
    height: 54,
    borderRadius: 27,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 12,
    shadowColor: THEME.tealPrimary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  disabledBtnInner: {
    flex: 1,
    backgroundColor: "#141D21",
    alignItems: "center",
    justifyContent: "center",
  },
  saveProfileBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  saveProfileBtnText: {
    color: THEME.textOnTeal,
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  saveProfileBtnTextDisabled: {
    color: THEME.textMuted,
    fontSize: 16.5,
    fontWeight: "700",
  },

  /* UpgradeSheet Inner Bodies */
  sheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sheetText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#D1D5DB",
  },
  helpActionBtn: {
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    marginTop: 22,
  },
  helpActionBtnText: {
    color: THEME.textOnTeal,
    fontSize: 15.5,
    fontWeight: "800",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  sheetBtn: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDismissBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: THEME.border,
  },
  sheetConfirmBtn: {
    backgroundColor: THEME.errorColor,
  },
  sheetDismissText: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: "700",
  },
  sheetConfirmText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "700",
  },
});

export default SettingsScreen;