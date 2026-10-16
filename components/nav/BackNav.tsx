import React from "react";
import { StyleSheet, View, TouchableOpacity, Platform, Dimensions } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";
import PopButton from "../props/PopButton";
import PlanPill from "./PlanPill";

const palette = {
  accent: "#01796F",
  textwhite: "#ffffff",
  paddingside: 24,
};

const {width } = Dimensions.get("window");

const BackNav = ({
  onBackPress,
  onSubscriptionPress,
}: {
  onBackPress: () => void;
  onSubscriptionPress: () => void;
}) => {

  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.navbarContainer, {paddingTop: insets.top + 5}]}>
      <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />

      <View style={[styles.navbarContent, {
    height: 30 + insets.top,}]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBackPress}
          activeOpacity={0.7}>
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Polyline
              points="15 18 9 12 15 6"
              stroke={palette.textwhite}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>
        <PopButton onPress={onSubscriptionPress}>
          <PlanPill />
        </PopButton>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  navbarContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor:
      Platform.OS === "ios" ? "rgba(5, 5, 5, 0.75)" : "rgba(5, 5, 5, 0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    zIndex: 100,
  },
  navbarContent: {
    // height: 65,
    width: width,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  subscriptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00A36C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 8,
  },
});

export default BackNav;
