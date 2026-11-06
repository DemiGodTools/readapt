import { useEffect, useState, useCallback } from "react";
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
import PopButton from "../../components/props/PopButton";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { useUser } from "../../hooks/useUser";

type Props = {
  route: RouteProp<ParamListBase, "Login">;
  navigation: any;
};

const BACKEND_LOGIN_URL = "/auth/login";

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

const Login = ({ navigation }: Props) => {
  const { isLoggedIn, isLoading } = useAuth();
  const { showToast } = useToast();
  const { reload, setAuthSession } = useUser() as any;
  const [isLoadingUi, setIsLoadingUi] = useState(false);
  const { isConnected } = useNetworkStatus();
  
  const [cachedUser, setCachedUser] = useState<any>(null);
  const [pendingDeletion, setPendingDeletion] = useState<{
    token: string;
    scheduledAt?: string;
    email?: string;
  } | null>(null);

  const checkPendingDeletion = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem("pending_deletion_info");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.token || parsed?.email) {
          setPendingDeletion(parsed);

          // Verify live status with backend
          try {
            const res = await api.get("/user/deletion/status", {
              params: {
                token: parsed.token || undefined,
                email: parsed.email || undefined,
              },
            });

            if (res?.data?.success) {
              if (res.data.status !== "PENDING_DELETION") {
                // Cancelled from web, restored by admin, or no longer pending
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
        setCachedUser(JSON.parse(userData));
      }
    } catch (error) {
      console.log("Failed to load cached user", error);
    }
  }, []);

  // Initial load and focus listeners
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
      webClientId: "743066184878-es8jqus96o8ip2qlrmd7md7n5o5j8ndv.apps.googleusercontent.com",
      offlineAccess: true,
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      navigation.replace("Tabs");
    }
  }, [isLoading, isLoggedIn]);

  const handleGoogleSignIn = async (useAnotherAccount = false) => {
    try {
      setIsLoadingUi(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      if (useAnotherAccount) {
        try {
          await GoogleSignin.signOut();
        } catch (e) {
          console.log("Already signed out:", e);
        }
      }

      const response: any = await GoogleSignin.signIn();
      if (response?.type === "cancelled") {
        setIsLoadingUi(false);
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
        Alert.alert("Error", "Google Play Services are not available or updated.");
      } else {
        Alert.alert("Login Failed", error.message || "An unexpected error occurred.");
      }
    } finally {
      setIsLoadingUi(false);
    }
  };

  const handleBackendLogin = async (payload: { idToken?: string; googleAccessToken?: string }): Promise<void> => {
    if (!isConnected) {
      showToast({ title: "Please connect to the Internet." });
      return;
    }
    try {
      const { data } = await api.post(BACKEND_LOGIN_URL, {
        provider: "google",
        ...payload,
      });

      const tokenData = JSON.stringify({ token: data.token, expiry: data.expiry });
      await SecureStore.setItemAsync("accessToken", tokenData);
      await AsyncStorage.setItem("accessToken", tokenData);

      if (data?.user) {
        await AsyncStorage.setItem("cached_user_profile", JSON.stringify(data.user));
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
        showToast({ title: "Welcome back! Deletion cancelled." });
      } else {
        showToast({ title: "You're Welcome" });
      }
      if (setAuthSession) {
        await setAuthSession(data.token, data.user);
      } else {
        await reload(data.token);
      }
      navigation.replace("Tabs");
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        (err.message === "Network Error"
          ? "Unable to reach server. Please ensure the backend is running and you are connected to the same Wi-Fi network."
          : err.message) ||
        "Backend login failed";
      Alert.alert("Login Error", errorMsg);
    }
  };

  const renderGoogleIcon = (size = 20) => (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <G>
        <Path d="M23.75,16A7.7446,7.7446,0,0,1,8.7177,18.6259L4.2849,22.1721A13.244,13.244,0,0,0,29.25,16" fill="#00AC47" />
        <Path d="M23.75,16a7.7387,7.7387,0,0,1-3.2516,6.2987l4.3824,3.5059A13.2042,13.2042,0,0,0,29.25,16" fill="#4285F4" />
        <Path d="M8.25,16a7.698,7.698,0,0,1,.4677-2.6259L4.2849,9.8279a13.177,13.177,0,0,0,0,12.3442l4.4328-3.5462A7.698,7.698,0,0,1,8.25,16Z" fill="#FFBA00" />
        <Path d="M16,8.25a7.699,7.699,0,0,1,4.558,1.4958l4.06-3.7893A13.2152,13.2152,0,0,0,4.2849,9.8279l4.4328,3.5462A7.756,7.756,0,0,1,16,8.25Z" fill="#EA4335" />
        <Path d="M29.25,15v1L27,19.5H16.5V14H28.25A1,1,0,0,1,29.25,15Z" fill="#4285F4" />
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
        <View style={styles.brandHeader}>
          <Image
            source={require("../../assets/textIcon.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

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
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.deletionCardTitle}>Account Deletion Scheduled</Text>
                  <Text style={styles.deletionCardSub}>
                    Account is in a 48h grace period. Logging in cancels deletion instantly.
                  </Text>
                </View>
              </View>
              <PopButton
                styles={styles.deletionCardBtn}
                onPress={() => Linking.openURL(getAccountDeletionUrl(pendingDeletion.token, pendingDeletion.email))}
              >
                <Text style={styles.deletionCardBtnText}>Check Status / Cancel Request</Text>
              </PopButton>
            </View>
          )}

          {isLoadingUi ? (
            <View style={styles.loadingWrapper}>
              <ActivityIndicator size="large" color="#00D2B4" />
            </View>
          ) : cachedUser ? (
            <View style={styles.smartLoginContainer}>
              {/* Recent session account button (TOP) */}
              <PopButton 
                styles={styles.cachedUserButton} 
                onPress={() => handleGoogleSignIn(false)}
              >
                <View style={styles.avatarWrapper}>
                  {cachedUser.image ? (
                    <Image source={{ uri: cachedUser.image }} style={styles.avatarImage} />
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
                    {cachedUser.name || "Continue with account"}
                  </Text>
                  <Text style={styles.cachedUserEmail} numberOfLines={1}>
                    {cachedUser.email}
                  </Text>
                </View>

                <View style={styles.continuePill}>
                  <Text style={styles.continuePillText}>Continue</Text>
                </View>
              </PopButton>

              {/* Secondary button: Use another Google account */}
              <PopButton 
                styles={styles.secondaryGoogleButton} 
                onPress={() => handleGoogleSignIn(true)}
              >
                {renderGoogleIcon(20)}
                <Text style={styles.secondaryGoogleButtonText}>Use another Google account</Text>
              </PopButton>
            </View>
          ) : (
            <PopButton styles={styles.googleButton} onPress={() => handleGoogleSignIn(true)}>
              {renderGoogleIcon(20)}
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </PopButton>
          )}

          <Text style={styles.footerText}>
            By continuing, you agree to our{" "}
            <Text
              style={styles.linkText}
              onPress={() =>
                Linking.openURL(
                  getAccountDeletionUrl().replace("/delete-account", "/terms-and-safety.txt")
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
                  getAccountDeletionUrl().replace("/delete-account", "/privacy-policy.txt")
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
  container: { flex: 1, backgroundColor: pallete.bgmain },
  contentContainer: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 160, paddingBottom: 48 },
  brandHeader: { alignItems: "center" },
  logoImage: { width: 620, height: 300 },
  actionContainer: { width: "100%" },
  googleButton: { height: 58, borderRadius: 16, backgroundColor: "#fff", flexDirection: "row", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#64646b" },
  googleButtonText: { marginLeft: 14, fontSize: 16, fontWeight: "700", color: "#303030" },
  smartLoginContainer: { gap: 14 },
  cachedUserButton: { height: 76, borderRadius: 24, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.4)" },
  avatarWrapper: { position: "relative", marginRight: 14 },
  avatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#e2e8f0" },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00D2B4", justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#0f172a", fontSize: 16, fontWeight: "700" },
  smallGoogleIconWrap: { position: "absolute", bottom: -2, right: -2, backgroundColor: "#fff", borderRadius: 10, padding: 2, elevation: 2 },
  cachedUserTextWrap: { flex: 1, justifyContent: "center" },
  cachedUserTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  cachedUserEmail: { fontSize: 13, color: "#666", marginTop: 2 },
  continuePill: { backgroundColor: "#00D2B4", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginLeft: 8 },
  continuePillText: { color: "#0f172a", fontSize: 12, fontWeight: "700" },
  secondaryGoogleButton: { height: 58, borderRadius: 24, backgroundColor: "rgba(0, 0, 0, 0.7)", flexDirection: "row", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.2)" },
  secondaryGoogleButtonText: { marginLeft: 14, fontSize: 15, fontWeight: "600", color: "#fff" },
  linkText: { color: pallete.textwhite, textDecorationLine: "underline", fontWeight: "600" },
  loadingWrapper: { flexDirection: "row", justifyContent: "center", alignItems: "center", height: 58, gap: 10 },
  footerText: { marginTop: 18, textAlign: "center", color: pallete.textgray, fontSize: 12, lineHeight: 18 },
  deletionCard: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  deletionCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  deletionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  deletionCardTitle: {
    color: "#f59e0b",
    fontSize: 14,
    fontWeight: "700",
  },
  deletionCardSub: {
    color: "#d1d5db",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  deletionCardBtn: {
    marginTop: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f59e0b",
    justifyContent: "center",
    alignItems: "center",
  },
  deletionCardBtnText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "700",
  },
});

export default Login;
