import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  AppState,
  Pressable,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import useAuth from "../../hooks/useAuth";
import Svg, { G, Path } from "react-native-svg";
import { useToast } from "../../hooks/useToast";
import { ParamListBase, RouteProp } from "@react-navigation/native";
import pallete from "../../lib/Colors";
import { api, getAccountDeletionUrl } from "../../lib/api";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { useUser } from "../../hooks/useUser";

type Props = {
  route: RouteProp<ParamListBase, "Login">;
  navigation: any;
};

const BACKEND_LOGIN_URL = "/auth/login";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Safe haptic trigger (works even if expo-haptics is not installed)
const triggerHaptic = () => {
  try {
    const Haptics = require("expo-haptics");
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Fallback silently if expo-haptics is unavailable
  }
};

const getInitials = (nameOrEmail: string) => {
  if (!nameOrEmail) return "U";
  const cleanString = nameOrEmail.trim();
  if (!cleanString) return "U";

  if (cleanString.includes("@")) {
    return cleanString.substring(0, 2).toUpperCase();
  }

  const parts = cleanString.split(" ").filter(Boolean);
  if (parts.length > 1 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return cleanString.substring(0, 2).toUpperCase();
};

const getDisplayTitle = (name?: string) => {
  if (!name || !name.trim()) return "Continue with this account";
  const firstName = name.trim().split(" ")[0];
  return `Continue as ${firstName}`;
};

/**
 * Tactile spring-animated pill button with press opacity, scale feedback, and haptic tap
 */
const TactilePillButton = ({
  onPress,
  disabled,
  style,
  children,
  accessibilityLabel,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: any;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    triggerHaptic();
    Animated.spring(scaleAnim, {
      toValue: 0.975,
      useNativeDriver: true,
      speed: 35,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        { opacity: disabled ? 0.65 : pressed ? 0.92 : 1 },
      ]}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const Login = ({ navigation }: Props) => {
  const { isLoggedIn, isLoading } = useAuth();
  const { showToast } = useToast();
  const { reload, setAuthSession } = useUser() as any;
  const [activeAuthMode, setActiveAuthMode] = useState<"cached" | "new" | null>(
    null
  );
  const { isConnected } = useNetworkStatus();

  const [cachedUser, setCachedUser] = useState<any>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<{
    token: string;
    scheduledAt?: string;
    email?: string;
  } | null>(null);

  const isLoadingUi = activeAuthMode !== null;

  const checkPendingDeletion = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem("pending_deletion_info");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.token || parsed?.email) {
          setPendingDeletion(parsed);

          try {
            const res = await api.get("/user/deletion/status", {
              params: {
                token: parsed.token || undefined,
                email: parsed.email || undefined,
              },
            });

            if (res?.data?.success) {
              if (res.data.status !== "PENDING_DELETION") {
                await AsyncStorage.removeItem("pending_deletion_info");
                setPendingDeletion(null);
              } else {
                setPendingDeletion({
                  token: res.data.token || parsed.token,
                  email: res.data.rawEmail || parsed.email,
                  scheduledAt: res.data.scheduledAt || parsed.scheduledAt,
                });
              }
            }
          } catch {
            // Network issue or offline - keep local state intact
          }
        } else {
          setPendingDeletion(null);
        }
      } else {
        setPendingDeletion(null);
      }
    } catch (e) {
      console.log("Error checking deletion status:", e);
    }
  }, []);

  const loadCachedUser = useCallback(async () => {
    try {
      let userData = await AsyncStorage.getItem("recent_session_account");
      if (!userData) {
        userData = await AsyncStorage.getItem("cached_user_profile");
      }
      if (userData) {
        setAvatarError(false);
        setCachedUser(JSON.parse(userData));
      }
    } catch (error) {
      console.log("Failed to load cached user", error);
    }
  }, []);

  useEffect(() => {
    checkPendingDeletion();
    loadCachedUser();

    const unsubscribeFocus = navigation.addListener("focus", () => {
      checkPendingDeletion();
      loadCachedUser();
    });

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkPendingDeletion();
        loadCachedUser();
      }
    });

    return () => {
      unsubscribeFocus();
      appStateSub.remove();
    };
  }, [navigation, checkPendingDeletion, loadCachedUser]);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId:
        "743066184878-es8jqus96o8ip2qlrmd7md7n5o5j8ndv.apps.googleusercontent.com",
      offlineAccess: true,
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      navigation.replace("Tabs");
    }
  }, [isLoading, isLoggedIn]);

  const handleGoogleSignIn = async (useAnotherAccount = false) => {
    if (isLoadingUi) return;

    try {
      setActiveAuthMode(useAnotherAccount ? "new" : "cached");
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      if (useAnotherAccount) {
        try {
          await GoogleSignin.signOut();
        } catch (e) {
          console.log("Already signed out:", e);
        }
      }

      const response: any = await GoogleSignin.signIn();
      if (response?.type === "cancelled") {
        setActiveAuthMode(null);
        return;
      }

      const idToken = response?.data?.idToken || response?.idToken;
      let accessToken: string | undefined;
      try {
        const tokens = await GoogleSignin.getTokens();
        accessToken = tokens?.accessToken;
      } catch (tokenErr) {
        console.log("Could not get Google access token:", tokenErr);
      }

      if (idToken || accessToken) {
        await handleBackendLogin({
          idToken,
          googleAccessToken: accessToken,
        });
      } else {
        throw new Error("Failed to retrieve Google tokens");
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log("User cancelled Google Sign-In");
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log("Google Sign-In already in progress");
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert(
          "Google Play Services",
          "Google Play Services are unavailable or need an update."
        );
      } else {
        Alert.alert(
          "Sign-In Failed",
          error.message || "An unexpected error occurred."
        );
      }
    } finally {
      setActiveAuthMode(null);
    }
  };

  const handleBackendLogin = async (payload: {
    idToken?: string;
    googleAccessToken?: string;
  }): Promise<void> => {
    if (!isConnected) {
      showToast({ title: "No internet connection. Please check your network." });
      return;
    }
    try {
      const { data } = await api.post(BACKEND_LOGIN_URL, {
        provider: "google",
        ...payload,
      });

      const tokenData = JSON.stringify({
        token: data.token,
        expiry: data.expiry,
      });
      await SecureStore.setItemAsync("accessToken", tokenData);
      await AsyncStorage.setItem("accessToken", tokenData);

      if (data?.user) {
        await AsyncStorage.setItem(
          "cached_user_profile",
          JSON.stringify(data.user)
        );
        await AsyncStorage.setItem(
          "recent_session_account",
          JSON.stringify({
            name: data.user.name,
            email: data.user.email,
            image: data.user.image,
          })
        );
        setCachedUser(data.user);
      }

      await AsyncStorage.removeItem("pending_deletion_info").catch(() => {});
      setPendingDeletion(null);

      if (data?.wasDeletionCancelled) {
        showToast({ title: "Welcome back! Account deletion cancelled." });
      } else {
        showToast({ title: "Welcome back!" });
      }

      if (setAuthSession) {
        await setAuthSession(data.token, data.user);
      } else {
        await reload(data.token);
      }

      if (data?.isNewUser) {
        navigation.replace("ReferralCodeScreen");
      } else if (data?.user?.isProfileCompleted === false) {
        navigation.replace("ProfileCreation");
      } else {
        navigation.replace("Tabs");
      }
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        (err.message === "Network Error"
          ? "Unable to reach server. Please check your internet connection and try again."
          : err.message) ||
        "Authentication failed. Please try again.";
      Alert.alert("Sign-In Error", errorMsg);
    }
  };

  const renderGoogleIcon = (size = 20) => (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <G>
        <Path
          d="M23.75,16A7.7446,7.7446,0,0,1,8.7177,18.6259L4.2849,22.1721A13.244,13.244,0,0,0,29.25,16"
          fill="#00AC47"
        />
        <Path
          d="M23.75,16a7.7387,7.7387,0,0,1-3.2516,6.2987l4.3824,3.5059A13.2042,13.2042,0,0,0,29.25,16"
          fill="#4285F4"
        />
        <Path
          d="M8.25,16a7.698,7.698,0,0,1,.4677-2.6259L4.2849,9.8279a13.177,13.177,0,0,0,0,12.3442l4.4328-3.5462A7.698,7.698,0,0,1,8.25,16Z"
          fill="#FFBA00"
        />
        <Path
          d="M16,8.25a7.699,7.699,0,0,1,4.558,1.4958l4.06-3.7893A13.2152,13.2152,0,0,0,4.2849,9.8279l4.4328,3.5462A7.756,7.756,0,0,1,16,8.25Z"
          fill="#EA4335"
        />
        <Path
          d="M29.25,15v1L27,19.5H16.5V14H28.25A1,1,0,0,1,29.25,15Z"
          fill="#4285F4"
        />
      </G>
    </Svg>
  );

  return (
    <ImageBackground
      source={require("../../assets/background.png")}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.contentContainer}>
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <Image
            source={require("../../assets/textIcon.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Bottom Action Section */}
        <View style={styles.actionContainer}>
          {pendingDeletion && (
            <View style={styles.deletionCard}>
              <View style={styles.deletionCardTop}>
                <View style={styles.deletionIconWrap}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                      stroke="#F59E0B"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <Path
                      d="M12 6V12L16 14"
                      stroke="#F59E0B"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
                <View style={styles.deletionTextWrap}>
                  <Text style={styles.deletionCardTitle}>
                    Account Deletion Scheduled
                  </Text>
                  <Text style={styles.deletionCardSub}>
                    In a 48-hour grace period. Signing in cancels deletion
                    immediately.
                  </Text>
                </View>
              </View>
              <TactilePillButton
                style={styles.deletionCardBtn}
                onPress={() =>
                  Linking.openURL(
                    getAccountDeletionUrl(
                      pendingDeletion.token,
                      pendingDeletion.email
                    )
                  )
                }
                accessibilityLabel="Check status or cancel deletion request"
              >
                <Text style={styles.deletionCardBtnText}>
                  Manage Deletion Request
                </Text>
              </TactilePillButton>
            </View>
          )}

          {cachedUser ? (
            <View style={styles.smartLoginContainer}>
              {/* Primary Pill: Saved Account One-Tap Continue */}
              <TactilePillButton
                style={styles.cachedUserButton}
                onPress={() => handleGoogleSignIn(false)}
                disabled={isLoadingUi}
                accessibilityLabel={`${getDisplayTitle(cachedUser.name)} ${
                  cachedUser.email || ""
                }`}
              >
                <View style={styles.avatarWrapper}>
                  {cachedUser.image && !avatarError ? (
                    <Image
                      source={{ uri: cachedUser.image }}
                      style={styles.avatarImage}
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {getInitials(cachedUser.name || cachedUser.email)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.smallGoogleIconWrap}>
                    {renderGoogleIcon(13)}
                  </View>
                </View>

                <View style={styles.cachedUserTextWrap}>
                  <Text style={styles.cachedUserTitle} numberOfLines={1}>
                    {getDisplayTitle(cachedUser.name)}
                  </Text>
                  {!!cachedUser.email && (
                    <Text style={styles.cachedUserEmail} numberOfLines={1}>
                      {cachedUser.email}
                    </Text>
                  )}
                </View>

                {activeAuthMode === "cached" && (
                  <ActivityIndicator
                    size="small"
                    color="#0F172A"
                    style={styles.inlineSpinner}
                  />
                )}
              </TactilePillButton>

              {/* Secondary Pill: Switch / Use Another Account */}
              <TactilePillButton
                style={styles.secondaryGoogleButton}
                onPress={() => handleGoogleSignIn(true)}
                disabled={isLoadingUi}
                accessibilityLabel="Use another Google account"
              >
                {activeAuthMode === "new" ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    {renderGoogleIcon(21)}
                    <Text style={styles.secondaryGoogleButtonText}>
                      Use another Google account
                    </Text>
                  </>
                )}
              </TactilePillButton>
            </View>
          ) : (
            /* Default Single Pill: Fresh Sign-In */
            <TactilePillButton
              style={styles.primaryGoogleButton}
              onPress={() => handleGoogleSignIn(true)}
              disabled={isLoadingUi}
              accessibilityLabel="Continue with Google"
            >
              {activeAuthMode === "new" ? (
                <ActivityIndicator size="small" color="#0F172A" />
              ) : (
                <>
                  {renderGoogleIcon(22)}
                  <Text style={styles.primaryGoogleButtonText}>
                    Continue with Google
                  </Text>
                </>
              )}
            </TactilePillButton>
          )}

          <Text style={styles.footerText}>
            By continuing, you agree to our{" "}
            <Text
              style={styles.linkText}
              onPress={() =>
                Linking.openURL(
                  getAccountDeletionUrl().replace(
                    "/delete-account",
                    "/terms-and-safety.txt"
                  )
                )
              }
            >
              Terms
            </Text>{" "}
            &{" "}
            <Text
              style={styles.linkText}
              onPress={() =>
                Linking.openURL(
                  getAccountDeletionUrl().replace(
                    "/delete-account",
                    "/privacy-policy.txt"
                  )
                )
              }
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain,
  },
  contentContainer: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "ios" ? 110 : 90,
    paddingBottom: Platform.OS === "ios" ? 42 : 32,
  },
  brandHeader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoImage: {
    width: Math.min(SCREEN_WIDTH * 0.85, 360),
    height: 180,
  },
  actionContainer: {
    width: "100%",
  },
  smartLoginContainer: {
    gap: 14,
  },

  /* Primary Cached Account Pill (Matches Reference Top Button) */
  cachedUserButton: {
    minHeight: 70,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 22,
    paddingVertical: 11,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarWrapper: {
    position: "relative",
    marginRight: 14,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E2E8F0",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EA88B5",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  smallGoogleIconWrap: {
    position: "absolute",
    bottom: -2,
    right: -3,
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    padding: 2.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  cachedUserTextWrap: {
    flex: 1,
    justifyContent: "center",
  },
  cachedUserTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  cachedUserEmail: {
    fontSize: 13.5,
    fontWeight: "400",
    color: "#5F6368",
    marginTop: 2,
  },
  inlineSpinner: {
    marginLeft: 10,
  },

  /* Secondary Dark Pill (Matches Reference Bottom Button) */
  secondaryGoogleButton: {
    height: 62,
    borderRadius: 999,
    backgroundColor: "rgba(18, 18, 22, 0.85)",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    borderWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  secondaryGoogleButtonText: {
    marginLeft: 12,
    fontSize: 16.5,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },

  /* Default Single White Pill (When No Cached User Exists) */
  primaryGoogleButton: {
    height: 62,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryGoogleButtonText: {
    marginLeft: 12,
    fontSize: 16.5,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.1,
  },

  /* Legal Footer */
  footerText: {
    marginTop: 20,
    textAlign: "center",
    color: pallete.textgray,
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  linkText: {
    color: pallete.textwhite,
    textDecorationLine: "underline",
    fontWeight: "600",
  },

  /* Pending Account Deletion Card */
  deletionCard: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
  },
  deletionCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  deletionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  deletionTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  deletionCardTitle: {
    color: "#FBBF24",
    fontSize: 14,
    fontWeight: "700",
  },
  deletionCardSub: {
    color: "#E5E7EB",
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  deletionCardBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 999,
    backgroundColor: "#F59E0B",
    justifyContent: "center",
    alignItems: "center",
  },
  deletionCardBtnText: {
    color: "#090D16",
    fontSize: 13.5,
    fontWeight: "700",
  },
});

export default Login;