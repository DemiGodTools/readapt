// File: components/nav/BottomNav.tsx
import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Vibration,
  useWindowDimensions,
} from "react-native";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

const Haptics = (() => {
  try {
    return require("expo-haptics");
  } catch {
    return {
      selectionAsync: async () => undefined,
      impactAsync: async () => undefined,
      ImpactFeedbackStyle: {
        Light: "Light",
        Medium: "Medium",
      },
    }
  }
})() as {
  selectionAsync: () => Promise<void>;
  impactAsync: (style: string) => Promise<void>;
  ImpactFeedbackStyle: {
    Light: string;
    Medium: string;
  };
};

import Home from "../../app/tabs/Home";
import Categories from "../../app/tabs/Categories";
import Search from "../../app/tabs/Search";
import Downloads from "../../app/tabs/Downloads";
import Profile from "../../app/tabs/Profile";
import TopNav from "./TopNav";

export type BottomTabParamList = {
  Home: undefined;
  Categories: undefined;
  Search: undefined;
  Downloads: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

const fireTabHaptic = (intensity: "pressIn" | "select" | "longPress") => {
  try {
    if (intensity === "pressIn") {
      Haptics.selectionAsync().catch(() => Vibration.vibrate(4));
    } else if (intensity === "select") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() =>
        Vibration.vibrate(8)
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() =>
        Vibration.vibrate(14)
      );
    }
  } catch {
    try {
      Vibration.vibrate(8);
    } catch {}
  }
};

interface MD3TabItemProps {
  name: keyof BottomTabParamList;
  label: string;
  isFocused: boolean;
  isCompact: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

const MD3TabItem = React.memo(
  ({
    name,
    label,
    isFocused,
    isCompact,
    onPress,
    onLongPress,
  }: MD3TabItemProps) => {
    const pillScale = useRef(new Animated.Value(isFocused ? 1 : 0.72)).current;
    const pillOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
    const iconTranslateY = useRef(new Animated.Value(isFocused ? -1.5 : 0)).current;
    const pressScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.spring(pillScale, {
          toValue: isFocused ? 1 : 0.72,
          damping: 15,
          stiffness: 220,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(pillOpacity, {
          toValue: isFocused ? 1 : 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(iconTranslateY, {
          toValue: isFocused ? -1.5 : 0,
          damping: 14,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, [isFocused, pillScale, pillOpacity, iconTranslateY]);

    const handlePressIn = useCallback(() => {
      fireTabHaptic("pressIn");
      Animated.spring(pressScale, {
        toValue: 0.92,
        damping: 16,
        stiffness: 300,
        useNativeDriver: true,
      }).start();
    }, [pressScale]);

    const handlePressOut = useCallback(() => {
      Animated.spring(pressScale, {
        toValue: 1,
        damping: 14,
        stiffness: 240,
        useNativeDriver: true,
      }).start();
    }, [pressScale]);

    const activeColor = "#2DD4BF";
    const inactiveColor = "#94A3B8";

    const renderIcon = () => {
      switch (name) {
        case "Home":
          return (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path
                d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H4.5A1.5 1.5 0 0 1 3 20v-9.5z"
                fill={isFocused ? "rgba(45, 212, 191, 0.22)" : "none"}
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.9 : 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          );
        case "Categories":
          return (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Rect
                x="3.5"
                y="3.5"
                width="6.8"
                height="6.8"
                rx="2"
                fill={isFocused ? "rgba(45, 212, 191, 0.28)" : "none"}
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.8 : 1.6}
              />
              <Rect
                x="13.7"
                y="3.5"
                width="6.8"
                height="6.8"
                rx="2"
                fill={isFocused ? "rgba(45, 212, 191, 0.28)" : "none"}
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.8 : 1.6}
              />
              <Rect
                x="3.5"
                y="13.7"
                width="6.8"
                height="6.8"
                rx="2"
                fill={isFocused ? "rgba(45, 212, 191, 0.28)" : "none"}
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.8 : 1.6}
              />
              <Rect
                x="13.7"
                y="13.7"
                width="6.8"
                height="6.8"
                rx="2"
                fill={isFocused ? "rgba(45, 212, 191, 0.28)" : "none"}
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.8 : 1.6}
              />
            </Svg>
          );
        case "Search":
          return (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Circle
                cx="11"
                cy="11"
                r="7"
                fill={isFocused ? "rgba(45, 212, 191, 0.22)" : "none"}
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 2.1 : 1.6}
              />
              <Path
                d="M20 20L16.2 16.2"
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 2.3 : 1.7}
                strokeLinecap="round"
              />
            </Svg>
          );
        case "Downloads":
          return (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path
                d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15"
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.9 : 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M7 10L12 15L17 10M12 15V3"
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.9 : 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          );
        case "Profile":
          return (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path
                d="M20 21C20 18.2386 17.7614 16 15 16H9C6.23858 16 4 18.2386 4 21"
                fill={isFocused ? "rgba(45, 212, 191, 0.22)" : "none"}
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.9 : 1.6}
                strokeLinecap="round"
              />
              <Circle
                cx="12"
                cy="7"
                r="4"
                fill={isFocused ? "rgba(45, 212, 191, 0.22)" : "none"}
                stroke={isFocused ? activeColor : inactiveColor}
                strokeWidth={isFocused ? 1.9 : 1.6}
              />
            </Svg>
          );
      }
    };

    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        style={styles.tabButton}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        android_ripple={{
          color: "rgba(45, 212, 191, 0.12)",
          borderless: true,
          radius: 34,
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <Animated.View
          style={[
            styles.tabInnerWrap,
            { transform: [{ scale: pressScale }] },
          ]}
        >
          <View
            style={[
              styles.pillContainer,
              isCompact && { width: 50, height: 30 },
            ]}
          >
            <Animated.View
              style={[
                styles.md3Pill,
                isCompact && { width: 48, height: 30 },
                {
                  opacity: pillOpacity,
                  transform: [{ scaleX: pillScale }, { scaleY: pillScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.iconWrap,
                { transform: [{ translateY: iconTranslateY }] },
              ]}
            >
              {renderIcon()}
            </Animated.View>
          </View>

          <Text
            style={[
              styles.tabLabel,
              isCompact && { fontSize: 10 },
              {
                color: isFocused ? activeColor : inactiveColor,
                fontWeight: isFocused ? "700" : "500",
              },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    );
  }
);

const MD3TabBar = ({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) => {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isTablet = width >= 768;

  return (
    <View style={styles.outerDockWrap}>
      <View
        style={[
          styles.navContainer,
          isTablet && styles.navContainerTablet,
          {
            paddingBottom: Math.max(insets.bottom, 8),
            height: 66 + Math.max(insets.bottom, 8),
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? (options.tabBarLabel as string)
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            fireTabHaptic("select");
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            fireTabHaptic("longPress");
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <MD3TabItem
              key={route.key}
              name={route.name as keyof BottomTabParamList}
              label={label}
              isFocused={isFocused}
              isCompact={isCompact}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
};

export default function BottomNav() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <MD3TabBar {...props} />}
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        header: () => <TopNav />,
      }}
    >
      <Tab.Screen name="Home" component={Home} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Categories" component={Categories} options={{ tabBarLabel: "Categories", headerShown: false }} />
      <Tab.Screen name="Search" component={Search} options={{ tabBarLabel: "Search", headerShown: false }} />
      <Tab.Screen name="Downloads" component={Downloads} options={{ tabBarLabel: "Downloads" }} />
      <Tab.Screen name="Profile" component={Profile} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  outerDockWrap: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "rgb(12, 7, 26)",
  },
  navContainer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(12, 7, 26, 0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(45, 212, 191, 0.14)",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    paddingTop: 6,
  },
  navContainerTablet: {
    maxWidth: 560,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.18)",
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  tabInnerWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  pillContainer: {
    width: 58,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  md3Pill: {
    position: "absolute",
    width: 56,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(1, 121, 111, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.42)",
  },
  iconWrap: {
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 3,
    letterSpacing: 0.2,
  },
});
