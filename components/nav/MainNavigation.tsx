import { createNavigationContainerRef, NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useState, useEffect } from "react";
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
import TrendingBooks from "../../app/screens/TrendingBooks"; 
import AllSeries from "../../app/screens/AllSeries";
import About from "../../app/screens/About";
import SplashScreen from "../../app/screens/Splash";
import DailyRewards from "../../app/screens/DailyRewards";
import SubCategoryOverview from "../../app/screens/SubCategoryOverview";
import ProfileCreation from "../../app/screens/ProfileCreation"; 
import SearchScreen from "../../app/screens/SearchScreen"; 
import SettingsScreen from "../../app/screens/SettingsScreen"; 
import ReferralCodeScreen from "../../app/screens/ReferralCodeScreen";
import ReferAndEarnScreen from "../../app/screens/ReferAndEarnScreen"; 
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { configureApiInterceptor } from "../../lib/api";
import { ISubCategory } from "../../types/Category";
import { checkAppVersion, VersionInfo } from "../../lib/versionCheck";
import ForceUpdateModal from "../props/ForceUpdateModal";
import { registerForPushNotificationsAsync, setupNotificationListeners } from "../../lib/notifications";
import { ErrorBoundary } from "../props/ErrorBoundary";

export type RootStackParamList = {
  Tabs: undefined;
  SeriesOverview: { seriesId: string };
  Login: undefined;
  ReadBook: { bookId: string; initialBookData?: any; showQnaRequirementToast?: boolean };
  AudioRdr: { bookId: string; initialBookData?: any; showQnaRequirementToast?: boolean };
  Subscription: undefined;
  About: undefined;
  RecentReads: undefined;
  Splash: undefined;
  TrendingBooks: undefined;
  AllSeries: undefined;
  LikedContent: undefined;
  DailyRewards: undefined;
  ProfileCreation: undefined; 
  Settings: undefined; 
  ReferralCodeScreen?: { isTestMode?: boolean };
  ReferAndEarn: undefined;
  SubCategoryOverview: {
    subCategoryId: string;
    categoryId?: string;
    categoryName?: string;
    subCategory?: ISubCategory;
  };
  SearchScreen?: { initialQuery?: string };
};

export const navigationRef = createNavigationContainerRef();

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#090314",
    card: "rgb(12, 7, 26)",
  },
};

export default function MainNavigation() {
  const { isLoggedIn, isLoading } = useAuth();
  const { user } = useUser();
  const [initialPage, setInitialPage] =
    useState<keyof RootStackParamList>("Splash");

  useEffect(() => {
    if (!isLoading) {
      if (!isLoggedIn) {
        setInitialPage("Login");
      } else {
        setInitialPage("Tabs");
      }
    }
  }, [isLoggedIn, isLoading]);

  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();
  const [forceUpdateActive, setForceUpdateActive] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    registerForPushNotificationsAsync();
    const cleanup = setupNotificationListeners();
    return () => cleanup();
  }, []);

  useEffect(() => {
    checkAppVersion().then(({ shouldForceUpdate, versionInfo }) => {
      if (shouldForceUpdate) {
        setVersionInfo(versionInfo);
        setForceUpdateActive(true);
      }
    });
  }, []);

  useEffect(() => {
    configureApiInterceptor(Boolean(isConnected), () => {
      showToast({ title: "This function is not available offline" });
    });
  }, [isConnected, showToast]);

  return (
    <ErrorBoundary>
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <Stack.Navigator
          initialRouteName={initialPage}
          screenOptions={({ navigation }: any) => ({
            contentStyle: {
              backgroundColor: "#090314",
            },
            animation: "slide_from_right",
            headerShown: true,
            header: () => (
              <BackNav
                onBackPress={() => navigation?.goBack()}
                onSubscriptionPress={() => navigation?.navigate("Subscription")}
              />
            ),
          })}>
          <Stack.Screen
            name="Tabs"
            component={BotttomNav}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="Login"
            component={Login}
            options={{ headerShown: false }}
          />

          <Stack.Screen 
            name="SeriesOverview" 
            component={SeriesOverview} 
            options={{ headerShown: false }} 
          />

          <Stack.Screen
            name="ReadBook"
            component={ReadBook}
          />
          
          <Stack.Screen
            name="AudioRdr"
            component={AudioRdr}
            options={{
              animation: "slide_from_bottom",
            }}
          />

          <Stack.Screen
            name="RecentReads"
            component={RecentReads}
          />

          <Stack.Screen
            name="LikedContent"
            component={LikedContent}
          />

          <Stack.Screen
            name="About"
            component={About}
          />

          <Stack.Screen 
            name="TrendingBooks" 
            component={TrendingBooks} 
            options={{ headerShown: false }} 
          />

          <Stack.Screen 
            name="AllSeries" 
            component={AllSeries} 
            options={{ headerShown: false }} 
          />

          <Stack.Screen
            name="Splash"
            component={SplashScreen}
          />

          <Stack.Screen 
            name="Subscription" 
            component={Subscription} 
            options={{ headerShown: false }} 
          />

          <Stack.Screen 
            name="DailyRewards" 
            component={DailyRewards} 
            options={{ headerShown: false }} 
          />

          <Stack.Screen 
            name="ProfileCreation" 
            component={ProfileCreation} 
            options={{ headerShown: false }} 
          />

          <Stack.Screen 
            name="SubCategoryOverview"
            component={SubCategoryOverview}
          />

          <Stack.Screen 
            name="SearchScreen"
            component={SearchScreen}
            options={{
              headerShown: false,
            }}
          />

          <Stack.Screen 
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: false,
            }}
          />

          <Stack.Screen 
            name="ReferralCodeScreen"
            component={ReferralCodeScreen}
            options={{
              headerShown: false,
            }}
          />

          <Stack.Screen 
            name="ReferAndEarn"
            component={ReferAndEarnScreen}
            options={{
              headerShown: false,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>

      {/* Force Update Gate Modal */}
      <ForceUpdateModal visible={forceUpdateActive} versionInfo={versionInfo} />
    </ErrorBoundary>
  );
}
