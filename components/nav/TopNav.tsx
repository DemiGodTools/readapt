import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import pallete from "../../lib/Colors";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "./MainNavigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "../../hooks/useUser";
import PlanPill from "./PlanPill";
import StreakBadge from "../props/StreakBadge";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const TopNav = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useUser();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Smart new-vs-returning user detection:
  // Synchronous check on mount so there is zero layout flicker
  const [isNewUser, setIsNewUser] = useState<boolean>(() => {
    if (!user) return false;
    const createdTime = user.createdAt ? new Date(user.createdAt).getTime() : 0;
    const isRecent = createdTime > 0 && Date.now() - createdTime < 36 * 60 * 60 * 1000;
    const hasActivity = Boolean(
      (user.recentReads && user.recentReads.length > 0) ||
        ((user as any)?.questionsAttempted && (user as any).questionsAttempted.length > 0) ||
        ((user as any)?.streakData?.currentStreak && (user as any).streakData.currentStreak > 0)
    );
    return isRecent && !hasActivity;
  });

  useEffect(() => {
    const activeId = user?._id || (user as any)?.userId;
    if (!activeId) return;

    const checkUserStatus = async () => {
      try {
        const key = `readapt_first_seen_${activeId}`;
        const seen = await AsyncStorage.getItem(key);
        if (!seen) {
          const createdTime = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
          const isRecent = createdTime > 0 && Date.now() - createdTime < 48 * 60 * 60 * 1000;
          const hasActivity = Boolean(
            (user?.recentReads && user.recentReads.length > 0) ||
              ((user as any)?.questionsAttempted && (user as any).questionsAttempted.length > 0)
          );
          if (!hasActivity || isRecent) {
            setIsNewUser(true);
          }
          await AsyncStorage.setItem(key, Date.now().toString());
        } else {
          setIsNewUser(false);
        }
      } catch (_) {}
    };

    checkUserStatus();
  }, [user?._id, (user as any)?.userId, user?.createdAt, user?.recentReads?.length]);

  // Context-aware smart greeting:
  // - New user: "Welcome to Readapt!"
  // - Returning user: Time of day greeting ("Good Morning", "Good Afternoon", "Good Evening", or "Welcome Back!")
  const greetingSubtitle = useMemo(() => {
    if (isNewUser) {
      return "Welcome to Readapt!";
    }
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good Morning";
    if (hour >= 12 && hour < 17) return "Good Afternoon";
    if (hour >= 17 && hour < 22) return "Good Evening";
    return "Welcome Back!";
  }, [isNewUser]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <View style={[{ ...styles.navbar }, { paddingTop: insets.top, 
    height: 70 +insets.top, }]}>
      <View style={styles.leftContainer}>
        <Text style={styles.brandName} numberOfLines={1}>{user?.name || "Readapt User"}</Text>
        <Text style={styles.welcomeBack}>{greetingSubtitle}</Text>
      </View>

      <View style={styles.rightActions}>
        <StreakBadge />
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={() => navigation.navigate("Subscription")}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <PlanPill />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  navbar: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "rgba(5,5,5,0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 100,
  },
  leftContainer: {
    flex: 1,
    marginRight: 10,
    justifyContent: "center",
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandName: {
    fontWeight: "700",
    fontSize: 18,
    color: pallete.textwhite,
  },
  welcomeBack: {
    fontSize: 10,
    color: pallete.textgray,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "500",
  },
  subscriptionIcon: {
    width: 38,
    height: 38,
    backgroundColor: "linear-gradient(135deg, #01796F, #00A36C)",
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00A36C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
});

export default TopNav;
