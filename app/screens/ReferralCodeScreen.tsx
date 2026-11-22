import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Animated as RNAnimated,
  Easing,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  Vibration,
  Modal,
  LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Path,
  Circle,
  Rect,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
} from "react-native-svg";
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
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { RootStackParamList } from "../../components/nav/MainNavigation";
import { api } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useUser } from "../../hooks/useUser";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const AnimatedPath = RNAnimated.createAnimatedComponent(Path);
const AnimatedCircle = RNAnimated.createAnimatedComponent(Circle);

// Readapt Signature Teal Palette
const TEAL = "#00D2B4";
const TEAL_LIGHT = "#5EEAD4";
const TEAL_MID = "#2DD4BF";
const TEAL_DARK = "#01796F";
const TEAL_DEEP = "#015049";
const BG_DARK = "#090314";
const BG_CARD = "#130E20";
const BORDER_TEAL = "rgba(0, 210, 180, 0.25)";
const TEXT_ON_TEAL = "#041614";
const ERROR_RED = "#EF4444";

/* --------------------------------------------------------------------------
 * Glitch-Free Radial Burst Confetti (Single Timeline, Native Driver 60fps)
 * ----------------------------------------------------------------------- */

const CONFETTI_COLORS = [
  "#00D2B4", // Readapt Primary Teal
  "#5EEAD4", // Mint Teal Light
  "#2DD4BF", // Bright Aqua
  "#99F6E4", // Soft Ice Mint
  "#38BDF8", // Sky Cyan
  "#FBBF24", // Warm Gold Accent
  "#FFFFFF", // Crisp White
];

const BURST_DELAY_MS = 180;

interface ConfettiPieceConfig {
  id: number;
  peakX: number;
  peakY: number;
  endX: number;
  endY: number;
  totalDuration: number;
  stagger: number;
  width: number;
  height: number;
  color: string;
  shape: "ribbon" | "rect" | "circle";
  rotations: number;
}

const ConfettiShower = ({
  active,
  originX,
  originY,
}: {
  active: boolean;
  originX: number;
  originY: number;
}) => {
  const [finished, setFinished] = useState(false);

  const pieces = useMemo<ConfettiPieceConfig[]>(() => {
    return Array.from({ length: 54 }, (_, i) => {
      const shapeRoll = i % 5;
      const shape: "ribbon" | "rect" | "circle" =
        shapeRoll === 0 ? "circle" : shapeRoll <= 2 ? "ribbon" : "rect";

      // Upward fountain arc (-165° to -15°) + wide side bursts
      const isSideBurst = i % 7 === 0;
      const angleDeg = isSideBurst
        ? i % 2 === 0
          ? -182 + Math.random() * 17
          : -15 + Math.random() * 17
        : -165 + Math.random() * 150;

      const angleRad = (angleDeg * Math.PI) / 180;
      const velocityRadius = isSideBurst
        ? 105 + Math.random() * 80
        : 110 + Math.random() * 130;

      const peakX = Math.cos(angleRad) * velocityRadius;
      const peakY = Math.sin(angleRad) * velocityRadius;

      const endX = peakX + (Math.random() - 0.5) * 44;
      const endY = peakY + 85 + Math.random() * 80;

      return {
        id: i,
        peakX,
        peakY,
        endX,
        endY,
        totalDuration: 950 + Math.random() * 320,
        stagger: Math.random() * 35,
        width: shape === "circle" ? 7 : shape === "ribbon" ? 5.5 : 8.5,
        height: shape === "circle" ? 7 : shape === "ribbon" ? 14 : 5.5,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        shape,
        rotations: (Math.random() > 0.5 ? 1 : -1) * (220 + Math.random() * 320),
      };
    });
  }, []);

  useEffect(() => {
    if (!active) {
      setFinished(false);
      return;
    }
    const maxTime = BURST_DELAY_MS + 1350;
    const timer = setTimeout(() => setFinished(true), maxTime);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active || finished) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((item) => (
        <SingleConfettiPiece
          key={item.id}
          config={item}
          originX={originX}
          originY={originY}
        />
      ))}
    </View>
  );
};

const SingleConfettiPiece = ({
  config,
  originX,
  originY,
}: {
  config: ConfettiPieceConfig;
  originX: number;
  originY: number;
}) => {
  const progress = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const anim = RNAnimated.sequence([
      RNAnimated.delay(BURST_DELAY_MS + config.stagger),
      RNAnimated.timing(progress, {
        toValue: 1,
        duration: config.totalDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    anim.start();
    return () => anim.stop();
  }, [config, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 0.36, 1],
    outputRange: [
      originX - config.width / 2,
      originX - config.width / 2 + config.peakX,
      originX - config.width / 2 + config.endX,
    ],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 0.36, 1],
    outputRange: [
      originY - config.height / 2,
      originY - config.height / 2 + config.peakY,
      originY - config.height / 2 + config.endY,
    ],
  });

  const scale = progress.interpolate({
    inputRange: [0, 0.12, 0.85, 1],
    outputRange: [0.15, 1.1, 0.9, 0.6],
  });

  const scaleX = progress.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0.35, 0.95, 0.35, 0.85],
  });

  const rotateZ = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${config.rotations}deg`],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.06, 0.62, 0.92, 1],
    outputRange: [0, 1, 0.92, 0, 0],
  });

  return (
    <RNAnimated.View
      renderToHardwareTextureAndroid
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: config.width,
        height: config.height,
        borderRadius: config.shape === "circle" ? config.width / 2 : 2,
        backgroundColor: config.color,
        opacity,
        transform: [
          { translateX },
          { translateY },
          { scale },
          { scaleX },
          { rotateZ },
        ],
      }}
    />
  );
};

/* --------------------------------------------------------------------------
 * Visual SVGs & Particle Elements (Readapt Teal Aesthetic)
 * ----------------------------------------------------------------------- */

const BackArrowIcon = ({ size = 24, color = "#FFFFFF" }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const TagIcon = ({ size = 20, color = TEAL }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <Circle cx="7" cy="7" r="1.5" fill={color} />
  </Svg>
);

const AlertShieldIcon = ({ size = 32, color = TEAL }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <Path d="M12 8v4" />
    <Circle cx="12" cy="16" r="0.8" fill={color} />
  </Svg>
);

// Proper 3D Isometric Teal Gift Box (without side confetti sparks)
const GiftBoxIllustration = () => {
  const floatAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(floatAnim, {
          toValue: -5,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        RNAnimated.timing(floatAnim, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  return (
    <RNAnimated.View
      style={[styles.giftContainer, { transform: [{ translateY: floatAnim }] }]}
    >
      <Svg width={176} height={164} viewBox="0 0 176 164" fill="none">
        <Defs>
          <RadialGradient id="giftAmbientGlow" cx="50%" cy="54%" r="50%">
            <Stop offset="0%" stopColor={TEAL} stopOpacity="0.38" />
            <Stop offset="65%" stopColor={TEAL_DARK} stopOpacity="0.12" />
            <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>

          <SvgLinearGradient id="boxLeftGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={TEAL} />
            <Stop offset="100%" stopColor={TEAL_DARK} />
          </SvgLinearGradient>

          <SvgLinearGradient id="boxRightGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#0D9488" />
            <Stop offset="100%" stopColor={TEAL_DEEP} />
          </SvgLinearGradient>

          <SvgLinearGradient id="lidTopGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#99F6E4" />
            <Stop offset="55%" stopColor={TEAL_LIGHT} />
            <Stop offset="100%" stopColor={TEAL} />
          </SvgLinearGradient>

          <SvgLinearGradient id="ribbonShine" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#F0FDFA" />
            <Stop offset="100%" stopColor="#99F6E4" />
          </SvgLinearGradient>
        </Defs>

        {/* Soft Teal Ambient Glow */}
        <Circle cx="88" cy="86" r="78" fill="url(#giftAmbientGlow)" />

        {/* Base Shadow */}
        <Path
          d="M46 134 L88 150 L130 134 L88 120 Z"
          fill="#000000"
          opacity="0.5"
        />

        {/* Box Body - Left Face */}
        <Path d="M48 82 L88 98 L88 144 L48 128 Z" fill="url(#boxLeftGrad)" />
        {/* Box Body - Right Face */}
        <Path d="M88 98 L128 82 L128 128 L88 144 Z" fill="url(#boxRightGrad)" />

        {/* Inner Shadow under Lid */}
        <Path
          d="M48 82 L88 98 L128 82 L128 87 L88 103 L48 87 Z"
          fill="#042F2E"
          opacity="0.4"
        />

        {/* Vertical Ribbon - Left Face */}
        <Path
          d="M64 88.5 L72 91.7 L72 137.7 L64 134.5 Z"
          fill="url(#ribbonShine)"
        />
        {/* Vertical Ribbon - Right Face */}
        <Path
          d="M104 91.7 L112 88.5 L112 134.5 L104 137.7 Z"
          fill="#CCFBF1"
        />

        {/* Box Lid - Left Rim */}
        <Path d="M42 66 L88 84 L88 95 L42 77 Z" fill={TEAL_MID} />
        {/* Box Lid - Right Rim */}
        <Path d="M88 84 L134 66 L134 77 L88 95 Z" fill={TEAL_DARK} />
        {/* Box Lid - Top Face */}
        <Path d="M88 49 L134 66 L88 84 L42 66 Z" fill="url(#lidTopGrad)" />

        {/* Lid Rim Ribbons */}
        <Path d="M61 73.5 L69 76.6 L69 87.6 L61 84.5 Z" fill="#F0FDFA" />
        <Path d="M107 76.6 L115 73.5 L115 84.5 L107 87.6 Z" fill="#CCFBF1" />

        {/* Lid Top Cross Ribbons */}
        <Path d="M62 58.5 L70 55.5 L114 73.5 L106 76.6 Z" fill="#F0FDFA" />
        <Path d="M106 55.5 L114 58.5 L70 76.6 L62 73.5 Z" fill="#CCFBF1" />

        {/* Symmetrical 3D Bow Loops */}
        <Path
          d="M86 64 C70 50, 52 46, 56 60 C59 69, 75 67, 86 65 Z"
          fill={TEAL_DARK}
        />
        <Path
          d="M86 64 C72 44, 53 40, 56 54 C58 63, 74 65, 86 64 Z"
          fill="#CCFBF1"
        />

        <Path
          d="M90 64 C106 50, 124 46, 120 60 C117 69, 101 67, 90 65 Z"
          fill={TEAL_DEEP}
        />
        <Path
          d="M90 64 C104 44, 123 40, 120 54 C118 63, 102 65, 90 64 Z"
          fill="#F0FDFA"
        />

        {/* Center Bow Knot */}
        <Circle cx="88" cy="63" r="6.5" fill={TEAL} />
        <Circle cx="87" cy="61.5" r="3" fill="#F0FDFA" opacity="0.85" />
      </Svg>
    </RNAnimated.View>
  );
};

// Snappy, Unclipped Success Checkmark Illustration + Expanding Shockwave Ring
const AnimatedSuccessBadge = () => {
  const badgeScale = useRef(new RNAnimated.Value(0.4)).current;
  const badgeOpacity = useRef(new RNAnimated.Value(0)).current;
  const checkDraw = useRef(new RNAnimated.Value(56)).current;
  const shockwaveScale = useRef(new RNAnimated.Value(0.8)).current;
  const shockwaveOpacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    // 1. 0ms–160ms: Fast crisp spring pop-in
    const badgePop = RNAnimated.parallel([
      RNAnimated.timing(badgeOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      RNAnimated.spring(badgeScale, {
        toValue: 1,
        damping: 12,
        stiffness: 240,
        mass: 0.75,
        useNativeDriver: true,
      }),
    ]);

    // 2. 90ms–290ms: Snappy white checkmark stroke draw
    const tickDraw = RNAnimated.sequence([
      RNAnimated.delay(90),
      RNAnimated.timing(checkDraw, {
        toValue: 0,
        duration: 200,
        easing: Easing.bezier(0.2, 0.9, 0.3, 1),
        useNativeDriver: false,
      }),
    ]);

    // 3. 180ms: Expanding shockwave ring synced with confetti burst & vibration
    const shockwavePulse = RNAnimated.sequence([
      RNAnimated.delay(BURST_DELAY_MS),
      RNAnimated.parallel([
        RNAnimated.timing(shockwaveScale, {
          toValue: 1.85,
          duration: 460,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.sequence([
          RNAnimated.timing(shockwaveOpacity, {
            toValue: 0.8,
            duration: 35,
            useNativeDriver: true,
          }),
          RNAnimated.timing(shockwaveOpacity, {
            toValue: 0,
            duration: 425,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    const hapticTimer = setTimeout(() => {
      try {
        if (Platform.OS === "android") {
          Vibration.vibrate([0, 28, 45, 40]);
        } else {
          Vibration.vibrate(45);
        }
      } catch {}
    }, BURST_DELAY_MS);

    const composite = RNAnimated.parallel([badgePop, tickDraw, shockwavePulse]);
    composite.start();

    return () => {
      clearTimeout(hapticTimer);
      composite.stop();
    };
  }, [
    badgeOpacity,
    badgeScale,
    checkDraw,
    shockwaveOpacity,
    shockwaveScale,
  ]);

  return (
    <View style={styles.successContainer} collapsable={false}>
      {/* Expanding Shockwave Ring behind the Badge */}
      <RNAnimated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 76,
          height: 76,
          borderRadius: 38,
          borderWidth: 3,
          borderColor: TEAL_LIGHT,
          opacity: shockwaveOpacity,
          transform: [{ scale: shockwaveScale }],
        }}
      />

      {/* Explicit padding & collapsable={false} prevents Android bottom-edge clipping */}
      <RNAnimated.View
        collapsable={false}
        style={{
          padding: 6,
          opacity: badgeOpacity,
          transform: [{ scale: badgeScale }],
        }}
      >
        <Svg
          width={168}
          height={168}
          viewBox="-4 -4 172 172"
          fill="none"
        >
          <Defs>
            <RadialGradient id="successGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={TEAL} stopOpacity="0.45" />
              <Stop offset="65%" stopColor={TEAL_DARK} stopOpacity="0.14" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Soft Radial Teal Halo */}
          <Circle cx="82" cy="82" r="76" fill="url(#successGlow)" />

          {/* Deep Teal Inner Badge Circle */}
          <AnimatedCircle
            cx="82"
            cy="82"
            r="38"
            fill="#063F3B"
            stroke={TEAL}
            strokeWidth="3.5"
          />

          {/* Smooth Animated White Checkmark Stroke */}
          <AnimatedPath
            d="M66 82.5 L77 93.5 L99.5 70.5"
            stroke="#FFFFFF"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="56"
            strokeDashoffset={checkDraw}
          />
        </Svg>
      </RNAnimated.View>
    </View>
  );
};

// Subtle ambient background waves (pure Teal SVG)
const AmbientBackground = () => (
  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
    <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id="topGlow" cx="20%" cy="10%" r="60%">
          <Stop offset="0%" stopColor={TEAL} stopOpacity="0.12" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="bottomGlow" cx="70%" cy="90%" r="50%">
          <Stop offset="0%" stopColor={TEAL_DARK} stopOpacity="0.2" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="400" height="800" fill="url(#topGlow)" />
      <Rect x="0" y="0" width="400" height="800" fill="url(#bottomGlow)" />
      {/* Elegant wave curves */}
      <Path
        d="M-50 720 Q120 680 200 740 T450 710 L450 850 L-50 850 Z"
        fill="rgba(0, 210, 180, 0.04)"
      />
      <Path
        d="M-50 750 Q100 700 240 760 T450 740 L450 850 L-50 850 Z"
        fill="rgba(1, 121, 111, 0.08)"
      />
    </Svg>
  </View>
);

/* --------------------------------------------------------------------------
 * Custom Draggable Confirmation Bottom Sheet
 * ----------------------------------------------------------------------- */

interface ConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirmSkip: () => void;
}

const SkipConfirmSheet = ({ visible, onClose, onConfirmSkip }: ConfirmSheetProps) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setSheetOpen(true);
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withSpring(0, { damping: 85, stiffness: 320, mass: 0.85 });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 180 }, (finished) => {
        if (finished) runOnJS(setSheetOpen)(false);
      });
    }
  }, [visible, translateY]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const nextY = startY.value + event.translationY;
      translateY.value = Math.max(0, nextY);
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 600) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, { damping: 85, stiffness: 320, mass: 0.85 });
      }
    });

  const panelAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, SCREEN_HEIGHT], [1, 0], Extrapolation.CLAMP),
  }));

  if (!sheetOpen && !visible) return null;

  return (
    <Modal
      visible={sheetOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={sheetStyles.root}>
        <Animated.View style={[sheetStyles.backdrop, backdropAnimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[sheetStyles.panel, panelAnimStyle]}>
          <GestureDetector gesture={panGesture}>
            <View style={sheetStyles.grabArea}>
              <View style={sheetStyles.grabHandle} />
            </View>
          </GestureDetector>

          <View style={sheetStyles.content}>
            <View style={sheetStyles.iconWrap}>
              <AlertShieldIcon size={30} color={TEAL} />
            </View>

            <Text style={sheetStyles.title}>Are you sure?</Text>
            <Text style={sheetStyles.subtitle}>
              Referral benefits and welcome perks can only be claimed during setup. Once you continue, you won't be able to enter a code later.
            </Text>

            <View style={sheetStyles.buttonGroup}>
              {/* Primary: Stay and Enter Code */}
              <TouchableOpacity
                style={sheetStyles.enterCodeBtn}
                onPress={onClose}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={[TEAL, TEAL_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={sheetStyles.btnGradient}
                >
                  <Text style={sheetStyles.enterCodeText}>No, Enter Code</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Secondary: Continue without code */}
              <TouchableOpacity
                style={sheetStyles.continueBtn}
                onPress={onConfirmSkip}
                activeOpacity={0.7}
              >
                <Text style={sheetStyles.continueText}>Continue without Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

/* --------------------------------------------------------------------------
 * Main Referral Code Screen
 * ----------------------------------------------------------------------- */

type ScreenRouteProp = RouteProp<RootStackParamList, "ReferralCodeScreen">;

export default function ReferralCodeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<ScreenRouteProp>();
  const { reload } = useUser();
  const { showToast } = useToast();

  const isTestMode = Boolean(route.params?.isTestMode);

  const [step, setStep] = useState<"INPUT" | "SUCCESS">("INPUT");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [burstOrigin, setBurstOrigin] = useState({
    x: SCREEN_WIDTH / 2,
    y: SCREEN_HEIGHT * 0.34,
  });
  const [referrerInfo, setReferrerInfo] = useState<{
    name: string;
    userId: string;
    image?: string | null;
  } | null>(null);

  const badgeAnchorRef = useRef<View>(null);
  const fadeAnim = useRef(new RNAnimated.Value(1)).current;
  const shakeAnim = useRef(new RNAnimated.Value(0)).current;
  const errorFlashAnim = useRef(new RNAnimated.Value(0)).current;

  const measureBadgeOrigin = useCallback(() => {
    badgeAnchorRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setBurstOrigin({
          x: x + width / 2,
          y: y + height / 2,
        });
      }
    });
  }, []);

  const handleBadgeLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      measureBadgeOrigin();
    },
    [measureBadgeOrigin]
  );

  const triggerWarningShake = (message?: string) => {
    if (message) {
      setInputError(message);
    }

    try {
      if (Platform.OS === "android") {
        Vibration.vibrate([0, 35, 55, 35]);
      } else {
        Vibration.vibrate(45);
      }
    } catch {}

    shakeAnim.stopAnimation();
    shakeAnim.setValue(0);
    errorFlashAnim.setValue(1);

    RNAnimated.parallel([
      RNAnimated.sequence([
        RNAnimated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(shakeAnim, {
          toValue: -10,
          duration: 55,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(shakeAnim, {
          toValue: 7,
          duration: 50,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(shakeAnim, {
          toValue: -7,
          duration: 50,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(shakeAnim, {
          toValue: 3.5,
          duration: 45,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(shakeAnim, {
          toValue: 0,
          duration: 50,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      RNAnimated.timing(errorFlashAnim, {
        toValue: 0,
        duration: 1300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handleApplyCode = async () => {
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode) {
      triggerWarningShake("Please enter a referral code.");
      showToast({ title: "Please enter a referral code." });
      return;
    }

    if (
      cleanCode.length < 5 ||
      cleanCode.length > 15 ||
      !/^[A-Z0-9_-]+$/.test(cleanCode)
    ) {
      triggerWarningShake("Code must be 6-12 alphanumeric characters.");
      showToast({ title: "Code must be 6-12 alphanumeric characters." });
      return;
    }

    Keyboard.dismiss();
    setInputError(null);
    setLoading(true);

    try {
      if (isTestMode) {
        await new Promise((resolve) => setTimeout(resolve, 220));
        setReferrerInfo({
          name: "Alex Reader",
          userId: "alexreader",
        });
        transitionToSuccess();
        return;
      }

      // Verify code
      const verifyRes = await api.post("/referral/verify", {
        code: cleanCode,
        isTestMode: false,
      });

      if (!verifyRes.data?.valid) {
        throw new Error(verifyRes.data?.message || "Invalid referral code.");
      }

      const verifiedReferrer = verifyRes.data?.referrer;

      // Apply code
      const applyRes = await api.post("/referral/apply", {
        code: cleanCode,
        isTestMode: false,
      });

      if (applyRes.data?.success) {
        setReferrerInfo(verifiedReferrer || applyRes.data?.referrer);
        reload?.().catch(() => {});
        transitionToSuccess();
      } else {
        throw new Error(applyRes.data?.message || "Could not apply code.");
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Could not verify code. Please try again.";
      triggerWarningShake(msg);
      showToast({ title: msg });
    } finally {
      setLoading(false);
    }
  };

  const transitionToSuccess = () => {
    Keyboard.dismiss();
    fadeAnim.stopAnimation();
    fadeAnim.setValue(0.15);
    setStep("SUCCESS");
    setShowConfetti(true);

    RNAnimated.timing(fadeAnim, {
      toValue: 1,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      measureBadgeOrigin();
    });
  };

  const handleConfirmSkip = () => {
    setShowConfirmSheet(false);
    if (isTestMode) {
      navigation.goBack();
    } else {
      navigation.replace("ProfileCreation");
    }
  };

  const handleFinish = () => {
    if (isTestMode) {
      showToast({ title: "Test flow completed! Returning..." });
      navigation.goBack();
    } else {
      navigation.replace("ProfileCreation");
    }
  };

  const animatedBorderColor = errorFlashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [BORDER_TEAL, "rgba(239, 68, 68, 0.85)"],
  });

  const animatedInputBg = errorFlashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [BG_CARD, "rgba(239, 68, 68, 0.08)"],
  });

  return (
    <View style={styles.container}>
      <AmbientBackground />

      {/* Radial Confetti Burst anchored directly to the Tick Badge Center */}
      <ConfettiShower
        active={showConfetti}
        originX={burstOrigin.x}
        originY={burstOrigin.y}
      />

      <KeyboardAvoidingView
        enabled={step === "INPUT"}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
        >
          {/* Top Navigation */}
          <View style={styles.topBar}>
            {step === "INPUT" ? (
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  if (isTestMode) {
                    navigation.goBack();
                  } else {
                    setShowConfirmSheet(true);
                  }
                }}
                style={styles.backButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <BackArrowIcon size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <View style={styles.backButtonPlaceholder} />
            )}

            {isTestMode && (
              <View style={styles.testBadge}>
                <Text style={styles.testBadgeText}>TEST PREVIEW MODE</Text>
              </View>
            )}
          </View>

          {/* Animated Main Content */}
          <RNAnimated.View
            collapsable={false}
            style={[styles.contentWrap, { opacity: fadeAnim }]}
          >
            {step === "INPUT" ? (
              /* State 1: Got a Referral Code? */
              <View style={styles.centerBlock}>
                <GiftBoxIllustration />

                <Text style={styles.mainTitle}>Got a Referral Code?</Text>
                <Text style={styles.subTitle}>
                  Enter your friend's code to join{"\n"}READAPT.
                </Text>

                {/* Shaking Input Container */}
                <RNAnimated.View
                  style={[
                    styles.inputWrapper,
                    { transform: [{ translateX: shakeAnim }] },
                  ]}
                >
                  <RNAnimated.View
                    style={[
                      styles.inputContainer,
                      {
                        borderColor: animatedBorderColor,
                        backgroundColor: animatedInputBg,
                      },
                    ]}
                  >
                    <TagIcon size={20} color={inputError ? ERROR_RED : TEAL} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Enter 6-12 character code"
                      placeholderTextColor="#64748B"
                      value={code}
                      onChangeText={(val) => {
                        if (inputError) setInputError(null);
                        setCode(val.toUpperCase());
                      }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={15}
                      returnKeyType="done"
                      onSubmitEditing={handleApplyCode}
                    />
                    {code.length > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          setCode("");
                          setInputError(null);
                        }}
                        style={styles.clearBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.clearText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </RNAnimated.View>

                  {inputError ? (
                    <Text style={styles.errorHintText}>{inputError}</Text>
                  ) : null}
                </RNAnimated.View>

                {/* Apply Button (Dark High-Contrast Text on Bright Teal Gradient) */}
                <TouchableOpacity
                  style={[styles.applyButton, loading && styles.btnDisabled]}
                  onPress={handleApplyCode}
                  activeOpacity={0.88}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={[TEAL_LIGHT, TEAL, TEAL_DARK]}
                    start={{ x: 0.08, y: 0 }}
                    end={{ x: 0.92, y: 1 }}
                    style={styles.btnGradient}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={TEXT_ON_TEAL} />
                    ) : (
                      <Text style={styles.applyBtnText}>Apply Code</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Skip Link */}
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowConfirmSheet(true);
                  }}
                  style={styles.skipButton}
                  activeOpacity={0.7}
                >
                  <Text style={styles.skipText}>I don't have a code</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* State 2: Referral Code Applied! */
              <View style={styles.centerBlock} collapsable={false}>
                <View
                  ref={badgeAnchorRef}
                  onLayout={handleBadgeLayout}
                  collapsable={false}
                >
                  <AnimatedSuccessBadge />
                </View>

                <Text style={styles.mainTitle}>Referral Code Applied!</Text>
                <Text style={styles.subTitle}>
                  You're joining through a{"\n"}friend's invitation.
                </Text>

                {referrerInfo && (
                  <View style={styles.referrerCard}>
                    <Text style={styles.referrerTag}>INVITED BY</Text>
                    <Text style={styles.referrerName}>{referrerInfo.name}</Text>
                    {referrerInfo.userId ? (
                      <Text style={styles.referrerHandle}>
                        @{referrerInfo.userId}
                      </Text>
                    ) : null}
                  </View>
                )}

                {/* Continue / Done & Return Button (Dark Text on Teal Gradient) */}
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={handleFinish}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={[TEAL_LIGHT, TEAL, TEAL_DARK]}
                    start={{ x: 0.08, y: 0 }}
                    end={{ x: 0.92, y: 1 }}
                    style={styles.btnGradient}
                  >
                    <Text style={styles.applyBtnText}>
                      {isTestMode ? "Done & Return" : "Continue"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </RNAnimated.View>

          <View style={styles.bottomBalance} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Custom Draggable Confirmation Bottom Sheet */}
      <SkipConfirmSheet
        visible={showConfirmSheet}
        onClose={() => setShowConfirmSheet(false)}
        onConfirmSkip={handleConfirmSkip}
      />
    </View>
  );
}

/* --------------------------------------------------------------------------
 * Styles
 * ----------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 26,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minHeight: 42,
    marginBottom: 8,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonPlaceholder: {
    width: 42,
    height: 42,
  },
  testBadge: {
    backgroundColor: "rgba(0, 210, 180, 0.15)",
    borderColor: "rgba(0, 210, 180, 0.4)",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  testBadgeText: {
    color: TEAL,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  contentWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
  },
  centerBlock: {
    width: "100%",
    alignItems: "center",
  },
  giftContainer: {
    marginBottom: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  successContainer: {
    marginBottom: 12,
    minHeight: 180,
    minWidth: 180,
    justifyContent: "center",
    alignItems: "center",
    overflow: "visible",
  },
  mainTitle: {
    fontSize: 27,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 15.5,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
    paddingHorizontal: 14,
  },
  inputWrapper: {
    width: "100%",
    marginBottom: 18,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_CARD,
    borderColor: BORDER_TEAL,
    borderWidth: 1.2,
    borderRadius: 24,
    paddingHorizontal: 18,
    height: 56,
    width: "100%",
  },
  textInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 12,
    letterSpacing: 1.1,
  },
  clearBtn: {
    padding: 6,
  },
  clearText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
  },
  errorHintText: {
    color: ERROR_RED,
    fontSize: 12.5,
    fontWeight: "600",
    marginTop: 7,
    marginLeft: 12,
  },
  applyButton: {
    width: "100%",
    height: 55,
    borderRadius: 27.5,
    overflow: "hidden",
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 6,
  },
  btnGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  applyBtnText: {
    color: TEXT_ON_TEAL,
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  skipButton: {
    marginTop: 22,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: "#94A3B8",
    fontSize: 14.5,
    textDecorationLine: "underline",
    fontWeight: "500",
  },
  referrerCard: {
    backgroundColor: "rgba(0, 210, 180, 0.08)",
    borderColor: "rgba(0, 210, 180, 0.3)",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
    marginBottom: 28,
  },
  referrerTag: {
    color: TEAL,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  referrerName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  referrerHandle: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 2,
  },
  bottomBalance: {
    height: 14,
  },
});

const sheetStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#110B1E",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.2,
    borderTopColor: "rgba(0, 210, 180, 0.25)",
    paddingBottom: 36,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.7,
    shadowRadius: 30,
    elevation: 20,
  },
  grabArea: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  grabHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: "center",
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 210, 180, 0.12)",
    borderColor: "rgba(0, 210, 180, 0.3)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 28,
  },
  buttonGroup: {
    width: "100%",
    gap: 12,
  },
  enterCodeBtn: {
    width: "100%",
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
  },
  btnGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  enterCodeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  continueBtn: {
    width: "100%",
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  continueText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },
});