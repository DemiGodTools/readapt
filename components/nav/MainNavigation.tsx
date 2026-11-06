import { createNavigationContainerRef, NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
import { useUser } from "../../hooks/useUser";
import AudioControls from "../props/AudioControls";
import { useToast } from "../../hooks/useToast";
import { useNetworkStatus } from "../../hooks/useNetwork";
import { configureApiInterceptor } from "../../lib/api";
import { ISubCategory } from "../../types/Category";

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
  SubCategoryOverview: {
    subCategoryId: string;
    categoryId?: string;
    categoryName?: string;
    subCategory?: ISubCategory;
  };
  SearchScreen?: { initialQuery?: string };
};

export const navigationRef = createNavigationContainerRef()

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
          // The "any" type resolves the TS strictness error preventing compilation
          screenOptions={({ navigation }: any) => ({
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

          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {(props) => <Login {...props} />}
          </Stack.Screen>

          <Stack.Screen 
            name="SeriesOverview" 
            component={SeriesOverview} 
            options={{ headerShown: false }} 
          />

          <Stack.Screen name="ReadBook">
            {(props) => <ReadBook {...props} />}
          </Stack.Screen>
          
          <Stack.Screen
            name="AudioRdr"
            options={{
              gestureEnabled: true,
              gestureDirection: "vertical",
              cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
            }}
          >
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

          <Stack.Screen name="Splash">
            {(props) => <SplashScreen {...props} />}
          </Stack.Screen>

          <Stack.Screen name="Subscription" component={Subscription} />

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
              cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            }}
          />

          <Stack.Screen 
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: false,
              cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            }}
          />
          
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}