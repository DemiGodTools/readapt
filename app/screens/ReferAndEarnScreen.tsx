import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Share,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Vibration,
  Image,
  Dimensions,
  Modal,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Path,
  Circle,
  Rect,
  Defs,
  RadialGradient,
  Stop,
} from "react-native-svg";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { api } from "../../lib/api";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { copyText } from "../../lib/safeNative";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/* --------------------------------------------------------------------------
 * READAPT Dark + Signature Teal Theme
 * ----------------------------------------------------------------------- */
const THEME = {
  bg: "#070B0D",
  surface: "#11171A",
  surfaceElevated: "#151D21",
  surfaceBorder: "rgba(255, 255, 255, 0.08)",
  tealLight: "#5EEAD4",
  tealPrimary: "#00D2B4",
  tealDeep: "#0D9488",
  tealSoftBg: "rgba(0, 210, 180, 0.10)",
  tealSoftBorder: "rgba(0, 210, 180, 0.28)",
  bannerBg: "#7DD3C7",
  bannerTextDark: "#071917",
  bannerSubDark: "#123531",
  textPrimary: "#FFFFFF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  textOnTeal: "#041513",
};

/* --------------------------------------------------------------------------
 * Custom Vector Icons
 * ----------------------------------------------------------------------- */
const BackChevronIcon = ({ size = 24, color = "#FFFFFF" }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const ChevronRightIcon = ({ size = 20, color = THEME.tealPrimary }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M9 18l6-6-6-6" />
  </Svg>
);

const CopyIcon = ({ size = 20, color = THEME.tealPrimary }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Rect x="9" y="9" width="13" height="13" rx="2.5" ry="2.5" />
    <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

const CheckIcon = ({ size = 20, color = THEME.tealPrimary }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const ShareNodesIcon = ({ size = 19, color = THEME.textOnTeal }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Circle cx="18" cy="5" r="3" fill={color} />
    <Circle cx="6" cy="12" r="3" fill={color} />
    <Circle cx="18" cy="19" r="3" fill={color} />
    <Path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
  </Svg>
);

const DualUsersIcon = ({ size = 34, color = THEME.tealPrimary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="16.5" cy="8.5" r="3" fill={color} opacity={0.65} />
    <Path
      d="M16.5 13.5c2.6 0 5 1.3 5 3.3v1.2h-4.5"
      fill={color}
      opacity={0.65}
    />
    <Circle cx="9.5" cy="7.5" r="3.6" fill={color} />
    <Path
      d="M2.5 18c0-2.7 3.1-4.5 7-4.5s7 1.8 7 4.5v1H2.5v-1z"
      fill={color}
    />
  </Svg>
);

const ClockOutlineIcon = ({ size = 24, color = THEME.bannerTextDark }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Circle cx="12" cy="12" r="9.5" />
    <Path d="M12 7v5.2l3.4 2" />
  </Svg>
);

const CloseXIcon = ({ size = 18, color = "#9CA3AF" }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

interface ReferredFriend {
  id: string;
  name: string;
  userId: string;
  image?: string | null;
  joinedAt: string;
}

const formatJoinedDate = (dateString?: string) => {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

/* --------------------------------------------------------------------------
 * Draggable Dark Smooth Bottom Sheet: Referred Friends
 * ----------------------------------------------------------------------- */
interface ReferredFriendsSheetProps {
  visible: boolean;
  onClose: () => void;
  friends: ReferredFriend[];
  loading: boolean;
  totalCount: number;
}

const ReferredFriendsSheet = ({
  visible,
  onClose,
  friends,
  loading,
  totalCount,
}: ReferredFriendsSheetProps) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setSheetOpen(true);
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withSpring(0, {
        damping: 85,
        stiffness: 320,
        mass: 0.85,
      });
    } else {
      translateY.value = withTiming(
        SCREEN_HEIGHT,
        { duration: 180 },
        (finished) => {
          if (finished) runOnJS(setSheetOpen)(false);
        }
      );
    }
  }, [visible, translateY]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const nextY = startY.value + event.translationY;
      translateY.value = Math.max(0, nextY);
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 600) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, {
          damping: 85,
          stiffness: 320,
          mass: 0.85,
        });
      }
    });

  const panelAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  if (!sheetOpen && !visible) return null;

  return (
    <Modal
      visible={sheetOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={sheetStyles.root}>
        {/* Backdrop */}
        <Animated.View style={[sheetStyles.backdrop, backdropAnimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Panel */}
        <Animated.View style={[sheetStyles.panel, panelAnimStyle]}>
          <GestureDetector gesture={panGesture}>
            <View style={sheetStyles.grabArea}>
              <View style={sheetStyles.grabHandle} />
            </View>
          </GestureDetector>

          {/* Sheet Header */}
          <View style={sheetStyles.headerRow}>
            <View style={sheetStyles.headerTitleWrap}>
              <Text style={sheetStyles.headerTitle}>Invited Friends</Text>
              <View style={sheetStyles.badgePill}>
                <Text style={sheetStyles.badgeText}>{totalCount} Joined</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={sheetStyles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <CloseXIcon size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Content List / Empty State */}
          {loading && friends.length === 0 ? (
            <View style={sheetStyles.loadingWrap}>
              <ActivityIndicator size="small" color={THEME.tealPrimary} />
              <Text style={sheetStyles.loadingText}>Loading friends list...</Text>
            </View>
          ) : friends.length === 0 ? (
            <View style={sheetStyles.emptyWrap}>
              <View style={sheetStyles.emptyIconWrap}>
                <DualUsersIcon size={38} color={THEME.tealPrimary} />
              </View>
              <Text style={sheetStyles.emptyTitle}>No friends joined yet</Text>
              <Text style={sheetStyles.emptyDesc}>
                Share your invite code with friends. When they sign up on READAPT,
                they will be listed right here!
              </Text>
            </View>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={(item, index) => item.id || String(index)}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={sheetStyles.listContent}
              initialNumToRender={15}
              maxToRenderPerBatch={20}
              windowSize={5}
              renderItem={({ item }) => (
                <View style={sheetStyles.friendRow}>
                  {item.image ? (
                    <Image
                      source={{ uri: item.image }}
                      style={sheetStyles.avatarImg}
                    />
                  ) : (
                    <View style={sheetStyles.avatarFallback}>
                      <Text style={sheetStyles.avatarInitial}>
                        {(item.name || item.userId || "R")[0].toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={sheetStyles.friendInfo}>
                    <Text style={sheetStyles.friendName} numberOfLines={1}>
                      {item.name || "Reader"}
                    </Text>
                    {item.userId ? (
                      <Text style={sheetStyles.friendHandle}>
                        @{item.userId}
                      </Text>
                    ) : null}
                  </View>

                  <Text style={sheetStyles.joinedDate}>
                    {formatJoinedDate(item.joinedAt)}
                  </Text>
                </View>
              )}
            />
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

/* --------------------------------------------------------------------------
 * Main Screen
 * ----------------------------------------------------------------------- */
export default function ReferAndEarnScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, reload, updateUser } = useUser();
  const { showToast } = useToast();

  // Instant personalized user-related referral code fallback
  const initialReferralCode = useMemo(() => {
    if (user?.referralCode && typeof user.referralCode === "string" && user.referralCode.trim()) {
      return user.referralCode.toUpperCase().trim();
    }
    const cleanId = (user?.userId || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (cleanId.length >= 5 && cleanId.length <= 12) {
      return cleanId;
    }
    const cleanName = (user?.name || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (cleanName.length >= 5 && cleanName.length <= 12) {
      return cleanName;
    }
    return cleanId || cleanName || "READAPT";
  }, [user?.referralCode, user?.userId, user?.name]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [totalCount, setTotalCount] = useState(user?.totalReferralsCount || 0);
  const [referrals, setReferrals] = useState<ReferredFriend[]>([]);
  const [copied, setCopied] = useState(false);
  const [showFriendsSheet, setShowFriendsSheet] = useState(false);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state if user.referralCode loads or updates
  useEffect(() => {
    if (user?.referralCode) {
      setReferralCode(user.referralCode.toUpperCase().trim());
    }
    if (typeof user?.totalReferralsCount === "number") {
      setTotalCount(user.totalReferralsCount);
    }
  }, [user?.referralCode, user?.totalReferralsCount]);

  const fetchReferralStats = useCallback(async () => {
    try {
      const res = await api.get("/referral/stats");
      if (res.data?.success) {
        if (res.data.referralCode) {
          const freshCode = res.data.referralCode.toUpperCase().trim();
          setReferralCode(freshCode);
          if (updateUser) {
            updateUser({ referralCode: freshCode, totalReferralsCount: res.data.totalCount || 0 } as any);
          }
        }
        setTotalCount(res.data.totalCount || 0);
        setReferrals(res.data.referrals || []);
      }
    } catch (err: any) {
      console.warn("Could not fetch referral stats:", err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [updateUser]);

  useEffect(() => {
    fetchReferralStats();
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [fetchReferralStats]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReferralStats();
    reload?.().catch(() => {});
  };

  const handleCopyCode = async () => {
    const codeToCopy = referralCode || initialReferralCode;
    if (!codeToCopy) return;

    try {
      Vibration.vibrate(25);
    } catch {}

    const success = await copyText(codeToCopy);
    if (success) {
      setCopied(true);
      showToast({ title: "Referral code copied!" });
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } else {
      Share.share({ message: codeToCopy });
    }
  };

  const handleShare = async () => {
    const codeToShare = referralCode || initialReferralCode;
    try {
      Vibration.vibrate(20);
    } catch {}
    try {
      await Share.share({
        message: `Join me on READAPT to build a daily reading habit! Use my invite code: ${codeToShare}`,
      });
    } catch {}
  };

  const formattedCount = String(totalCount).padStart(2, "0");

  return (
    <View style={styles.container}>
      {/* Top Ambient Teal Wave Glow */}
      <LinearGradient
        colors={[
          "rgba(0, 210, 180, 0.16)",
          "rgba(13, 148, 136, 0.05)",
          "rgba(7, 11, 13, 0)",
        ]}
        locations={[0, 0.32, 0.65]}
        style={styles.topAmbientGradient}
        pointerEvents="none"
      />

      {/* Floating Minimal Back Button */}
      <View
        style={[styles.floatingTopBar, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.7}
        >
          <BackChevronIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 26,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.tealPrimary}
            colors={[THEME.tealPrimary]}
          />
        }
      >
        {/* Hero Illustration with Semi-Circular Bottom Contour & Seamless Fade */}
        <View style={styles.heroWrapper}>
          {/* Radial Teal Backdrop Glow behind referdap.png */}
          <Svg
            width={SCREEN_WIDTH * 0.88}
            height={220}
            viewBox="0 0 320 220"
            style={styles.heroGlowSvg}
          >
            <Defs>
              <RadialGradient id="tealHeroGlow" cx="50%" cy="48%" r="50%">
                <Stop offset="0%" stopColor="#00D2B4" stopOpacity="0.22" />
                <Stop offset="65%" stopColor="#0D9488" stopOpacity="0.06" />
                <Stop offset="100%" stopColor="#070B0D" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx="160" cy="110" r="110" fill="url(#tealHeroGlow)" />
          </Svg>

          {/* Semi-circular bottom-clipped container for referdap.png */}
          <View style={styles.heroImageFrame}>
            <Image
              source={require("../../assets/referdap.png")}
              style={styles.heroImage}
              resizeMode="contain"
            />
            {/* Smooth bottom feathering gradient matching the semi-circular end */}
            <LinearGradient
              colors={[
                "rgba(7, 11, 13, 0)",
                "rgba(7, 11, 13, 0.55)",
                THEME.bg,
              ]}
              locations={[0, 0.62, 1]}
              style={styles.heroBottomFade}
              pointerEvents="none"
            />
          </View>
        </View>

        {/* Title & Subtitle */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>
            Refer <Text style={styles.titleAmpersand}>&amp;</Text> Earn
          </Text>
          <Text style={styles.subTitle}>
            Invite your friends to be part of{"\n"}the READAPT learning community.
          </Text>
        </View>

        {/* 1. Referral Code Card */}
        <View style={styles.codeBox}>
          <View style={styles.codeCenterContent}>
            <Text style={styles.codeLabel}>Your Referral Code</Text>
            <Text style={styles.codeValue} selectable numberOfLines={1}>
              {referralCode}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleCopyCode}
            style={[styles.copyIconBtn, copied && styles.copyIconBtnActive]}
            activeOpacity={0.75}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {copied ? (
              <CheckIcon size={20} color={THEME.tealPrimary} />
            ) : (
              <CopyIcon size={20} color={THEME.tealPrimary} />
            )}
          </TouchableOpacity>
        </View>

        {/* 2. Primary Teal Pill CTA Button */}
        <TouchableOpacity
          style={styles.sharePillBtn}
          onPress={handleShare}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={[THEME.tealLight, THEME.tealPrimary, THEME.tealDeep]}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.92, y: 1 }}
            style={styles.sharePillGradient}
          >
            <ShareNodesIcon size={19} color={THEME.textOnTeal} />
            <Text style={styles.sharePillText}>Share Your Code</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* 3. Your Referrals Stat Card (Tapping opens the bottom sheet) */}
        <TouchableOpacity
          style={styles.referralsCard}
          activeOpacity={0.75}
          onPress={() => setShowFriendsSheet(true)}
        >
          <View style={styles.referralsIconBadge}>
            <DualUsersIcon size={32} color={THEME.tealPrimary} />
          </View>

          <View style={styles.referralsTextCol}>
            <Text style={styles.referralsTopLabel}>Your Referrals</Text>
            <Text style={styles.referralsCount}>{formattedCount}</Text>
            <Text style={styles.referralsBottomSub}>
              Friends successfully invited
            </Text>
          </View>

          {/* Right Chevron Indicator */}
          <View style={styles.referralsChevronWrap}>
            <ChevronRightIcon size={20} color={THEME.tealPrimary} />
          </View>
        </TouchableOpacity>

        {/* 4. Rewards Coming Soon Card */}
        <View style={styles.rewardsBanner}>
          <View style={styles.clockIconWrap}>
            <ClockOutlineIcon size={22} color={THEME.bannerTextDark} />
          </View>
          <View style={styles.rewardsBannerTextWrap}>
            <Text style={styles.rewardsBannerTitle}>
              Rewards are coming soon
            </Text>
            <Text style={styles.rewardsBannerDesc}>
              Referral rewards will be introduced with the upcoming subscription
              launch.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Draggable Referred Friends Bottom Sheet */}
      <ReferredFriendsSheet
        visible={showFriendsSheet}
        onClose={() => setShowFriendsSheet(false)}
        friends={referrals}
        loading={loading}
        totalCount={totalCount}
      />
    </View>
  );
}

/* --------------------------------------------------------------------------
 * Main Styles
 * ----------------------------------------------------------------------- */
const HERO_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 330);
const HERO_HEIGHT = 188;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  topAmbientGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 340,
  },
  floatingTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 22,
  },

  /* Hero Image with Semi-Circular Bottom Contour */
  heroWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  heroGlowSvg: {
    position: "absolute",
    top: -12,
  },
  heroImageFrame: {
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    borderBottomLeftRadius: HERO_WIDTH * 0.48,
    borderBottomRightRadius: HERO_WIDTH * 0.48,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
  },

  /* Title Block */
  titleSection: {
    alignItems: "center",
    marginTop: 2,
    marginBottom: 24,
  },
  mainTitle: {
    color: THEME.textPrimary,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  titleAmpersand: {
    color: THEME.tealPrimary,
  },
  subTitle: {
    color: THEME.textSecondary,
    fontSize: 15,
    lineHeight: 21.5,
    textAlign: "center",
    paddingHorizontal: 10,
  },

  /* 1. Referral Code Box */
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.surface,
    borderColor: THEME.surfaceBorder,
    borderWidth: 1.2,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  codeCenterContent: {
    flex: 1,
    alignItems: "center",
    paddingLeft: 32,
  },
  codeLabel: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: "500",
    marginBottom: 5,
  },
  codeValue: {
    color: THEME.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  copyIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: THEME.tealSoftBg,
    borderColor: THEME.tealSoftBorder,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  copyIconBtnActive: {
    backgroundColor: "rgba(0, 210, 180, 0.2)",
    borderColor: THEME.tealPrimary,
  },

  /* 2. Share Pill Button */
  sharePillBtn: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 18,
    shadowColor: THEME.tealPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 7,
  },
  sharePillGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  sharePillText: {
    color: THEME.textOnTeal,
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  /* 3. Your Referrals Stat Card */
  referralsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.surface,
    borderColor: THEME.surfaceBorder,
    borderWidth: 1.2,
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  referralsIconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: THEME.tealSoftBg,
    borderColor: THEME.tealSoftBorder,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  referralsTextCol: {
    flex: 1,
  },
  referralsTopLabel: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  referralsCount: {
    color: THEME.tealPrimary,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 0.5,
    lineHeight: 38,
  },
  referralsBottomSub: {
    color: THEME.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  referralsChevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },

  /* 4. Rewards Coming Soon Banner */
  rewardsBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: THEME.bannerBg,
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  clockIconWrap: {
    marginRight: 12,
    marginTop: 2,
  },
  rewardsBannerTextWrap: {
    flex: 1,
  },
  rewardsBannerTitle: {
    color: THEME.bannerTextDark,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 3,
  },
  rewardsBannerDesc: {
    color: THEME.bannerSubDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
});

/* --------------------------------------------------------------------------
 * Bottom Sheet Styles
 * ----------------------------------------------------------------------- */
const sheetStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.78,
    backgroundColor: "#0D1316",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.2,
    borderTopColor: "rgba(0, 210, 180, 0.25)",
    paddingBottom: 28,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.7,
    shadowRadius: 30,
    elevation: 20,
  },
  grabArea: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  grabHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  badgePill: {
    backgroundColor: THEME.tealSoftBg,
    borderColor: THEME.tealSoftBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    color: THEME.tealPrimary,
    fontSize: 11.5,
    fontWeight: "700",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: THEME.textSecondary,
    fontSize: 13,
  },
  emptyWrap: {
    paddingVertical: 44,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: THEME.tealSoftBg,
    borderColor: THEME.tealSoftBorder,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: THEME.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyDesc: {
    color: THEME.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 10,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.surface,
    borderColor: THEME.surfaceBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: THEME.tealSoftBg,
    borderColor: THEME.tealSoftBorder,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarInitial: {
    color: THEME.tealPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  friendInfo: {
    flex: 1,
    marginRight: 8,
  },
  friendName: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: "700",
  },
  friendHandle: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  joinedDate: {
    color: THEME.textMuted,
    fontSize: 11.5,
    fontWeight: "500",
  },
});
