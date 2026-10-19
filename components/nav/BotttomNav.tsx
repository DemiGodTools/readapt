import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import Svg, { Circle, Path } from "react-native-svg";
import Home from "../../app/tabs/Home";
import Downloads from "../../app/tabs/Downloads";
import Profile from "../../app/tabs/Profile";
import TopNav from "./TopNav";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Tab = createBottomTabNavigator();

function BottomNav() {
  
    const insets = useSafeAreaInsets();
    
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        header: () => <TopNav />,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: "rgb(12, 7, 26)",
          borderTopWidth: 1,
          borderColor: "#ffffff1a",
          height: 70 + insets.bottom,
        },
        tabBarInactiveTintColor: "#9ca3af",
        tabBarActiveTintColor: "#01796F",
      }}>
      <Tab.Screen
        name="Home"
        component={Home}
        options={{
          tabBarIcon: ({ color }) => (
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M9.02 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V10.27C3 9.94 3.08 9.62 3.25 9.35L8.25 3.35C8.66 2.85 9.28 2.57 9.93 2.59C10.58 2.62 11.18 2.94 11.55 3.48L15.55 9.48C15.82 9.88 16.29 10.12 16.78 10.12H19C20.1046 10.12 21 11.0154 21 12.12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H14.98" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M12 21V16" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ),
        }}
      />
      <Tab.Screen
        name="Downloads"
        component={Downloads}
        options={{
          tabBarIcon: ({ color }) => (
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M7 10L12 15L17 10" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M12 15V3" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={Profile}
        options={{
          tabBarIcon: ({ color }) => (
             <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M20 21C20 18.2386 17.7614 16 15 16H9C6.23858 16 4 18.2386 4 21" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default BottomNav;
