import React from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import pallete from "../../lib/Colors";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "./MainNavigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "../../hooks/useUser";
import PlanPill from "./PlanPill";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const TopNav = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const {user}= useUser()
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

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
      <View>
        <Text style={styles.brandName}>{user?.name || "Readapt User"}</Text>
        <Text style={styles.welcomeBack}>Welcome Back!</Text>
      </View>

      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => navigation.navigate("Subscription")}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <PlanPill />
        </Animated.View>
      </Pressable>
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
