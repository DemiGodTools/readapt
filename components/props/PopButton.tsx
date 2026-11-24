import React, { ReactNode, memo, useCallback } from "react";
import { Pressable, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PopButtonProps {
  children: ReactNode;
  styles?: StyleProp<ViewStyle>;
  activeStyles?: StyleProp<ViewStyle>;
  onPress?: () => void;
  scale?: number;
}

const PopButton = ({
  children,
  styles,
  onPress,
  scale = 0.97,
}: PopButtonProps) => {
  const scaleAnim = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    "worklet";
    scaleAnim.value = withSpring(scale, {
      damping: 18,
      stiffness: 300,
      mass: 0.5,
    });
  }, [scale, scaleAnim]);

  const handlePressOut = useCallback(() => {
    "worklet";
    scaleAnim.value = withSpring(1, {
      damping: 18,
      stiffness: 300,
      mass: 0.5,
    });
  }, [scaleAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[styles, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
};

export default memo(PopButton);
