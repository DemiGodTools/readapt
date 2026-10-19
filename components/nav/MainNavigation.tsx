import { createNavigationContainerRef, NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import {
  SafeAreaProvider,
} from "react-native-safe-area-context";

import { useState } from "react";
import { useEffect } from "react";
import useAuth from "../../hooks/useAuth";
import BotttomNav from "./BotttomNav";
import Login from "../../app/screens/Login";
import SeriesOverview from "../../app/screens/SeriesOverview";
import ReadBook from "../../app/screens/ReadBook";
import AudioRdr from "../../app/screens/AudioRdr";
import Subscription from "../../app/screens/Subscription";
import BackNav from "./BackNav";
import RecentReads from "../../app/screens/history/RecentReads";
import LikedContent from "../../app/screens/history/LikedContent";
import About from "../../app/screens/About";
import SplashScreen from "../../app/screens/Splash";
import { useUser } from "../../hooks/useUser";
import AudioControls from "../props/AudioControls";
import { useToast } from "../../hooks/useToast";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { configureApiInterceptor } from "../../lib/api";

export type RootStackParamList = {
  Tabs: undefined;
  SeriesOverview: { seriesId: string };
  Login: undefined;
  ReadBook: { bookId: string };
  AudioRdr: { bookId: string };
  Subscription: undefined;
  About: undefined;
  RecentReads: undefined;
  Splash: undefined;
  LikedContent: undefined;
};

export const navigationRef = createNavigationContainerRef()

// FIX: Move this out here so it never gets recreated on re-renders
const Stack = createStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#090314",
    card: "rgb(12, 7, 26)",
  },
};

export default function MainNavigation() {
  const {isLoggedIn, isLoading} = useAuth();
  const {user, loadingUser} = useUser()
  const [initialPage, setinitialPage] =
    useState<keyof RootStackParamList>("Splash");

  const checkSubscription = async () => {
    const now = new Date()
    if(user?.subscription.plan && user.subscription.expiresOn) {
      const expiryDate = new Date(user?.subscription.expiresOn)
      console.log(now, expiryDate)
    }
  }

  useEffect(() => {
    if (!isLoading) {
      if (!isLoggedIn) {
        setinitialPage("Login");
      } else {
        checkSubscription()
        setinitialPage("Tabs");
      }
    }
  }, [isLoggedIn, isLoading]);


  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();

  useEffect(() => {
    configureApiInterceptor(Boolean(isConnected), (msg) => {
      showToast({ title: "This function is not available offline"});
    });
  }, [isConnected, showToast]);

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <Stack.Navigator
          initialRouteName={initialPage}
          screenOptions={({ navigation }) => ({
            cardStyle: {
              paddingBottom: 0,
              backgroundColor: "#090314",
            },
            headerShown: true,
            headerTransparent: false,
            headerStyle: {
              backgroundColor: "#090314",
              elevation: 0,
              shadowOpacity: 0,
            },
            header: () => (
              <BackNav
                onBackPress={() => navigation.goBack()}
                onSubscriptionPress={() => navigation.navigate("Subscription")}
              />
            ),
          })}>
          <Stack.Screen
            name="Tabs"
            component={BotttomNav}
            options={{ headerShown: false }}
          />

          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {(props) => <Login {...props} />}
          </Stack.Screen>

          <Stack.Screen name="SeriesOverview">
            {(props) => <SeriesOverview {...props} />}
          </Stack.Screen>

          <Stack.Screen name="ReadBook">
            {(props) => <ReadBook {...props} />}
          </Stack.Screen>
          <Stack.Screen name="AudioRdr">
            {(props) => <AudioRdr {...props} />}
          </Stack.Screen>

          <Stack.Screen name="RecentReads">
            {(props) => <RecentReads {...props} />}
          </Stack.Screen>

          <Stack.Screen name="LikedContent">
            {(props) => <LikedContent {...props} />}
          </Stack.Screen>

          <Stack.Screen name="About">
            {(props) => <About {...props} />}
          </Stack.Screen>

          <Stack.Screen name="Splash">
            {(props) => <SplashScreen {...props} />}
          </Stack.Screen>

          <Stack.Screen name="Subscription" component={Subscription} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
