import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Keyboard,
  Animated,
  ActivityIndicator,
  Vibration,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Ellipse, Circle, Rect, Polyline, Line, Polyline as SvgPolyline } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { api } from "../../lib/api";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const ACCENT = "#38bdf8";
const BG_MAIN = "#0a0f1a";
const BG_CARD = "#12192b";
const TEXT_PRIMARY = "#ffffff";
const TEXT_SECONDARY = "#94a3b8";
const BORDER = "#1e293b";
const ERROR_COLOR = "#ef4444";
const SUCCESS_COLOR = "#22c55e";

type Profession = "Student" | "Professional" | "Researcher" | "Entrepreneur" | "Content Creator" | "Other" | "";
type Visibility = "Public" | "Private";

const TOTAL_STEPS = 6;

const INTEREST_OPTIONS = [
  { id: "Psychology", img: "https://images.unsplash.com/photo-1571249767222-6b92aeeecb91?w=400&q=80" },
  { id: "Finance", img: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&q=80" },
  { id: "Self Growth", img: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=400&q=80" },
  { id: "Technology", img: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80" },
  { id: "Business", img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80" },
  { id: "Creative", img: "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?w=400&q=80" },
];

const ProfileCreation = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, updateUser, reload } = useUser() as any;
  const { showToast } = useToast();

  const [step, setStep] = useState(0);
  
  const [profilePhoto, setProfilePhoto] = useState<string | null>(user?.image || user?.profilePhoto || null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(Boolean(user?.image || user?.profilePhoto));
  
  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.userId || "");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(user?.userId ? true : null);
  const [usernameFeedback, setUsernameFeedback] = useState<string>(user?.userId ? "Your current username" : "");

  const [profession, setProfession] = useState<Profession>((user?.profession as Profession) || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [interests, setInterests] = useState<string[]>(Array.isArray(user?.interests) && user.interests.length > 0 ? user.interests : []);
  const [visibility, setVisibility] = useState<Visibility>((user?.visibility as Visibility) || "Public");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [completionPercent, setCompletionPercent] = useState(0);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  
  const finalTickScale = useRef(new Animated.Value(0)).current;
  const finalProgressFill = useRef(new Animated.Value(0)).current;
  const finalCardReveal = useRef(new Animated.Value(0)).current;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: step === 0 || step === 7 ? 0 : step / TOTAL_STEPS,
      duration: 400,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [step]);

  useEffect(() => {
    if (step === 7) {
      Vibration.vibrate(1000); 

      // Native-like smooth listener for 0 to 100 percentage text update
      finalProgressFill.addListener((state) => {
        setCompletionPercent(Math.round(state.value * 100));
      });

      Animated.parallel([
        Animated.spring(finalTickScale, {
          toValue: 1,
          tension: 50,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.timing(finalProgressFill, {
          toValue: 1,
          duration: 1600, // Smooth buttery duration
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // Must be false for width animation
        })
      ]).start(() => {
        finalProgressFill.removeAllListeners();
        Animated.spring(finalCardReveal, {
          toValue: 1,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }).start();
      });
    }
    
    return () => {
        finalProgressFill.removeAllListeners();
    }
  }, [step]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const handlePhotoSelect = async () => {
    if (isUploadingPhoto) return;

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showToast({ title: "Permission to access photo library is required!" });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images" as any],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setProfilePhoto(asset.uri);
      uploadSelectedPhoto(asset);
    }
  };

  const uploadSelectedPhoto = async (asset: any) => {
    setIsUploadingPhoto(true);
    setUploadSuccess(false);

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

    try {
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
          setProfilePhoto(finalUrl);
          if (updateUser) updateUser({ image: finalUrl } as any);
        }
      }
      setUploadSuccess(true);
      Vibration.vibrate(40);
    } catch (err: any) {
      console.warn("Profile creation photo upload error:", err?.message);
      // Keep local uri so user is never blocked
      setUploadSuccess(true);
    } finally {
      setIsUploadingPhoto(false);
      loopAnim.stop();
      spinAnim.setValue(0);
    }
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const checkUsernameAvailability = useCallback(
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
        setUsernameFeedback("Only letters, numbers, and underscores allowed");
        return;
      }

      if (user?.userId && trimmed === user.userId.toLowerCase()) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(true);
        setUsernameFeedback("This is your current username");
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
          setUsernameFeedback("Could not verify username right now");
        } finally {
          setIsCheckingUsername(false);
        }
      }, 320);
    },
    [user?.userId]
  );

  const handleUsernameChange = (text: string) => {
    setUsername(text);
    checkUsernameAvailability(text);
  };

  const handleNext = useCallback(() => {
    Keyboard.dismiss();
    setStep((prev) => Math.min(prev + 1, 7));
  }, []);

  const handleBack = useCallback(() => {
    if (step > 0 && step < 7) {
      Keyboard.dismiss();
      setStep((prev) => prev - 1);
    }
  }, [step]);

  const toggleInterest = (item: string) => {
    setInterests((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleSaveProfile = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        username: username.trim().toLowerCase(),
        profession: profession.trim(),
        bio: bio.trim(),
        interests,
        visibility,
        image: profilePhoto,
        profilePhoto,
      };

      const res = await api.post("/update/profile-setup", payload);

      if (res.data?.success) {
        if (updateUser) {
          updateUser(res.data.user || {
            ...payload,
            isProfileCompleted: true,
          });
        }
        if (reload) reload().catch(() => {});
        Keyboard.dismiss();
        setStep(7); 
      } else {
        showToast({ title: res.data?.message || "Failed to update profile" });
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || "An error occurred while saving your profile.";
      showToast({ title: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueToHome = () => {
    navigation.reset({ index: 0, routes: [{ name: "Tabs" }] });
  };

  const handleViewProfile = () => {
    navigation.reset({ index: 0, routes: [{ name: "Tabs", params: { screen: "Profile" } }] });
  };

  const isFormStep = step > 0 && step < 7;

  const isContinueDisabled =
    (step === 1 && name.trim().length < 2) ||
    (step === 2 && (username.trim().length < 3 || isUsernameAvailable !== true || isCheckingUsername)) ||
    (step === 3 && !profession) ||
    (step === 4 && bio.trim().length < 3) ||
    (step === 5 && interests.length === 0) ||
    (step === 6 && !visibility) ||
    isSubmitting;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const finalProgressWidthStr = finalProgressFill.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const cardExpandY = finalCardReveal.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  const OrbitWrapper = ({ children }: { children: React.ReactNode }) => (
    <View style={styles.orbitContainer}>
      <Svg style={{ position: "absolute" }} width="160" height="160" viewBox="0 0 160 160">
        <Ellipse cx="80" cy="80" rx="55" ry="20" stroke={ACCENT} strokeWidth="1" opacity="0.3" transform="rotate(-25 80 80)" />
        <Ellipse cx="80" cy="80" rx="65" ry="25" stroke={ACCENT} strokeWidth="1" opacity="0.15" transform="rotate(35 80 80)" />
        <Circle cx="30" cy="50" r="1.5" fill={ACCENT} opacity="0.8" />
        <Circle cx="130" cy="110" r="2.5" fill={ACCENT} opacity="0.6" />
        <Circle cx="110" cy="30" r="1" fill={ACCENT} opacity="0.9" />
        <Circle cx="40" cy="120" r="1.5" fill={ACCENT} opacity="0.5" />
      </Svg>
      {children}
    </View>
  );

  const renderIntro = () => (
    <View style={styles.stepContainer}>
      <View style={styles.introHeader}>
        <Image source={require("../../assets/textIcon.png")} style={styles.textLogo} resizeMode="contain" />
      </View>
      <View style={styles.introContent}>
        <Text style={styles.introTitle}>Let's Build{"\n"}Your Profile</Text>
        <Text style={styles.introSubtitle}>
          Complete your profile to personalize your experience and connect with the community.
        </Text>
        <Image source={require("../../assets/glowpage.png")} style={styles.introImage} resizeMode="contain" />
      </View>
      <View style={styles.introFooter}>
        <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.8} onPress={handleNext}>
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </TouchableOpacity>
        <Text style={styles.introHint}>Takes less than a minute</Text>
      </View>
    </View>
  );

  const renderNameStep = () => (
    <View style={styles.stepContainer}>
      <TouchableOpacity activeOpacity={0.8} onPress={handlePhotoSelect} style={styles.photoPickerWrapper}>
        <View style={[styles.photoCircle, uploadSuccess && styles.photoCircleSuccess]}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.photoImage} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={TEXT_SECONDARY} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <Polyline points="17 8 12 3 7 8" />
                <Line x1="12" y1="3" x2="12" y2="15" />
              </Svg>
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </View>
          )}
        </View>

        {isUploadingPhoto && (
          <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}>
            <Svg width="120" height="120" viewBox="0 0 120 120">
              <Circle cx="60" cy="60" r="58" stroke={ACCENT} strokeWidth="4" strokeDasharray="90 270" strokeLinecap="round" fill="none" />
            </Svg>
          </Animated.View>
        )}

        {uploadSuccess && (
          <View style={styles.successRing}>
            <Svg width="120" height="120" viewBox="0 0 120 120">
              <Circle cx="60" cy="60" r="58" stroke={SUCCESS_COLOR} strokeWidth="4" fill="none" />
            </Svg>
            <View style={styles.successBadgeMini}>
               <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <Polyline points="20 6 9 17 4 12" />
               </Svg>
            </View>
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.stepTitle}>What's your name?</Text>
      <Text style={styles.stepSubtitle}>Upload a profile photo and enter your full name.</Text>
      
      <TextInput
        style={styles.input}
        placeholder="e.g. Alex Morgan"
        placeholderTextColor={TEXT_SECONDARY}
        value={name}
        onChangeText={setName}
        maxLength={50}
      />
    </View>
  );

  const renderUsernameStep = () => (
    <View style={styles.stepContainer}>
      <OrbitWrapper>
        <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="4" />
          <Path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
        </Svg>
      </OrbitWrapper>
      <Text style={styles.stepTitle}>Choose a username</Text>
      <Text style={styles.stepSubtitle}>Pick a unique handle for your profile identification.</Text>

      <View style={[styles.inputRow, isUsernameAvailable === false && styles.inputError, isUsernameAvailable === true && styles.inputSuccess]}>
        <Text style={styles.fixedAt}>@</Text>
        <TextInput
          style={styles.inputFlex}
          placeholder="username"
          placeholderTextColor={TEXT_SECONDARY}
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={20}
        />
        <View style={styles.availabilityIconWrap}>
          {isCheckingUsername && <ActivityIndicator size="small" color={ACCENT} />}
          {!isCheckingUsername && isUsernameAvailable === true && (
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={SUCCESS_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          )}
          {!isCheckingUsername && isUsernameAvailable === false && (
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ERROR_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Line x1="18" y1="6" x2="6" y2="18" />
              <Line x1="6" y1="6" x2="18" y2="18" />
            </Svg>
          )}
        </View>
      </View>

      {usernameFeedback ? (
        <View style={styles.feedbackRow}>
          <Text style={[styles.feedbackText, isUsernameAvailable === true && { color: SUCCESS_COLOR }, isUsernameAvailable === false && { color: ERROR_COLOR }]}>
            {usernameFeedback}
          </Text>
        </View>
      ) : null}

      <View style={styles.usernameGuidelines}>
        <Text style={styles.guidelineText}>• 3 to 20 characters</Text>
        <Text style={styles.guidelineText}>• Only letters, numbers, and underscores</Text>
        <Text style={styles.guidelineText}>• Verified instantaneously across all members</Text>
      </View>
    </View>
  );

  const renderProfessionStep = () => {
    const options: Profession[] = ["Student", "Professional", "Researcher", "Entrepreneur", "Content Creator", "Other"];
    return (
      <View style={styles.stepContainer}>
        <OrbitWrapper>
          <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <Rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </Svg>
        </OrbitWrapper>
        <Text style={styles.stepTitle}>What's your profession?</Text>
        <Text style={styles.stepSubtitle}>Select what describes you best.</Text>
        <View style={styles.grid}>
          {options.map((opt) => (
            <TouchableOpacity key={opt} style={[styles.gridOption, profession === opt && styles.gridOptionActive]} activeOpacity={0.7} onPress={() => setProfession(opt)}>
              <Text style={[styles.gridOptionText, profession === opt && styles.gridOptionTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderBioStep = () => (
    <View style={styles.stepContainer}>
      <OrbitWrapper>
        <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <Line x1="16" y1="8" x2="2" y2="22" />
          <Line x1="17.5" y1="15" x2="9" y2="15" />
        </Svg>
      </OrbitWrapper>
      <Text style={styles.stepTitle}>Write a short bio</Text>
      <Text style={styles.stepSubtitle}>Tell others a little about yourself in a sentence or two.</Text>
      <View style={styles.bioWrapper}>
        <TextInput
          style={[styles.inputFlex, styles.textArea]}
          placeholder="e.g. Voracious reader, exploring science, finance, and human psychology..."
          placeholderTextColor={TEXT_SECONDARY}
          value={bio}
          onChangeText={setBio}
          multiline
          textAlignVertical="top"
          maxLength={160}
          autoFocus
        />
        <Text style={styles.charCounter}>{bio.length}/160</Text>
      </View>
    </View>
  );

  const InterestItem = ({ opt, isActive, onPress }: any) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    return (
      <Pressable
        style={styles.imageGridCard}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
        onPress={() => onPress(opt.id)}
      >
        <Animated.View style={[styles.imageCardInner, isActive && styles.imageCardActive, { transform: [{ scale: scaleAnim }] }]}>
          <Image source={{ uri: opt.img }} style={styles.interestImage} />
          {!isActive && <View style={styles.grayscaleOverlay} />}
          <View style={styles.interestLabelWrap}>
            <Text style={styles.interestLabel}>{opt.id}</Text>
          </View>
          {isActive && (
            <View style={styles.selectedCheck}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="20 6 9 17 4 12" />
              </Svg>
            </View>
          )}
        </Animated.View>
      </Pressable>
    );
  };

  const renderInterestsStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle} adjustsFontSizeToFit numberOfLines={2}>What are you interested in?</Text>
      <Text style={styles.stepSubtitle}>Select topics to personalize your experience.</Text>
      <View style={styles.imageGrid}>
        {INTEREST_OPTIONS.map((opt) => (
          <InterestItem key={opt.id} opt={opt} isActive={interests.includes(opt.id)} onPress={toggleInterest} />
        ))}
      </View>
    </View>
  );

  const renderVisibilityStep = () => (
    <View style={styles.stepContainer}>
      <OrbitWrapper>
        <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <Circle cx="12" cy="12" r="3" />
        </Svg>
      </OrbitWrapper>
      <Text style={styles.stepTitle}>Choose profile visibility</Text>
      <Text style={styles.stepSubtitle}>Control who can see your learning profile.</Text>

      <TouchableOpacity style={[styles.visibilityCard, visibility === "Public" && styles.visibilityCardActive]} activeOpacity={0.7} onPress={() => setVisibility("Public")}>
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={visibility === "Public" ? ACCENT : TEXT_SECONDARY} strokeWidth="1.5">
          <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <Circle cx="12" cy="12" r="3" />
        </Svg>
        <View style={styles.visTextWrap}>
          <Text style={styles.visTitle}>Public Profile</Text>
          <Text style={styles.visDesc}>Visible to the community. Others can see your achievements, interests, and stats.</Text>
        </View>
        <View style={[styles.radioBtn, visibility === "Public" && styles.radioBtnActive]}>
          {visibility === "Public" && <View style={styles.radioInner} />}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.visibilityCard, visibility === "Private" && styles.visibilityCardActive]} activeOpacity={0.7} onPress={() => setVisibility("Private")}>
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={visibility === "Private" ? ACCENT : TEXT_SECONDARY} strokeWidth="1.5">
          <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <Line x1="1" y1="1" x2="23" y2="23" />
        </Svg>
        <View style={styles.visTextWrap}>
          <Text style={styles.visTitle}>Private Profile</Text>
          <Text style={styles.visDesc}>Hidden from other members. Only you can view your personal profile and records.</Text>
        </View>
        <View style={[styles.radioBtn, visibility === "Private" && styles.radioBtnActive]}>
          {visibility === "Private" && <View style={styles.radioInner} />}
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderSuccess = () => (
    <View style={styles.finalScreenWrapper}>
      <View style={{alignItems: 'center', marginTop: 10}}>
        <OrbitWrapper>
          <Animated.View style={[styles.successBadge, { transform: [{ scale: finalTickScale }] }]}>
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={TEXT_PRIMARY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <Path d="M22 4L12 14.01l-3-3" />
            </Svg>
          </Animated.View>
        </OrbitWrapper>

        <Text style={styles.stepTitle}>Profile Completed!</Text>
        <Text style={styles.stepSubtitle}>Your profile is fully configured. Welcome aboard to READAPT!</Text>
      </View>

      <View style={styles.summaryCard}>
        {/* Progress Bar Fill Section */}
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>Setup Progress</Text>
          <Text style={styles.progressValue}>{completionPercent}%</Text>
        </View>
        <View style={styles.progressBarTrack}>
          <Animated.View style={[styles.progressBarFill, { width: finalProgressWidthStr }]}>
            <LinearGradient colors={[ACCENT, "#60a5fa"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>

        {/* Expanding Profile Details Section */}
        <Animated.View style={{ opacity: finalCardReveal, transform: [{ translateY: cardExpandY }], marginTop: 24 }}>
          <View style={styles.finalProfileContainer}>
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.finalProfileImg} />
            ) : (
              <View style={[styles.finalProfileImg, { backgroundColor: BORDER, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{color: TEXT_SECONDARY, fontSize: 24, fontWeight: '700'}}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.finalProfileName}>{name} <Text style={styles.finalProfileProfession}>• {profession}</Text></Text>
            <Text style={styles.finalProfileUsername}>@{username}</Text>
            <Text style={styles.finalProfileBio}>{bio}</Text>
          </View>
        </Animated.View>
      </View>

      <View style={{ flex: 1 }} />

      {/* Perfect Side-by-Side Horizontal Buttons */}
      <View style={styles.finalButtonsRow}>
        <TouchableOpacity style={styles.secondaryBtnBlock} activeOpacity={0.7} onPress={handleViewProfile}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: 6}}>
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Circle cx="12" cy="7" r="4" />
          </Svg>
          <Text style={styles.secondaryBtnBlockText}>View Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryBtnBlock} activeOpacity={0.8} onPress={handleContinueToHome}>
           <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: 6}}>
            <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <Polyline points="9 22 9 12 15 12 15 22" />
          </Svg>
          <Text style={styles.primaryBtnBlockText}>Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderIntro();
      case 1: return renderNameStep();
      case 2: return renderUsernameStep();
      case 3: return renderProfessionStep();
      case 4: return renderBioStep();
      case 5: return renderInterestsStep();
      case 6: return renderVisibilityStep();
      case 7: return renderSuccess();
      default: return renderIntro();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <LinearGradient colors={["#060913", BG_MAIN]} style={StyleSheet.absoluteFillObject} />

      {/* Header Navigation (Only for Steps 1-6) */}
      {isFormStep && (
        <View style={[styles.header, { marginTop: insets.top + 10 }]}>
          <View style={styles.topProgressWrapper}>
            <Animated.View style={[styles.topProgressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.stepIndicatorText}>{step}/6</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent, 
          step === 0 && { paddingTop: insets.top + 40 }, 
          // Disable scrolling layout dynamically to fill page on Step 7
          step === 7 && { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, flex: 1 }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={step !== 7} // Strictly disable scrolling on the completion page
      >
        {renderCurrentStep()}
      </ScrollView>

      {/* Footer Navigation (Steps 1-6) */}
      {isFormStep && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.footerRow}>
            {step > 0 && (
              <TouchableOpacity style={styles.backSquareBtn} onPress={handleBack}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={TEXT_PRIMARY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <Line x1="19" y1="12" x2="5" y2="12" />
                  <Polyline points="12 19 5 12 12 5" />
                </Svg>
              </TouchableOpacity>
            )}

            {step === 6 ? (
              <TouchableOpacity
                style={[styles.primaryBtn, isContinueDisabled && styles.primaryBtnDisabled, { flex: 1 }]}
                activeOpacity={0.8}
                onPress={handleSaveProfile}
                disabled={isContinueDisabled}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#0f172a" size="small" />
                ) : (
                  <Text style={[styles.primaryBtnText, isContinueDisabled && styles.primaryBtnTextDisabled]}>Complete Profile</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, isContinueDisabled && styles.primaryBtnDisabled, { flex: 1 }]}
                activeOpacity={0.8}
                onPress={handleNext}
                disabled={isContinueDisabled}
              >
                <Text style={[styles.primaryBtnText, isContinueDisabled && styles.primaryBtnTextDisabled]}>Continue</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_MAIN,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24, // Matches scroll padding
    marginBottom: 20,
  },
  stepIndicatorText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 12,
    width: 30, // Keep width strict to avoid layout shift when numbers change
    textAlign: "right"
  },
  topProgressWrapper: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },
  topProgressFill: {
    height: "100%",
    backgroundColor: ACCENT,
    borderRadius: 4,
  },
  stepContainer: {
    flex: 1,
    alignItems: "center",
    paddingTop: 10,
  },
  orbitContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 160,
    height: 160,
    marginBottom: 20,
  },
  photoPickerWrapper: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
    marginTop: 10,
  },
  photoCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: BG_CARD,
    borderWidth: 2,
    borderColor: BORDER,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  photoCircleSuccess: {
    borderColor: SUCCESS_COLOR,
  },
  photoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  spinnerRing: {
    position: "absolute",
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  successRing: {
    position: "absolute",
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  successBadgeMini: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SUCCESS_COLOR,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: BG_MAIN,
    zIndex: 20,
  },
  introHeader: {
    alignItems: "center",
    marginBottom: 40,
  },
  textLogo: {
    width: 160, // Increased size as requested
    height: 46, // Increased size as requested
  },
  introContent: {
    flex: 1,
    alignItems: "center",
    width: "100%",
  },
  introTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    textAlign: "center",
    lineHeight: 42,
    marginBottom: 12,
  },
  introSubtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
  },
  introImage: {
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.7,
  },
  introFooter: {
    width: "100%",
    paddingBottom: 40,
  },
  introHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 16,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    marginBottom: 10,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  stepSubtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    marginBottom: 32,
    textAlign: "center",
    lineHeight: 22,
  },
  input: {
    width: "100%",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: "500",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 20,
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
    fontSize: 17,
    fontWeight: "600",
    marginRight: 8,
  },
  inputFlex: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: "500",
    paddingVertical: 18,
  },
  availabilityIconWrap: {
    marginLeft: 10,
    width: 24,
    alignItems: "center",
  },
  feedbackRow: {
    width: "100%",
    marginTop: 8,
    paddingHorizontal: 6,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_SECONDARY,
  },
  usernameGuidelines: {
    width: "100%",
    marginTop: 18,
    paddingHorizontal: 8,
    gap: 6,
  },
  guidelineText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: "500",
  },
  bioWrapper: {
    width: "100%",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: "hidden",
  },
  textArea: {
    height: 140,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  charCounter: {
    position: "absolute",
    bottom: 12,
    right: 16,
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  gridOption: {
    width: "48%",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  gridOptionActive: {
    borderColor: ACCENT,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  gridOptionText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontWeight: "600",
  },
  gridOptionTextActive: {
    color: ACCENT,
    fontWeight: "700",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    rowGap: 16,
  },
  imageGridCard: {
    width: "47%",
    aspectRatio: 1,
  },
  imageCardInner: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  imageCardActive: {
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  interestImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  grayscaleOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 15, 26, 0.75)",
  },
  interestLabelWrap: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
  },
  interestLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  selectedCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  visibilityCard: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  visibilityCardActive: {
    borderColor: ACCENT,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
  },
  visTextWrap: {
    flex: 1,
    paddingHorizontal: 16,
  },
  visTitle: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  visDesc: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
  },
  radioBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
  finalScreenWrapper: {
    flex: 1, 
    justifyContent: 'space-between', // Pushes the buttons strictly to the bottom
    width: '100%',
  },
  successBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  summaryCard: {
    width: "100%",
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 24,
    marginTop: 10,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  progressLabel: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: "600",
  },
  progressValue: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: "700",
  },
  progressBarTrack: {
    width: "100%",
    height: 10,
    backgroundColor: "#1e293b",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  finalProfileContainer: {
    alignItems: "center",
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  finalProfileImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 12,
  },
  finalProfileName: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  finalProfileProfession: {
    color: TEXT_SECONDARY,
    fontWeight: "500",
    fontSize: 16,
  },
  finalProfileUsername: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  finalProfileBio: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  finalButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  secondaryBtnBlock: {
    flex: 1,
    height: 60,
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnBlockText: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: "600",
  },
  primaryBtnBlock: {
    flex: 1,
    height: 60,
    backgroundColor: ACCENT,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  primaryBtnBlockText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backSquareBtn: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  primaryBtn: {
    backgroundColor: ACCENT,
    height: 58,
    justifyContent: "center",
    borderRadius: 16,
    alignItems: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  primaryBtnDisabled: {
    backgroundColor: "#1e293b",
    shadowOpacity: 0,
  },
  primaryBtnText: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  primaryBtnTextDisabled: {
    color: "#64748b",
  },
});

export default ProfileCreation;