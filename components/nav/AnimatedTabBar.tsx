import React, { useEffect, useRef } from "react";
import { Animated, DeviceEventEmitter, Easing } from "react-native";
import { BottomTabBar, BottomTabBarProps } from "@react-navigation/bottom-tabs";

/**
 * Default tab bar wrapped in an animated opacity layer.
 *
 * When a bottom sheet opens we fade the tab bar out instead of unmounting it
 * (`display: "none"`), which caused the screen content to re-layout and made
 * the nav visibly blink in and out. Fading keeps the layout untouched, so the
 * transition is completely flicker-free.
 */
const AnimatedTabBar = (props: BottomTabBarProps) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "app-sheet-visibility",
      (event?: { open?: boolean }) => {
        Animated.timing(opacity, {
          toValue: event?.open ? 0 : 1,
          duration: event?.open ? 140 : 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      },
    );

    return () => sub.remove();
  }, [opacity]);

  return (
    <Animated.View style={{ opacity }}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
};

export default AnimatedTabBar;
