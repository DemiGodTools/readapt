import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
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
import { api } from "../../lib/api";
import PopButton from "../../components/props/PopButton";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { useUser } from "../../hooks/useUser";

type Props = {
  route: RouteProp<ParamListBase, "Login">;
  navigation: any;
};

const BACKEND_LOGIN_URL = "/auth/login";

GoogleSignin.configure({
  webClientId:
    "743066184878-es8jqus96o8ip2qlrmd7md7n5o5j8ndv.apps.googleusercontent.com",
  offlineAccess: true,
});

const Login = ({ navigation }: Props) => {
  const { isLoggedIn, isLoading, checkLogin } = useAuth();
  const { showToast } = useToast();
  const { reload } = useUser();
  const [isLoadingUi, setIsLoadingUi] = useState(false);
  const { isConnected } = useNetworkStatus();

  useEffect(() => {
    if (isLoggedIn) {
      navigation.replace("Tabs");
      checkLogin();
    }
  }, [isLoading, isLoggedIn]);

const handleGoogleSignIn = async () => {
    try {
      setIsLoadingUi(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (response.type === "cancelled") return;
      const tokens = await GoogleSignin.getTokens();

      const tokenToSend = tokens.accessToken || idToken;
      if (tokenToSend) {
        await handleBackendLogin(tokenToSend);
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

  const handleBackendLogin = async (googleAccessToken: string): Promise<void> => {
    if (!isConnected) {
      showToast({
        title: "Please connect to the Internet.",
      });
      return;
    }
    try {
      const { data } = await api.post(BACKEND_LOGIN_URL, {
        provider: "google",
        googleAccessToken,
      });

      await SecureStore.setItemAsync(
        "accessToken",
        JSON.stringify({ token: data.token, expiry: data.expiry })
      );

      // Cache user info immediately taaki restart ki zaroorat na pade
      if (data?.user) {
        await AsyncStorage.setItem("cached_user_profile", JSON.stringify(data.user));
      }

      showToast({
        title: "You're Welcome",
      });

      reload();
      navigation.replace("Tabs");
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.response?.data?.message || err.message || "Backend login failed"
      );
    }
  };

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
          {isLoadingUi ? (
            <View style={styles.loadingWrapper}>
              <ActivityIndicator size="small" color={pallete.textwhite} />
            </View>
          ) : (
            <PopButton styles={styles.googleButton} onPress={handleGoogleSignIn}>
              <Svg width={20} height={20} viewBox="0 0 32 32">
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
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </PopButton>
          )}

          <Text style={styles.footerText}>
            By continuing, you agree to our{" "}
            <Text
              style={styles.linkText}
              onPress={() =>
                Linking.openURL(
                  "https://drive.google.com/file/d/1N4WK0jX7ZDYXMTSgWLc51LQOrQoZ-8hR/view"
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
                  "https://drive.google.com/file/d/1bcqXVKT4yyC3PCPlttcxuARzA1IHob2Z/view"
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
    paddingHorizontal: 24,
    paddingTop: 160,
    paddingBottom: 48,
  },
  brandHeader: {
    alignItems: "center",
  },
  logoImage: {
    width: 620,
    height: 300,
  },
  actionContainer: {
    width: "100%",
  },
  googleButton: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#64646b",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  googleButtonText: {
    marginLeft: 14,
    fontSize: 16,
    fontWeight: "700",
    color: "#303030",
  },
  linkText: {
    color: pallete.textwhite,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  loadingWrapper: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: 58,
    gap: 10,
  },
  footerText: {
    marginTop: 18,
    textAlign: "center",
    color: pallete.textgray,
    fontSize: 12,
    lineHeight: 18,
  },
});

export default Login;