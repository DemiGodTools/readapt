import React, { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
// @ts-ignore
import Feather from "react-native-vector-icons/Feather";
import pallete from "../../lib/Colors";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

/**
 * Dark, draggable bottom sheet used for the Upgrade Plan panel.
 * - Spring slide-in / smooth slide-out
 * - Drag handle (and header) to drag down and close
 * - Closes on outside tap or Android hardware back
 */
const UpgradeSheet = ({ visible, onClose, title, subtitle, children }: Props) => {
  const [mounted, setMountedState] = useState(false);
  const mountedRef = useRef(false);

  const setMounted = (val: boolean) => {
    mountedRef.current = val;
    setMountedState(val);
  };

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const startY = useSharedValue(0);

  // Single animation lifecycle (prevents blink on open/close)
  useEffect(() => {
    const unmount = () => {
      mountedRef.current = false;
      setMountedState(false);
    };

    if (visible) {
      setMounted(true);
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withSpring(0, { damping: 85, stiffness: 300, mass: 0.9 });
    } else if (mountedRef.current) {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 }, (finished) => {
        if (finished) runOnJS(unmount)();
      });
    }
  }, [visible, translateY]);

  // Close on Android hardware back
  useEffect(() => {
    if (Platform.OS !== "android" || !visible) return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });

    return () => sub.remove();
  }, [visible, onClose]);

  // Drag-to-close on the handle / header area
  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const newY = startY.value + event.translationY;
      translateY.value = Math.min(SCREEN_HEIGHT, Math.max(0, newY));
    })
    .onEnd((event) => {
      if (event.translationY > 90 || event.velocityY > 650) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, { damping: 85, stiffness: 300, mass: 0.9 });
      }
    });

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (!mounted) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* Backdrop – tap anywhere outside to close */}
      <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.panel, panelAnimatedStyle]}>
        <GestureDetector gesture={panGesture}>
          <View>
            <View style={styles.grabberArea}>
              <View style={styles.grabHandle} />
            </View>

            <View style={styles.headerRow}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? (
                  <Text style={styles.subtitle}>{subtitle}</Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                activeOpacity={0.7}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color={pallete.textgray} />
              </TouchableOpacity>
            </View>
          </View>
        </GestureDetector>

        {children}
      </Animated.View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: pallete.panelbg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingTop: 6,
    paddingBottom: 28,
    maxHeight: SCREEN_HEIGHT * 0.86,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 20,
  },
  grabberArea: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  grabHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: pallete.textgray,
    marginTop: 6,
  },
  closeBtn: {
    padding: 4,
  },
});

export default UpgradeSheet;
