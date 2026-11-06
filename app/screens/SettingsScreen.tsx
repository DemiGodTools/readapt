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
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle, Line, Polyline } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import pallete from "../../lib/Colors";
import CachedImage from "../../components/props/CachedImage";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { api, getAccountDeletionUrl } from "../../lib/api";
import { useNetworkStatus } from "../../hooks/useNetwork";
import UpgradeSheet from "../../components/props/UpgradeSheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import useAuth from "../../hooks/useAuth";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const ACCENT = "#38bdf8";
const BG_MAIN = "#050505";
const BG_CARD = "#12192b";
const TEXT_PRIMARY = "#ffffff";
const TEXT_SECONDARY = "#94a3b8";
const BORDER = "#1e293b";
const ERROR_COLOR = "#ef4444";
const SUCCESS_COLOR = "#22c55e";

type Visibility = "Public" | "Private";

const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, updateUser, reload, logout } = useUser() as any;
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();

  // --- Edit Profile State ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(user?.name || "");
  const [editUsername, setEditUsername] = useState(user?.userId || "");
  const [editPhoto, setEditPhoto] = useState<string | null>(user?.image || null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(true);
  const [usernameFeedback, setUsernameFeedback] = useState<string>("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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

  // Debounce & photo spinner animation
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user?.visibility) {
      setVisibility(user.visibility as Visibility);
    }
  }, [user?.visibility]);

  useEffect(() => {
    if (showEditModal) {
      setEditName(user?.name || "");
      setEditUsername(user?.userId || "");
      setEditPhoto(user?.image || null);
      setIsUsernameAvailable(true);
      setUsernameFeedback("");
    }
  }, [showEditModal, user]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // --- Photo Upload Handling ---
  const handlePickPhoto = async () => {
    if (isUploadingPhoto) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Photo library access is required to update your photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images" as any],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setEditPhoto(asset.uri);

      // Start upload spinner animation
      setIsUploadingPhoto(true);
      spinAnim.setValue(0);
      const loopAnim = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loopAnim.start();

      let imageDataUri = asset.base64
        ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
        : "";

      if (!imageDataUri && asset.uri) {
        try {
          const FileSystem = require("expo-file-system/legacy");
          const base64Image = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageDataUri = `data:${asset.mimeType || "image/jpeg"};base64,${base64Image}`;
        } catch {}
      }

      if (imageDataUri) {
        const res = await api.post("/update/profile-direct", { image: imageDataUri });
        if (res.data?.success && (res.data?.url || res.data?.user?.image)) {
          const finalUrl = res.data.url || res.data.user.image;
          setEditPhoto(finalUrl);
          if (updateUser) updateUser({ image: finalUrl } as any);
          if (reload) reload().catch(() => {});
          showToast({ title: "Photo updated!" });
        }
      }
      Vibration.vibrate(30);
      loopAnim.stop();
      spinAnim.setValue(0);
      setIsUploadingPhoto(false);
    } catch (err: any) {
      console.warn("Settings photo upload failed:", err?.message);
      setIsUploadingPhoto(false);
      spinAnim.setValue(0);
    }
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // --- Fast Debounced Username Availability Check ---
  const checkUsername = useCallback(
    (val: string) => {
      const trimmed = val.trim().toLowerCase();

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();

      if (!trimmed) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(null);
        setUsernameFeedback("");
        return;
      }

      if (trimmed.length < 3) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(false);
        setUsernameFeedback("Must be at least 3 characters");
        return;
      }

      if (trimmed.length > 20) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(false);
        setUsernameFeedback("Must not exceed 20 characters");
        return;
      }

      const validPattern = /^[a-zA-Z0-9_]+$/;
      if (!validPattern.test(trimmed)) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(false);
        setUsernameFeedback("Only letters, numbers, and underscores");
        return;
      }

      if (user?.userId && trimmed === user.userId.toLowerCase()) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(true);
        setUsernameFeedback("Current username");
        return;
      }

      setIsCheckingUsername(true);
      setIsUsernameAvailable(null);
      setUsernameFeedback("Checking availability...");

      debounceTimerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          const res = await api.get(`/check-username?username=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
          });

          if (res.data?.available) {
            setIsUsernameAvailable(true);
            setUsernameFeedback(res.data?.message || "Username is available!");
          } else {
            setIsUsernameAvailable(false);
            setUsernameFeedback(res.data?.message || "Username is already taken");
          }
        } catch (err: any) {
          if (err?.name === "CanceledError" || err?.message === "canceled") return;
          setIsUsernameAvailable(null);
          setUsernameFeedback("Could not verify username");
        } finally {
          setIsCheckingUsername(false);
        }
      }, 300);
    },
    [user?.userId]
  );

  const handleUsernameChange = (text: string) => {
    setEditUsername(text);
    checkUsername(text);
  };

  // --- Save Profile Changes (Photo, Name, Username) ---
  const handleSaveProfileChanges = async () => {
    if (!isConnected) {
      showToast({ title: "Please connect to the internet." });
      return;
    }
    const cleanName = editName.trim();
    const cleanUsername = editUsername.trim().toLowerCase();

    if (cleanName.length < 2) {
      showToast({ title: "Name must be at least 2 characters" });
      return;
    }
    if (cleanUsername.length < 3 || isUsernameAvailable === false) {
      showToast({ title: "Please choose a valid available username" });
      return;
    }

    setIsSavingProfile(true);
    try {
      // 1. Update username if changed
      if (cleanUsername !== (user?.userId || "").toLowerCase()) {
        await api.post("/update/username", { newUsername: cleanUsername });
      }

      // 2. Update name & profile in DB
      const res = await api.post("/update/profile-setup", {
        name: cleanName,
        username: cleanUsername,
        profession: user?.profession || "Other",
        bio: user?.bio || "",
        interests: user?.interests || [],
        visibility: user?.visibility || "Public",
        image: editPhoto || user?.image,
      });

      if (res.data?.success) {
        if (updateUser) {
          updateUser(res.data.user || {
            name: cleanName,
            userId: cleanUsername,
            image: editPhoto || user?.image,
          });
        }
        if (reload) reload().catch(() => {});
        showToast({ title: "Profile updated successfully!" });
        setShowEditModal(false);
      } else {
        showToast({ title: res.data?.message || "Could not update profile" });
      }
    } catch (err: any) {
      Alert.alert("Update Failed", err?.response?.data?.message || err?.message || "An error occurred.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // --- Change Visibility ---
  const handleSelectVisibility = async (newVis: Visibility) => {
    if (newVis === visibility || isUpdatingVisibility) return;
    setIsUpdatingVisibility(true);
    setVisibility(newVis);
    Vibration.vibrate(25);

    try {
      if (updateUser) updateUser({ visibility: newVis } as any);
      const res = await api.post("/update/visibility", { visibility: newVis });
      if (res.data?.success) {
        showToast({ title: `Profile visibility set to ${newVis}` });
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
    label,
    value,
    onPress,
    isDanger = false,
  }: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    onPress?: () => void;
    isDanger?: boolean;
  }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.settingRow}
    >
      <View style={styles.settingRowLeft}>
        <View style={[styles.iconWrap, isDanger && styles.iconWrapDanger]}>
          {icon}
        </View>
        <Text style={[styles.settingLabel, isDanger && { color: ERROR_COLOR }]}>
          {label}
        </Text>
      </View>
      <View style={styles.settingRowRight}>
        {value ? <Text style={styles.settingValue}>{value}</Text> : null}
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={TEXT_SECONDARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="9 18 15 12 9 6" />
        </Svg>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <Polyline points="15 18 9 12 15 6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Profile Card Summary & Edit Button */}
        <View style={styles.profileSummaryCard}>
          <CachedImage
            uri={user?.image}
            label={user?.name}
            style={styles.summaryAvatar}
            letterSize={26}
            transition={0}
          />
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryName}>{user?.name || "Readapt User"}</Text>
            <Text style={styles.summaryHandle}>@{user?.userId || "user"}</Text>
          </View>
          <TouchableOpacity
            style={styles.editProfileBtn}
            activeOpacity={0.8}
            onPress={() => setShowEditModal(true)}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 20h9" />
              <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </Svg>
            <Text style={styles.editProfileBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Visibility Options */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PROFILE VISIBILITY</Text>
          
          <TouchableOpacity
            style={[styles.visibilityCard, visibility === "Public" && styles.visibilityCardActive]}
            activeOpacity={0.7}
            onPress={() => handleSelectVisibility("Public")}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={visibility === "Public" ? ACCENT : TEXT_SECONDARY} strokeWidth="2">
              <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <Circle cx="12" cy="12" r="3" />
            </Svg>
            <View style={styles.visTextWrap}>
              <Text style={styles.visTitle}>Public Profile</Text>
              <Text style={styles.visDesc}>Visible to community. Anyone can view your profile & stats.</Text>
            </View>
            <View style={[styles.radioBtn, visibility === "Public" && styles.radioBtnActive]}>
              {visibility === "Public" && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.visibilityCard, visibility === "Private" && styles.visibilityCardActive]}
            activeOpacity={0.7}
            onPress={() => handleSelectVisibility("Private")}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={visibility === "Private" ? ACCENT : TEXT_SECONDARY} strokeWidth="2">
              <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <Line x1="1" y1="1" x2="23" y2="23" />
            </Svg>
            <View style={styles.visTextWrap}>
              <Text style={styles.visTitle}>Private Profile</Text>
              <Text style={styles.visDesc}>Only you can view your personal profile and learning records.</Text>
            </View>
            <View style={[styles.radioBtn, visibility === "Private" && styles.radioBtnActive]}>
              {visibility === "Private" && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>
        </View>

        {/* Content & History Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>CONTENT & HISTORY</Text>
          <View style={styles.cardGroup}>
            <SettingRow
              icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2"><Path d="M4 19C4 19 5.5 18 9 18C12.5 18 12 21 12 21C12 21 11.5 18 15 18C18.5 18 20 19 20 19V6C20 6 18.5 5 15 5C11.5 5 12 8 12 8C12 8 12.5 5 9 5C5.5 5 4 6 4 6V19Z" /></Svg>}
              label="Recent Reads"
              onPress={() => navigation.navigate("RecentReads")}
            />
            <SettingRow
              icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2"><Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></Svg>}
              label="Liked Content"
              onPress={() => navigation.navigate("LikedContent")}
            />
          </View>
        </View>

        {/* App & Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SUPPORT & ABOUT</Text>
          <View style={styles.cardGroup}>
            <SettingRow
              icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2"><Circle cx="12" cy="12" r="10" /><Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><Line x1="12" y1="17" x2="12.01" y2="17" /></Svg>}
              label="About this App"
              onPress={() => navigation.navigate("About")}
            />
            <SettingRow
              icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><Circle cx="12" cy="12" r="10" /><Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><Line x1="12" y1="17" x2="12.01" y2="17" /></Svg>}
              label="Help Center"
              onPress={() => setShowHelpSheet(true)}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: ERROR_COLOR }]}>ACCOUNT</Text>
          <View style={styles.cardGroup}>
            <SettingRow
              icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Polyline points="16 17 21 12 16 7" /><Line x1="21" y1="12" x2="9" y2="12" /></Svg>}
              label="Log Out"
              onPress={() => {
                Alert.alert(
                  "Log Out",
                  "Are you sure you want to log out of Readapt?",
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
              icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ERROR_COLOR} strokeWidth="2"><Path d="M3 6h18" /><Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><Line x1="10" y1="11" x2="10" y2="17" /><Line x1="14" y1="11" x2="14" y2="17" /></Svg>}
              label="Delete Account"
              isDanger
              onPress={() => setShowDeleteSheet(true)}
            />
          </View>
        </View>

        <Text style={styles.appVersion}>READAPT · Version 1.0.2</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.modalCloseBtn}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={TEXT_SECONDARY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <Line x1="18" y1="6" x2="6" y2="18" />
                  <Line x1="6" y1="6" x2="18" y2="18" />
                </Svg>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Photo Picker */}
              <View style={styles.photoPickerContainer}>
                <TouchableOpacity activeOpacity={0.8} onPress={handlePickPhoto} style={styles.photoPickerWrapper}>
                  <CachedImage uri={editPhoto} label={user?.name} style={styles.editAvatarImage} letterSize={34} transition={0} />
                  <View style={styles.photoOverlayBadge}>
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <Circle cx="12" cy="13" r="4" />
                    </Svg>
                  </View>
                  {isUploadingPhoto && (
                    <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}>
                      <Svg width={96} height={96} viewBox="0 0 96 96">
                        <Circle cx="48" cy="48" r="46" stroke={ACCENT} strokeWidth="3" strokeDasharray="60 180" strokeLinecap="round" fill="none" />
                      </Svg>
                    </Animated.View>
                  )}
                </TouchableOpacity>
                <Text style={styles.changePhotoText}>Tap photo to change</Text>
              </View>

              {/* Name Input */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Display Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter your name"
                  placeholderTextColor={TEXT_SECONDARY}
                  maxLength={50}
                />
              </View>

              {/* Username Input with Debounced Check */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Username</Text>
                <View style={[styles.inputRow, isUsernameAvailable === false && styles.inputError, isUsernameAvailable === true && styles.inputSuccess]}>
                  <Text style={styles.fixedAt}>@</Text>
                  <TextInput
                    style={styles.inputFlex}
                    value={editUsername}
                    onChangeText={handleUsernameChange}
                    placeholder="username"
                    placeholderTextColor={TEXT_SECONDARY}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={20}
                  />
                  <View style={styles.availIconWrap}>
                    {isCheckingUsername && <ActivityIndicator size="small" color={ACCENT} />}
                    {!isCheckingUsername && isUsernameAvailable === true && (
                      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={SUCCESS_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <Polyline points="20 6 9 17 4 12" />
                      </Svg>
                    )}
                    {!isCheckingUsername && isUsernameAvailable === false && (
                      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={ERROR_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <Line x1="18" y1="6" x2="6" y2="18" />
                        <Line x1="6" y1="6" x2="18" y2="18" />
                      </Svg>
                    )}
                  </View>
                </View>
                {usernameFeedback ? (
                  <Text style={[styles.feedbackText, isUsernameAvailable === true && { color: SUCCESS_COLOR }, isUsernameAvailable === false && { color: ERROR_COLOR }]}>
                    {usernameFeedback}
                  </Text>
                ) : null}
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveProfileBtn, (isSavingProfile || isUsernameAvailable === false) && styles.saveProfileBtnDisabled]}
                activeOpacity={0.8}
                disabled={isSavingProfile || isUsernameAvailable === false}
                onPress={handleSaveProfileChanges}
              >
                {isSavingProfile ? (
                  <ActivityIndicator color="#0f172a" size="small" />
                ) : (
                  <Text style={styles.saveProfileBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Help Center Sheet */}
      <UpgradeSheet visible={showHelpSheet} onClose={() => setShowHelpSheet(false)} title="Help & Support">
        <View style={styles.sheetBody}>
          <Text style={styles.sheetText}>
            Need assistance with your account, reading streaks, or audio playback?
            {"\n\n"}• <Text style={{ color: ACCENT, fontWeight: "700" }}>Email Support:</Text> support@readapt.app
            {"\n"}• <Text style={{ color: ACCENT, fontWeight: "700" }}>Response Time:</Text> Within 24 hours
            {"\n"}• <Text style={{ color: ACCENT, fontWeight: "700" }}>Account Issues:</Text> Include your username in your request.
          </Text>
          <TouchableOpacity style={styles.helpActionBtn} activeOpacity={0.8} onPress={() => { Linking.openURL("mailto:support@readapt.app").catch(() => {}); }}>
            <Text style={styles.helpActionBtnText}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      </UpgradeSheet>

      {/* Delete Account Confirmation Sheet */}
      <UpgradeSheet visible={showDeleteSheet} onClose={() => !deletingAccount && setShowDeleteSheet(false)} title="Delete Your Account?">
        <View style={styles.sheetBody}>
          <Text style={styles.sheetText}>
            Your account will enter a <Text style={{ color: "#f59e0b", fontWeight: "700" }}>48-hour grace period</Text>.
            {"\n\n"}• Streaks, progress, bookmarks, and downloads will be <Text style={{ color: ERROR_COLOR, fontWeight: "700" }}>permanently deleted</Text>.
            {"\n"}• Chapter comments will remain <Text style={{ color: "#00D2B4", fontWeight: "700" }}>anonymized</Text>.
            {"\n"}• You can cancel anytime within 48 hours simply by logging back in.
          </Text>
          <View style={styles.sheetActions}>
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetDismissBtn]} activeOpacity={0.8} disabled={deletingAccount} onPress={() => setShowDeleteSheet(false)}>
              <Text style={styles.sheetBtnText}>Keep Account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetConfirmBtn]} activeOpacity={0.8} disabled={deletingAccount} onPress={handleScheduleDeletion}>
              {deletingAccount ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sheetBtnText}>Schedule Deletion</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </UpgradeSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_MAIN,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
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
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  // -- Profile Summary Card --
  profileSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  summaryAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: ACCENT,
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 14,
  },
  summaryName: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  summaryHandle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: "500",
  },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  editProfileBtnText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  // -- Sections --
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT_SECONDARY,
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  cardGroup: {
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  settingRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },
  settingRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingValue: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: "500",
  },
  // -- Visibility Cards --
  visibilityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  visibilityCardActive: {
    borderColor: ACCENT,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
  },
  visTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },
  visTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  visDesc: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
  },
  radioBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  radioBtnActive: {
    borderColor: ACCENT,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  appVersion: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
    marginTop: 10,
    fontWeight: "500",
  },
  // -- Edit Profile Modal --
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0d1322",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  modalHeaderTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: "700",
  },
  modalCloseBtn: {
    padding: 4,
  },
  photoPickerContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  photoPickerWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    position: "relative",
  },
  editAvatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: ACCENT,
  },
  photoOverlayBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: ACCENT,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  spinnerRing: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 96,
    height: 96,
  },
  changePhotoText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: "500",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  inputError: {
    borderColor: ERROR_COLOR,
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  inputSuccess: {
    borderColor: SUCCESS_COLOR,
    backgroundColor: "rgba(34, 197, 94, 0.05)",
  },
  fixedAt: {
    color: TEXT_SECONDARY,
    fontSize: 16,
    fontWeight: "600",
    marginRight: 6,
  },
  inputFlex: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 14,
  },
  availIconWrap: {
    marginLeft: 8,
    width: 20,
    alignItems: "center",
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    paddingHorizontal: 4,
  },
  saveProfileBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  saveProfileBtnDisabled: {
    backgroundColor: "#1e293b",
  },
  saveProfileBtnText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sheetText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#d1d5db",
  },
  helpActionBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  helpActionBtnText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  sheetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  sheetDismissBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  sheetConfirmBtn: {
    backgroundColor: ERROR_COLOR,
  },
  sheetBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default SettingsScreen;

