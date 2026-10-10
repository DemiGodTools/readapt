import React, { useEffect } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
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
} from "react-native-reanimated";
import { useModal } from "../../hooks/useModal";
import pallete from "../../lib/Colors";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = 240;

const Modal = () => {
  const { modal, hideModal } = useModal();

  const translateY = useSharedValue(SHEET_HEIGHT);

  useEffect(() => {
    if (modal) {
      translateY.value = withSpring(0, { damping: 55 });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT);
    }
  }, [modal]);

  const onDismiss = (callback?: () => void) => {
    if (callback) {
      callback();
    }
    hideModal();
  };

  const closeModal = (callback?: () => void) => {
    translateY.value = withTiming(SHEET_HEIGHT, {}, () => {
      runOnJS(onDismiss)(callback);
    });
  };

  const cancelCallback = modal?.onCancel;

  const dragGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 500) {
        runOnJS(closeModal)(cancelCallback);
      } else {
        translateY.value = withSpring(0, { damping: 45 });
      }
    });

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!modal) return null;

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      {/* Backdrop overlay */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={() => closeModal(modal?.onCancel)}
      />

      <GestureDetector gesture={dragGesture}>
        <Animated.View style={[styles.confirmPanel, animatedStyles]}>
          <View style={styles.dragHandle} />

          <Text style={styles.panelHeader}>
            {modal.title || "Are you sure to join?"}
          </Text>

          <View style={styles.panelActions}>
            <TouchableOpacity
              style={[styles.panelBtn, styles.btnCancel]}
              activeOpacity={0.8}
              onPress={() => closeModal(modal?.onCancel)}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.panelBtn, styles.btnContinue]}
              activeOpacity={0.8}
              onPress={() => closeModal(modal.onConfirm)}>
              <Text style={styles.btnContinueText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  confirmPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: pallete.panelbg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: pallete.paddingside,
    paddingTop: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  dragHandle: {
    width: 48,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 10,
    alignSelf: "center",
    position: "absolute",
    top: 12,
  },
  panelHeader: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: pallete.accent,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 16,
    textAlign: "center",
  },
  panelActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 24,
  },
  panelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancel: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  btnContinue: {
    backgroundColor: pallete.true,
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: pallete.textgray,
  },
  btnContinueText: {
    fontSize: 14,
    fontWeight: "600",
    color: pallete.bgmain,
  },
});

export default Modal;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        