import React from "react";
import { BottomTabBar, BottomTabBarProps } from "@react-navigation/bottom-tabs";

/**
  * Pass-through tab bar kept for backwards compatibility.
  */
const AnimatedTabBar = (props: BottomTabBarProps) => {
  return <BottomTabBar {...props} />;
};

export default AnimatedTabBar;
