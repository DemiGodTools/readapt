import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
  ActivityIndicator,
  Vibration,
  Easing,
  LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Path,
  Ellipse,
  Circle,
  Rect,
  Polyline,
  Line,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useUser } from "../../hooks/useUser";
import { useToast } from "../../hooks/useToast";
import { api } from "../../lib/api";
import { createAvatarVariants, uploadAvatarVariants } from "../../lib/imageUpload";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* --------------------------------------------------------------------------
 * READAPT Signature Teal & Deep Dark Palette
 * ----------------------------------------------------------------------- */
const THEME = {
  bgMain: "#070B0D",
  bgSurface: "#11171A",
  bgCard: "#131B1F",
  border: "rgba(255, 255, 255, 0.09)",
  borderTeal: "rgba(0, 210, 180, 0.28)",
  tealLight: "#5EEAD4",
  tealPrimary: "#00D2B4",
  tealMid: "#2DD4BF",
  tealDeep: "#01796F",
  photoBlue: "#38BDF8",
  photoBlueDeep: "#0284C7",
  textPrimary: "#FFFFFF",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textOnTeal: "#041614",
  errorColor: "#EF4444",
  successColor: "#10B981",
};

type Profession =
  | "Student"
  | "Professional"
  | "Researcher"
  | "Entrepreneur"
  | "Content Creator"
  | "Educator"
  | "Developer"
  | "Designer"
  | "Writer"
  | "Other"
  | "";

type Visibility = "Public" | "Private";

const TOTAL_STEPS = 6;
const NAME_MAX_LENGTH = 40;

/* --------------------------------------------------------------------------
 * Glitch-Free Radial Burst Confetti (Native Driver 60fps)
 * ----------------------------------------------------------------------- */
const CONFETTI_COLORS = [
  "#00D2B4",
  "#5EEAD4",
  "#2DD4BF",
  "#38BDF8",
  "#FBBF24",
  "#99F6E4",
  "#FFFFFF",
];

const BURST_DELAY_MS = 220;

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

const RadialConfettiBurst = ({
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
    return Array.from({ length: 56 }, (_, i) => {
      const shapeRoll = i % 5;
      const shape: "ribbon" | "rect" | "circle" =
        shapeRoll === 0 ? "circle" : shapeRoll <= 2 ? "ribbon" : "rect";

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
        totalDuration: 1000 + Math.random() * 340,
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
    const timer = setTimeout(() => setFinished(true), BURST_DELAY_MS + 1400);
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
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(BURST_DELAY_MS + config.stagger),
      Animated.timing(progress, {
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
    <Animated.View
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
 * Blink-Free Stroke-Drawn Success Checkmark + Shockwave Badge
 * ----------------------------------------------------------------------- */
const CompletedTickBadge = () => {
  const badgeScale = useRef(new Animated.Value(0.5)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const checkDraw = useRef(new Animated.Value(56)).current;
  const shockwaveScale = useRef(new Animated.Value(0.8)).current;
  const shockwaveOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    badgeScale.setValue(0.5);
    badgeOpacity.setValue(0);
    checkDraw.setValue(56);
    shockwaveScale.setValue(0.8);
    shockwaveOpacity.setValue(0);

    const badgePop = Animated.parallel([
      Animated.timing(badgeOpacity, {
        toValue: 1,
        duration: 130,
        useNativeDriver: true,
      }),
      Animated.spring(badgeScale, {
        toValue: 1,
        damping: 14,
        stiffness: 220,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]);

    const tickDraw = Animated.sequence([
      Animated.delay(110),
      Animated.timing(checkDraw, {
        toValue: 0,
        duration: 240,
        easing: Easing.bezier(0.22, 0.9, 0.32, 1),
        useNativeDriver: false,
      }),
    ]);

    const shockwavePulse = Animated.sequence([
      Animated.delay(BURST_DELAY_MS),
      Animated.parallel([
        Animated.timing(shockwaveScale, {
          toValue: 1.85,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(shockwaveOpacity, {
            toValue: 0.8,
            duration: 35,
            useNativeDriver: true,
          }),
          Animated.timing(shockwaveOpacity, {
            toValue: 0,
            duration: 445,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    const composite = Animated.parallel([badgePop, tickDraw, shockwavePulse]);
    composite.start();

    return () => composite.stop();
  }, [badgeOpacity, badgeScale, checkDraw, shockwaveOpacity, shockwaveScale]);

  return (
    <View style={styles.completedTickWrap} collapsable={false}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 72,
          height: 72,
          borderRadius: 36,
          borderWidth: 3,
          borderColor: THEME.tealLight,
          opacity: shockwaveOpacity,
          transform: [{ scale: shockwaveScale }],
        }}
      />

      <Animated.View
        collapsable={false}
        style={{
          padding: 4,
          opacity: badgeOpacity,
          transform: [{ scale: badgeScale }],
        }}
      >
        <Svg width={116} height={116} viewBox="-4 -4 124 124" fill="none">
          <Defs>
            <RadialGradient id="doneHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={THEME.tealPrimary} stopOpacity="0.45" />
              <Stop offset="68%" stopColor={THEME.tealDeep} stopOpacity="0.14" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          <Circle cx="58" cy="58" r="54" fill="url(#doneHalo)" />
          <AnimatedCircle
            cx="58"
            cy="58"
            r="34"
            fill="#063F3B"
            stroke={THEME.tealPrimary}
            strokeWidth="3.2"
          />
          <AnimatedPath
            d="M44 58.5 L53.5 68 L73 48.5"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="56"
            strokeDashoffset={checkDraw}
          />
        </Svg>
      </Animated.View>
    </View>
  );
};

/* --------------------------------------------------------------------------
 * Profession Icons (Minimal Material-Style Vector Icons)
 * ----------------------------------------------------------------------- */
const ProfessionIcon = ({
  type,
  color,
}: {
  type: Exclude<Profession, "">;
  color: string;
}) => {
  switch (type) {
    case "Student":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <Path d="M6 12v5c3 3 9 3 12 0v-5" />
        </Svg>
      );
    case "Professional":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="2" y="7" width="20" height="14" rx="2" />
          <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </Svg>
      );
    case "Researcher":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 18h8" />
          <Path d="M3 22h18" />
          <Path d="M14 22a7 7 0 1 0 0-14h-1" />
          <Path d="M9 14h2" />
          <Path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
        </Svg>
      );
    case "Entrepreneur":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <Path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        </Svg>
      );
    case "Content Creator":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="m22 8-6 4 6 4V8Z" />
          <Rect x="2" y="6" width="14" height="12" rx="2" />
        </Svg>
      );
    case "Educator":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </Svg>
      );
    case "Developer":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="16 18 22 12 16 6" />
          <Polyline points="8 6 2 12 8 18" />
        </Svg>
      );
    case "Designer":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 19l7-7 3 3-7 7-3-3z" />
          <Path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <Circle cx="11" cy="11" r="2" />
        </Svg>
      );
    case "Writer":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </Svg>
      );
    default:
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="9" />
          <Circle cx="12" cy="12" r="1.5" fill={color} />
          <Circle cx="16.5" cy="12" r="1.5" fill={color} />
          <Circle cx="7.5" cy="12" r="1.5" fill={color} />
        </Svg>
      );
  }
};

/* --------------------------------------------------------------------------
 * Interest Card Icons (Matching Reference Screenshot Design)
 * ----------------------------------------------------------------------- */
const INTEREST_OPTIONS = [
  "Psychology",
  "Finance",
  "Self Growth",
  "Technology",
  "Health & Wellness",
  "Business",
  "Science",
  "Others",
] as const;

const InterestVectorIcon = ({ topic }: { topic: string }) => {
  switch (topic) {
    case "Psychology":
      return (
        <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
          <Defs>
            <SvgLinearGradient id="brainGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#F9A8D4" />
              <Stop offset="100%" stopColor="#EC4899" />
            </SvgLinearGradient>
          </Defs>
          <Path
            d="M23 11C18.5 11 15 14 14.5 18C12 19 10.5 21.5 11 24.5C10 27 11 30.5 14 32C15 35 18.5 37 22 36.5V11H23Z"
            fill="url(#brainGrad)"
          />
          <Path
            d="M25 11C29.5 11 33 14 33.5 18C36 19 37.5 21.5 37 24.5C38 27 37 30.5 34 32C33 35 29.5 37 26 36.5V11H25Z"
            fill="url(#brainGrad)"
            opacity={0.88}
          />
          <Path
            d="M17 20C19 20 20 21.5 19 23M16 27C18.5 27 20 28.5 19 30.5M31 20C29 20 28 21.5 29 23M32 27C29.5 27 28 28.5 29 30.5"
            stroke="#831843"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </Svg>
      );
    case "Finance":
      return (
        <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
          <Defs>
            <SvgLinearGradient id="coinGold" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FDE68A" />
              <Stop offset="100%" stopColor="#F59E0B" />
            </SvgLinearGradient>
          </Defs>
          {/* Coin Stack */}
          <Ellipse cx="31" cy="33" rx="6.5" ry="2.6" fill="#D97706" />
          <Path d="M24.5 27v6c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-6" fill="#F59E0B" />
          <Ellipse cx="31" cy="27" rx="6.5" ry="2.6" fill="url(#coinGold)" />
          {/* Main Coin */}
          <Circle cx="18.5" cy="29" r="7.5" fill="url(#coinGold)" />
          <Circle cx="18.5" cy="29" r="5.2" stroke="#B45309" strokeWidth="1.3" />
          {/* Growth Arrow */}
          <Path
            d="M14 21L23 16L27 19L35 12M35 12H29.5M35 12V17.5"
            stroke="#FBBF24"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "Self Growth":
      return (
        <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
          <Defs>
            <SvgLinearGradient id="sproutGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#5EEAD4" />
              <Stop offset="100%" stopColor="#0D9488" />
            </SvgLinearGradient>
          </Defs>
          <Path
            d="M24 36V23"
            stroke="#2DD4BF"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <Path
            d="M24 25C24 18 17 14 11 15C11 21 16 26 24 25Z"
            fill="url(#sproutGrad)"
          />
          <Path
            d="M24 22C24 15 31 11 37 12C37 18 32 23 24 22Z"
            fill="url(#sproutGrad)"
            opacity={0.9}
          />
          <Path
            d="M17 36H31"
            stroke="#00D2B4"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </Svg>
      );
    case "Technology":
      return (
        <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
          <Defs>
            <SvgLinearGradient id="chipGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" />
              <Stop offset="100%" stopColor="#0284C7" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="14" y="14" width="20" height="20" rx="4" fill="url(#chipGrad)" />
          <Rect x="18.5" y="18.5" width="11" height="11" rx="2" fill="#082F49" />
          <Path
            d="M19 9V14M24 9V14M29 9V14M19 34V39M24 34V39M29 34V39M9 19H14M9 24H14M9 29H14M34 19H39M34 24H39M34 29H39"
            stroke="#38BDF8"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </Svg>
      );
    case "Health & Wellness":
      return (
        <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
          <Defs>
            <SvgLinearGradient id="heartGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FB7185" />
              <Stop offset="100%" stopColor="#DC2626" />
            </SvgLinearGradient>
          </Defs>
          <Path
            d="M24 37C24 37 10 28.2 10 18.5C10 14.2 13.4 11 17.5 11C20.1 11 22.5 12.3 24 14.4C25.5 12.3 27.9 11 30.5 11C34.6 11 38 14.2 38 18.5C38 28.2 24 37 24 37Z"
            fill="url(#heartGrad)"
          />
          <Path
            d="M14 23H19L21.5 18.5L25 27.5L27.5 23H34"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "Business":
      return (
        <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
          <Defs>
            <SvgLinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#5EEAD4" />
              <Stop offset="100%" stopColor="#00D2B4" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="12" y="25" width="6" height="12" rx="2" fill="url(#barGrad)" opacity={0.75} />
          <Rect x="21" y="19" width="6" height="18" rx="2" fill="url(#barGrad)" opacity={0.9} />
          <Rect x="30" y="12" width="6" height="25" rx="2" fill="url(#barGrad)" />
        </Svg>
      );
    case "Science":
      return (
        <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
          <Defs>
            <SvgLinearGradient id="flaskLiquid" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" />
              <Stop offset="100%" stopColor="#00D2B4" />
            </SvgLinearGradient>
          </Defs>
          <Path
            d="M19 11H29M21 11V18L13.5 31.5C12.4 33.5 13.8 36 16.1 36H31.9C34.2 36 35.6 33.5 34.5 31.5L27 18V11"
            stroke="#BAE6FD"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M16.5 26.5L13.8 31.4C12.9 33 14.1 35 16 35H32C33.9 35 35.1 33 34.2 31.4L31.5 26.5H16.5Z"
            fill="url(#flaskLiquid)"
          />
          <Circle cx="21" cy="30.5" r="1.4" fill="#FFFFFF" opacity={0.85} />
          <Circle cx="26.5" cy="31.5" r="1.1" fill="#FFFFFF" opacity={0.75} />
        </Svg>
      );
    default:
      return (
        <Svg width={44} height={44} viewBox="0 0 48 48" fill="none">
          <Circle cx="15" cy="24" r="3.2" fill="#5EEAD4" />
          <Circle cx="24" cy="24" r="3.2" fill="#00D2B4" />
          <Circle cx="33" cy="24" r="3.2" fill="#2DD4BF" />
        </Svg>
      );
  }
};

/* --------------------------------------------------------------------------
 * Main Profile Creation Component
 * ----------------------------------------------------------------------- */
const ProfileCreation = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, updateUser, reload } = useUser() as any;
  const { showToast } = useToast();

  const [step, setStep] = useState(0);

  const [profilePhoto, setProfilePhoto] = useState<string | null>(
    user?.image || user?.profilePhoto || null
  );
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(
    Boolean(user?.image || user?.profilePhoto)
  );

  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.userId || "");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(
    user?.userId ? true : null
  );
  const [usernameFeedback, setUsernameFeedback] = useState<string>(
    user?.userId ? "Your current username" : ""
  );

  const [profession, setProfession] = useState<Profession>(
    (user?.profession as Profession) || ""
  );
  const [bio, setBio] = useState(user?.bio || "");
  const [interests, setInterests] = useState<string[]>(
    Array.isArray(user?.interests) && user.interests.length > 0 ? user.interests : []
  );
  const [visibility, setVisibility] = useState<Visibility>(
    (user?.visibility as Visibility) || "Public"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [completionPercent, setCompletionPercent] = useState(0);
  const [burstOrigin, setBurstOrigin] = useState({
    x: SCREEN_WIDTH / 2,
    y: SCREEN_HEIGHT * 0.22,
  });

  const tickAnchorRef = useRef<View>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const uploadProgressAnim = useRef(new Animated.Value(user?.image || user?.profilePhoto ? 1 : 0)).current;

  const finalProgressFill = useRef(new Animated.Value(0)).current;
  const finalCardReveal = useRef(new Animated.Value(0)).current;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const measureTickOrigin = useCallback(() => {
    tickAnchorRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setBurstOrigin({
          x: x + width / 2,
          y: y + height / 2,
        });
      }
    });
  }, []);

  const handleTickLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      measureTickOrigin();
    },
    [measureTickOrigin]
  );

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: step === 0 || step === 7 ? 0 : step / TOTAL_STEPS,
      duration: 360,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [step, progressAnim]);

  useEffect(() => {
    if (step === 7) {
      Keyboard.dismiss();
      setCompletionPercent(0);
      finalProgressFill.setValue(0);
      finalCardReveal.setValue(0);

      const hapticTimer = setTimeout(() => {
        try {
          if (Platform.OS === "android") {
            Vibration.vibrate([0, 30, 50, 45]);
          } else {
            Vibration.vibrate(45);
          }
        } catch {}
      }, BURST_DELAY_MS);

      const listenerId = finalProgressFill.addListener((state) => {
        setCompletionPercent(Math.round(state.value * 100));
      });

      Animated.timing(finalProgressFill, {
        toValue: 1,
        duration: 1300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        Animated.spring(finalCardReveal, {
          toValue: 1,
          damping: 14,
          stiffness: 140,
          useNativeDriver: true,
        }).start();
      });

      return () => {
        clearTimeout(hapticTimer);
        finalProgressFill.removeListener(listenerId);
      };
    }
  }, [step, finalCardReveal, finalProgressFill]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const handlePhotoSelect = async () => {
    if (isUploadingPhoto) return;

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showToast({ title: "Permission to access photo library is required!" });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images" as any],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setProfilePhoto(asset.uri);
      uploadSelectedPhoto(asset);
    }
  };

  const uploadSelectedPhoto = async (asset: any) => {
    setIsUploadingPhoto(true);
    setUploadSuccess(false);

    spinAnim.setValue(0);
    uploadProgressAnim.setValue(0.08);

    // Continuous smooth rotation while uploading
    const loopAnim = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 950,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loopAnim.start();

    // Progressive border fill up to 88% while awaiting network completion
    const progressFillAnim = Animated.timing(uploadProgressAnim, {
      toValue: 0.88,
      duration: 1800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    progressFillAnim.start();

    try {
      try {
        const { variants, base64Fallback } = await createAvatarVariants(asset);
        const result = await uploadAvatarVariants(variants, { base64Fallback });
        const remoteUrl =
          result?.urls?.image ||
          result?.urls?.imageMd ||
          result?.urls?.imageSm ||
          result?.user?.image;

        if (remoteUrl) {
          setProfilePhoto(remoteUrl);
          if (updateUser) updateUser({ image: remoteUrl } as any);
        }
      } catch (pipelineErr) {
        console.warn("Avatar variant pipeline fallback:", pipelineErr);

        let imageDataUri = asset.base64
          ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
          : "";

        if (!imageDataUri && asset.uri) {
          try {
            const FileSystem = require("expo-file-system/legacy");
            const base64Image = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            imageDataUri = `data:${asset.mimeType || "image/jpeg"};base64,${base64Image}`;
          } catch {}
        }

        if (imageDataUri) {
          const res = await api.post("/update/profile-direct", { image: imageDataUri });
          if (res.data?.success && (res.data?.url || res.data?.user?.image)) {
            const finalUrl = res.data.url || res.data.user.image;
            setProfilePhoto(finalUrl);
            if (updateUser) updateUser({ image: finalUrl } as any);
          }
        }
      }
    } catch (err: any) {
      console.warn("Profile creation photo upload error:", err?.message);
    } finally {
      progressFillAnim.stop();
      // Complete remaining circle fill smoothly to 100%
      Animated.timing(uploadProgressAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        loopAnim.stop();
        spinAnim.setValue(0);
        setIsUploadingPhoto(false);
        setUploadSuccess(true);
        try {
          Vibration.vibrate(35);
        } catch {}
      });
    }
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Circle radius 56 -> circumference = 2 * PI * 56 ≈ 352
  const RING_CIRCUMFERENCE = 352;
  const uploadStrokeDashoffset = uploadProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  const checkUsernameAvailability = useCallback(
    (val: string) => {
      const trimmed = val.trim().toLowerCase();

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();

      if (!trimmed) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(null);
        setUsernameFeedback("");
        return;
      }

      if (trimmed.length < 3) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(false);
        setUsernameFeedback("Must be at least 3 characters");
        return;
      }

      if (trimmed.length > 20) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(false);
        setUsernameFeedback("Must not exceed 20 characters");
        return;
      }

      const validPattern = /^[a-zA-Z0-9_]+$/;
      if (!validPattern.test(trimmed)) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(false);
        setUsernameFeedback("Only letters, numbers, and underscores allowed");
        return;
      }

      if (user?.userId && trimmed === user.userId.toLowerCase()) {
        setIsCheckingUsername(false);
        setIsUsernameAvailable(true);
        setUsernameFeedback("This is your current username");
        return;
      }

      setIsCheckingUsername(true);
      setIsUsernameAvailable(null);
      setUsernameFeedback("Checking availability...");

      debounceTimerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          const res = await api.get(`/check-username?username=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
          });

          if (res.data?.available) {
            setIsUsernameAvailable(true);
            setUsernameFeedback(res.data?.message || "Username is available!");
          } else {
            setIsUsernameAvailable(false);
            setUsernameFeedback(res.data?.message || "Username is already taken");
          }
        } catch (err: any) {
          if (err?.name === "CanceledError" || err?.message === "canceled") return;
          setIsUsernameAvailable(null);
          setUsernameFeedback("Could not verify username right now");
        } finally {
          setIsCheckingUsername(false);
        }
      }, 320);
    },
    [user?.userId]
  );

  const handleUsernameChange = (text: string) => {
    setUsername(text);
    checkUsernameAvailability(text);
  };

  const handleNext = useCallback(() => {
    Keyboard.dismiss();
    setStep((prev) => Math.min(prev + 1, 7));
  }, []);

  const handleBack = useCallback(() => {
    if (step > 0 && step < 7) {
      Keyboard.dismiss();
      setStep((prev) => prev - 1);
    }
  }, [step]);

  const toggleInterest = (item: string) => {
    try {
      Vibration.vibrate(10);
    } catch {}
    setInterests((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleSaveProfile = async () => {
    if (isSubmitting) return;
    Keyboard.dismiss();
    setIsSubmitting(true);
    try {
      const safePhoto =
        profilePhoto &&
        !profilePhoto.startsWith("file://") &&
        !profilePhoto.startsWith("content://")
          ? profilePhoto
          : null;

      const payload = {
        name: name.trim(),
        username: username.trim().toLowerCase(),
        profession: profession.trim(),
        bio: bio.trim(),
        interests,
        visibility,
        image: safePhoto,
        profilePhoto: safePhoto,
      };

      const res = await api.post("/update/profile-setup", payload);

      if (res.data?.success) {
        if (updateUser) {
          updateUser(
            res.data.user || {
              ...payload,
              isProfileCompleted: true,
            }
          );
        }
        if (reload) reload().catch(() => {});
        setStep(7);
      } else {
        showToast({ title: res.data?.message || "Failed to update profile" });
      }
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.message ||
        err?.message ||
        "An error occurred while saving your profile.";
      showToast({ title: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueToHome = () => {
    navigation.reset({ index: 0, routes: [{ name: "Tabs" }] });
  };

  const handleViewProfile = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Tabs", params: { screen: "Profile" } }],
    });
  };

  const isFormStep = step > 0 && step < 7;

  const isContinueDisabled =
    (step === 1 && (name.trim().length < 2 || isUploadingPhoto)) ||
    (step === 2 &&
      (username.trim().length < 3 ||
        isUsernameAvailable !== true ||
        isCheckingUsername)) ||
    (step === 3 && !profession) ||
    (step === 4 && bio.trim().length < 3) ||
    (step === 5 && interests.length === 0) ||
    (step === 6 && !visibility) ||
    isSubmitting;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const finalProgressWidthStr = finalProgressFill.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const cardExpandY = finalCardReveal.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  const OrbitWrapper = ({
    children,
    compact = false,
  }: {
    children: React.ReactNode;
    compact?: boolean;
  }) => {
    const size = compact ? 110 : 144;
    const c = size / 2;
    return (
      <View
        style={[
          styles.orbitContainer,
          compact && { width: 110, height: 110, marginBottom: 12 },
        ]}
      >
        <Svg
          style={{ position: "absolute" }}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <Ellipse
            cx={c}
            cy={c}
            rx={c * 0.72}
            ry={c * 0.26}
            stroke={THEME.tealPrimary}
            strokeWidth="1"
            opacity="0.32"
            transform={`rotate(-25 ${c} ${c})`}
          />
          <Ellipse
            cx={c}
            cy={c}
            rx={c * 0.84}
            ry={c * 0.32}
            stroke={THEME.tealPrimary}
            strokeWidth="1"
            opacity="0.16"
            transform={`rotate(35 ${c} ${c})`}
          />
          <Circle cx={c * 0.38} cy={c * 0.62} r="1.6" fill={THEME.tealPrimary} opacity="0.8" />
          <Circle cx={c * 1.62} cy={c * 1.38} r="2.2" fill={THEME.tealLight} opacity="0.6" />
          <Circle cx={c * 1.38} cy={c * 0.38} r="1.2" fill={THEME.tealPrimary} opacity="0.9" />
        </Svg>
        {children}
      </View>
    );
  };

  /* ------------------------------------------------------------------------
   * Step 0: Intro Screen
   * --------------------------------------------------------------------- */
  const renderIntro = () => (
    <View style={styles.introWrapper}>
      <View style={styles.introHeader}>
        <Image
          source={require("../../assets/text.png")}
          style={styles.textLogo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.introContent}>
        <Text style={styles.introTitle}>Let's make it yours.</Text>
        <Text style={styles.introSubtitle}>
          A few details will help us personalize your READAPT experience.
        </Text>
        <Image
          source={require("../../assets/glowpage.png")}
          style={styles.introImage}
          resizeMode="contain"
        />
      </View>

      <View style={styles.introFooter}>
        <TouchableOpacity
          style={styles.primaryPillBtn}
          activeOpacity={0.88}
          onPress={handleNext}
        >
          <LinearGradient
            colors={[THEME.tealLight, THEME.tealPrimary, THEME.tealDeep]}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.92, y: 1 }}
            style={styles.btnGradientFill}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.introHint}>Takes less than a minute</Text>
      </View>
    </View>
  );

  /* ------------------------------------------------------------------------
   * Step 1: Profile Photo (Blue Progress Ring + Camera Icon) & Name Counter
   * --------------------------------------------------------------------- */
  const renderNameStep = () => (
    <View style={styles.stepContainer}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePhotoSelect}
        style={styles.photoPickerWrapper}
      >
        <View
          style={[
            styles.photoCircle,
            uploadSuccess && !isUploadingPhoto && styles.photoCircleBlue,
          ]}
        >
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.photoImage} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Svg
                width={34}
                height={34}
                viewBox="0 0 24 24"
                fill="none"
                stroke={THEME.textSecondary}
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <Circle cx="12" cy="13" r="4" />
              </Svg>
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </View>
          )}
        </View>

        {/* Spinning Progressive Border Fill Ring during upload */}
        {isUploadingPhoto && (
          <Animated.View
            style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}
            pointerEvents="none"
          >
            <Svg width="124" height="124" viewBox="0 0 124 124">
              <Circle
                cx="62"
                cy="62"
                r="56"
                stroke="rgba(56, 189, 248, 0.18)"
                strokeWidth="4"
                fill="none"
              />
              <AnimatedCircle
                cx="62"
                cy="62"
                r="56"
                stroke={THEME.photoBlue}
                strokeWidth="4"
                strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                strokeDashoffset={uploadStrokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </Animated.View>
        )}

        {/* Completed Solid Blue Ring */}
        {uploadSuccess && !isUploadingPhoto && (
          <View style={styles.successRing} pointerEvents="none">
            <Svg width="124" height="124" viewBox="0 0 124 124">
              <Circle
                cx="62"
                cy="62"
                r="56"
                stroke={THEME.photoBlue}
                strokeWidth="3.5"
                fill="none"
              />
            </Svg>
          </View>
        )}

        {/* Bottom-Right Camera Icon Badge */}
        <View style={styles.cameraBadge}>
          <Svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <Circle cx="12" cy="13" r="4" />
          </Svg>
        </View>
      </TouchableOpacity>

      <Text style={styles.stepTitle}>What's your name?</Text>
      <Text style={styles.stepSubtitle}>
        Upload a profile photo and enter your full name.
      </Text>

      <View style={styles.nameInputCard}>
        <TextInput
          style={styles.nameTextInput}
          placeholder="e.g. Alex Morgan"
          placeholderTextColor={THEME.textMuted}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX_LENGTH}
          returnKeyType="done"
        />
        <Text
          style={[
            styles.inlineCharCounter,
            name.length >= NAME_MAX_LENGTH && { color: THEME.tealPrimary },
          ]}
        >
          {name.length}/{NAME_MAX_LENGTH}
        </Text>
      </View>
    </View>
  );

  /* ------------------------------------------------------------------------
   * Step 2: Choose a Username (Keyboard-Safe, Zero Input Clipping)
   * --------------------------------------------------------------------- */
  const renderUsernameStep = () => (
    <View style={styles.usernameStepContainer}>
      <OrbitWrapper compact>
        <Svg
          width={36}
          height={36}
          viewBox="0 0 24 24"
          fill="none"
          stroke={THEME.tealPrimary}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Circle cx="12" cy="12" r="4" />
          <Path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
        </Svg>
      </OrbitWrapper>

      <Text style={styles.stepTitle}>Choose a username</Text>
      <Text style={[styles.stepSubtitle, { marginBottom: 20 }]}>
        Pick a unique handle for your profile.
      </Text>

      <View
        style={[
          styles.inputRow,
          isUsernameAvailable === false && styles.inputError,
          isUsernameAvailable === true && styles.inputSuccess,
        ]}
      >
        <Text style={styles.fixedAt}>@</Text>
        <TextInput
          style={styles.inputFlex}
          placeholder="username"
          placeholderTextColor={THEME.textMuted}
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          returnKeyType="done"
        />
        <View style={styles.availabilityIconWrap}>
          {isCheckingUsername && (
            <ActivityIndicator size="small" color={THEME.tealPrimary} />
          )}
          {!isCheckingUsername && isUsernameAvailable === true && (
            <Svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke={THEME.tealPrimary}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          )}
          {!isCheckingUsername && isUsernameAvailable === false && (
            <Svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke={THEME.errorColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Line x1="18" y1="6" x2="6" y2="18" />
              <Line x1="6" y1="6" x2="18" y2="18" />
            </Svg>
          )}
        </View>
      </View>

      {usernameFeedback ? (
        <View style={styles.feedbackRow}>
          <Text
            style={[
              styles.feedbackText,
              isUsernameAvailable === true && { color: THEME.tealPrimary },
              isUsernameAvailable === false && { color: THEME.errorColor },
            ]}
          >
            {usernameFeedback}
          </Text>
        </View>
      ) : null}

      <View style={styles.usernameGuidelines}>
        <Text style={styles.guidelineText}>• 3 to 20 characters</Text>
        <Text style={styles.guidelineText}>
          • Only letters, numbers, and underscores
        </Text>
      </View>
    </View>
  );

  /* ------------------------------------------------------------------------
   * Step 3: Professions with Minimal Material-Style Vector Icons
   * --------------------------------------------------------------------- */
  const renderProfessionStep = () => {
    const options: Exclude<Profession, "">[] = [
      "Student",
      "Professional",
      "Researcher",
      "Entrepreneur",
      "Content Creator",
      "Educator",
      "Developer",
      "Designer",
      "Writer",
      "Other",
    ];
    return (
      <View style={styles.stepContainer}>
        <OrbitWrapper compact>
          <Svg
            width={36}
            height={36}
            viewBox="0 0 24 24"
            fill="none"
            stroke={THEME.tealPrimary}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </Svg>
        </OrbitWrapper>
        <Text style={styles.stepTitle}>What's your profession?</Text>
        <Text style={[styles.stepSubtitle, { marginBottom: 22 }]}>
          Select what describes you best.
        </Text>
        <View style={styles.grid}>
          {options.map((opt) => {
            const isActive = profession === opt;
            const iconColor = isActive ? THEME.tealPrimary : THEME.textSecondary;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.gridOption, isActive && styles.gridOptionActive]}
                activeOpacity={0.75}
                onPress={() => {
                  try {
                    Vibration.vibrate(10);
                  } catch {}
                  setProfession(opt);
                }}
              >
                <ProfessionIcon type={opt} color={iconColor} />
                <Text
                  style={[
                    styles.gridOptionText,
                    isActive && styles.gridOptionTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  /* ------------------------------------------------------------------------
   * Step 4: Bio
   * --------------------------------------------------------------------- */
  const renderBioStep = () => (
    <View style={styles.stepContainer}>
      <OrbitWrapper compact>
        <Svg
          width={36}
          height={36}
          viewBox="0 0 24 24"
          fill="none"
          stroke={THEME.tealPrimary}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <Line x1="16" y1="8" x2="2" y2="22" />
          <Line x1="17.5" y1="15" x2="9" y2="15" />
        </Svg>
      </OrbitWrapper>
      <Text style={styles.stepTitle}>Write a short bio</Text>
      <Text style={[styles.stepSubtitle, { marginBottom: 22 }]}>
        Tell others a little about yourself in a sentence or two.
      </Text>
      <View style={styles.bioWrapper}>
        <TextInput
          style={[styles.inputFlex, styles.textArea]}
          placeholder="e.g. Voracious reader, exploring science, finance, and human psychology..."
          placeholderTextColor={THEME.textMuted}
          value={bio}
          onChangeText={setBio}
          multiline
          textAlignVertical="top"
          maxLength={160}
        />
        <Text style={styles.charCounter}>{bio.length}/160</Text>
      </View>
    </View>
  );

  /* ------------------------------------------------------------------------
   * Step 5: Interests Selection (Icon Cards matching reference screen)
   * --------------------------------------------------------------------- */
  const InterestCard = ({
    topic,
    isActive,
    onPress,
  }: {
    topic: string;
    isActive: boolean;
    onPress: (id: string) => void;
  }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    return (
      <Pressable
        style={styles.interestCardOuter}
        onPressIn={() =>
          Animated.spring(scaleAnim, {
            toValue: 0.95,
            useNativeDriver: true,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
          }).start()
        }
        onPress={() => onPress(topic)}
      >
        <Animated.View
          style={[
            styles.interestCardInner,
            isActive && styles.interestCardActive,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          {isActive && (
            <View style={styles.interestCheckBadge}>
              <Svg
                width={13}
                height={13}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#041614"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Polyline points="20 6 9 17 4 12" />
              </Svg>
            </View>
          )}

          <View style={styles.interestIconBox}>
            <InterestVectorIcon topic={topic} />
          </View>
          <Text style={styles.interestCardLabel} numberOfLines={1}>
            {topic}
          </Text>
        </Animated.View>
      </Pressable>
    );
  };

  const renderInterestsStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle} adjustsFontSizeToFit numberOfLines={2}>
        Select Your Interests
      </Text>
      <Text style={[styles.stepSubtitle, { marginBottom: 22 }]}>
        Choose topics that interest you.{"\n"}You can select multiple.
      </Text>
      <View style={styles.interestGrid}>
        {INTEREST_OPTIONS.map((topic) => (
          <InterestCard
            key={topic}
            topic={topic}
            isActive={interests.includes(topic)}
            onPress={toggleInterest}
          />
        ))}
      </View>
    </View>
  );

  /* ------------------------------------------------------------------------
   * Step 6: Profile Visibility
   * --------------------------------------------------------------------- */
  const renderVisibilityStep = () => (
    <View style={styles.stepContainer}>
      <OrbitWrapper compact>
        <Svg
          width={36}
          height={36}
          viewBox="0 0 24 24"
          fill="none"
          stroke={THEME.tealPrimary}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <Circle cx="12" cy="12" r="3" />
        </Svg>
      </OrbitWrapper>
      <Text style={styles.stepTitle}>Choose profile visibility</Text>
      <Text style={[styles.stepSubtitle, { marginBottom: 24 }]}>
        Control who can see your learning profile.
      </Text>

      <TouchableOpacity
        style={[
          styles.visibilityCard,
          visibility === "Public" && styles.visibilityCardActive,
        ]}
        activeOpacity={0.78}
        onPress={() => setVisibility("Public")}
      >
        <Svg
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill="none"
          stroke={
            visibility === "Public" ? THEME.tealPrimary : THEME.textSecondary
          }
          strokeWidth="1.7"
        >
          <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <Circle cx="12" cy="12" r="3" />
        </Svg>
        <View style={styles.visTextWrap}>
          <Text style={styles.visTitle}>Public Profile</Text>
          <Text style={styles.visDesc}>
            Visible to the community. Others can see your achievements,
            interests, and stats.
          </Text>
        </View>
        <View
          style={[
            styles.radioBtn,
            visibility === "Public" && styles.radioBtnActive,
          ]}
        >
          {visibility === "Public" && <View style={styles.radioInner} />}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.visibilityCard,
          visibility === "Private" && styles.visibilityCardActive,
        ]}
        activeOpacity={0.78}
        onPress={() => setVisibility("Private")}
      >
        <Svg
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill="none"
          stroke={
            visibility === "Private" ? THEME.tealPrimary : THEME.textSecondary
          }
          strokeWidth="1.7"
        >
          <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <Line x1="1" y1="1" x2="23" y2="23" />
        </Svg>
        <View style={styles.visTextWrap}>
          <Text style={styles.visTitle}>Private Profile</Text>
          <Text style={styles.visDesc}>
            Hidden from other members. Only you can view your personal profile
            and records.
          </Text>
        </View>
        <View
          style={[
            styles.radioBtn,
            visibility === "Private" && styles.radioBtnActive,
          ]}
        >
          {visibility === "Private" && <View style={styles.radioInner} />}
        </View>
      </TouchableOpacity>
    </View>
  );

  /* ------------------------------------------------------------------------
   * Step 7: Profile Completed (Non-Scrolling, Radial Confetti, Clean Buttons)
   * --------------------------------------------------------------------- */
  const renderSuccess = () => (
    <View style={styles.finalScreenWrapper} collapsable={false}>
      <View style={styles.finalHeaderBlock}>
        <View
          ref={tickAnchorRef}
          onLayout={handleTickLayout}
          collapsable={false}
        >
          <CompletedTickBadge />
        </View>

        <Text style={styles.finalTitle}>Profile Completed!</Text>
        <Text style={styles.finalSubtitle}>
          Your profile is ready. Welcome to READAPT!
        </Text>
      </View>

      <View style={styles.summaryCard}>
        {/* Profile Progress Bar */}
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>Profile Progress</Text>
          <Text style={styles.progressValue}>{completionPercent}%</Text>
        </View>
        <View style={styles.progressBarTrack}>
          <Animated.View
            style={[styles.progressBarFill, { width: finalProgressWidthStr }]}
          >
            <LinearGradient
              colors={[THEME.tealLight, THEME.tealPrimary, THEME.tealDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        {/* Revealed Profile Summary Card */}
        <Animated.View
          style={{
            opacity: finalCardReveal,
            transform: [{ translateY: cardExpandY }],
            marginTop: 18,
          }}
        >
          <View style={styles.finalProfileContainer}>
            {profilePhoto ? (
              <Image
                source={{ uri: profilePhoto }}
                style={styles.finalProfileImg}
              />
            ) : (
              <View
                style={[
                  styles.finalProfileImg,
                  {
                    backgroundColor: THEME.bgSurface,
                    borderWidth: 1.5,
                    borderColor: THEME.tealPrimary,
                    justifyContent: "center",
                    alignItems: "center",
                  },
                ]}
              >
                <Text
                  style={{
                    color: THEME.tealPrimary,
                    fontSize: 22,
                    fontWeight: "800",
                  }}
                >
                  {(name || "R").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.finalProfileName} numberOfLines={1}>
              {name}{" "}
              {profession ? (
                <Text style={styles.finalProfileProfession}>• {profession}</Text>
              ) : null}
            </Text>
            <Text style={styles.finalProfileUsername}>@{username}</Text>
            {bio ? (
              <Text style={styles.finalProfileBio} numberOfLines={2}>
                {bio}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </View>

      {/* Properly Spaced Bottom Side-by-Side Buttons (Zero Clipping) */}
      <View style={styles.finalButtonsRow}>
        <TouchableOpacity
          style={styles.secondaryBtnBlock}
          activeOpacity={0.78}
          onPress={handleViewProfile}
        >
          <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke={THEME.tealPrimary}
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Circle cx="12" cy="7" r="4" />
          </Svg>
          <Text style={styles.secondaryBtnBlockText} numberOfLines={1}>
            View Profile
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtnBlock}
          activeOpacity={0.86}
          onPress={handleContinueToHome}
        >
          <LinearGradient
            colors={[THEME.tealLight, THEME.tealPrimary, THEME.tealDeep]}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.92, y: 1 }}
            style={styles.primaryBtnBlockGradient}
          >
            <Svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke={THEME.textOnTeal}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <Polyline points="9 22 9 12 15 12 15 22" />
            </Svg>
            <Text style={styles.primaryBtnBlockText} numberOfLines={1}>
              Home
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0:
        return renderIntro();
      case 1:
        return renderNameStep();
      case 2:
        return renderUsernameStep();
      case 3:
        return renderProfessionStep();
      case 4:
        return renderBioStep();
      case 5:
        return renderInterestsStep();
      case 6:
        return renderVisibilityStep();
      case 7:
        return renderSuccess();
      default:
        return renderIntro();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      enabled={step !== 7}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LinearGradient
        colors={["#050C0E", THEME.bgMain, "#05090B"]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Ambient Top Teal Glow */}
      <LinearGradient
        colors={["rgba(0, 210, 180, 0.14)", "rgba(7, 11, 13, 0)"]}
        locations={[0, 0.45]}
        style={styles.ambientTopGlow}
        pointerEvents="none"
      />

      {/* Radial Confetti Burst on Profile Completed */}
      <RadialConfettiBurst
        active={step === 7}
        originX={burstOrigin.x}
        originY={burstOrigin.y}
      />

      {/* Header Navigation (Steps 1-6) */}
      {isFormStep && (
        <View style={[styles.header, { marginTop: insets.top + 10 }]}>
          <View style={styles.topProgressWrapper}>
            <Animated.View
              style={[styles.topProgressFill, { width: progressWidth }]}
            />
          </View>
          <Text style={styles.stepIndicatorText}>
            {step}/{TOTAL_STEPS}
          </Text>
        </View>
      )}

      {/* Non-scrolling fixed layout for Step 7; keyboard-safe scroll for Steps 0-6 */}
      {step === 7 ? (
        <View
          style={[
            styles.fixedFinalContainer,
            {
              paddingTop: insets.top + 14,
              paddingBottom: Math.max(insets.bottom + 16, 24),
            },
          ]}
        >
          {renderSuccess()}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            step === 0 && {
              paddingTop: insets.top + 26,
              paddingBottom: Math.max(insets.bottom + 20, 28),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderCurrentStep()}
        </ScrollView>
      )}

      {/* Footer Navigation (Steps 1-6) */}
      {isFormStep && (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom + 14, 20) },
          ]}
        >
          <View style={styles.footerRow}>
            {step > 0 && (
              <TouchableOpacity
                style={styles.backSquareBtn}
                onPress={handleBack}
                activeOpacity={0.78}
              >
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={THEME.textPrimary}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Line x1="19" y1="12" x2="5" y2="12" />
                  <Polyline points="12 19 5 12 12 5" />
                </Svg>
              </TouchableOpacity>
            )}

            {step === 6 ? (
              <TouchableOpacity
                style={[
                  styles.primaryPillBtn,
                  isContinueDisabled && styles.primaryBtnDisabled,
                  { flex: 1 },
                ]}
                activeOpacity={0.86}
                onPress={handleSaveProfile}
                disabled={isContinueDisabled}
              >
                {isSubmitting ? (
                  <View style={styles.disabledBtnInner}>
                    <ActivityIndicator color={THEME.tealPrimary} size="small" />
                  </View>
                ) : isContinueDisabled ? (
                  <View style={styles.disabledBtnInner}>
                    <Text style={styles.primaryBtnTextDisabled}>
                      Complete Profile
                    </Text>
                  </View>
                ) : (
                  <LinearGradient
                    colors={[THEME.tealLight, THEME.tealPrimary, THEME.tealDeep]}
                    start={{ x: 0.08, y: 0 }}
                    end={{ x: 0.92, y: 1 }}
                    style={styles.btnGradientFill}
                  >
                    <Text style={styles.primaryBtnText}>Complete Profile</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.primaryPillBtn,
                  isContinueDisabled && styles.primaryBtnDisabled,
                  { flex: 1 },
                ]}
                activeOpacity={0.86}
                onPress={handleNext}
                disabled={isContinueDisabled}
              >
                {isContinueDisabled ? (
                  <View style={styles.disabledBtnInner}>
                    <Text style={styles.primaryBtnTextDisabled}>Continue</Text>
                  </View>
                ) : (
                  <LinearGradient
                    colors={[THEME.tealLight, THEME.tealPrimary, THEME.tealDeep]}
                    start={{ x: 0.08, y: 0 }}
                    end={{ x: 0.92, y: 1 }}
                    style={styles.btnGradientFill}
                  >
                    <Text style={styles.primaryBtnText}>Continue</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

/* --------------------------------------------------------------------------
 * Styles
 * ----------------------------------------------------------------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bgMain,
  },
  ambientTopGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  fixedFinalContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 14,
  },
  stepIndicatorText: {
    color: THEME.textSecondary,
    fontSize: 13.5,
    fontWeight: "700",
    marginLeft: 12,
    width: 30,
    textAlign: "right",
  },
  topProgressWrapper: {
    flex: 1,
    height: 7,
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 4,
    overflow: "hidden",
  },
  topProgressFill: {
    height: "100%",
    backgroundColor: THEME.tealPrimary,
    borderRadius: 4,
  },
  stepContainer: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
  },
  usernameStepContainer: {
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 16,
  },
  orbitContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 144,
    height: 144,
    marginBottom: 16,
  },

  /* Step 1: Photo & Name */
  photoPickerWrapper: {
    width: 124,
    height: 124,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 8,
  },
  photoCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: THEME.bgCard,
    borderWidth: 2,
    borderColor: THEME.border,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  photoCircleBlue: {
    borderColor: THEME.photoBlue,
  },
  photoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  spinnerRing: {
    position: "absolute",
    width: 124,
    height: 124,
    justifyContent: "center",
    alignItems: "center",
  },
  successRing: {
    position: "absolute",
    width: 124,
    height: 124,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: THEME.photoBlueDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: THEME.bgMain,
    zIndex: 20,
  },
  nameInputCard: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 18,
    paddingHorizontal: 18,
    height: 58,
  },
  nameTextInput: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 16.5,
    fontWeight: "500",
    paddingVertical: 14,
  },
  inlineCharCounter: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 10,
  },

  /* Step 0: Intro */
  introWrapper: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  introHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  textLogo: {
    width: 350,
    height: 210,
  },
  introContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  introTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: THEME.textPrimary,
    textAlign: "center",
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  introSubtitle: {
    fontSize: 15.5,
    color: THEME.textSecondary,
    textAlign: "center",
    lineHeight: 22.5,
    paddingHorizontal: 10,
    marginBottom: 26,
  },
  introImage: {
    width: SCREEN_WIDTH * 0.76,
    height: SCREEN_WIDTH * 0.64,
  },
  introFooter: {
    width: "100%",
    paddingTop: 12,
  },
  introHint: {
    color: THEME.textMuted,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 14,
  },

  /* Shared Typography */
  stepTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  stepSubtitle: {
    fontSize: 15,
    color: THEME.textSecondary,
    marginBottom: 28,
    textAlign: "center",
    lineHeight: 21.5,
  },

  /* Step 2: Username */
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 18,
    paddingHorizontal: 18,
    height: 56,
  },
  inputError: {
    borderColor: THEME.errorColor,
    backgroundColor: "rgba(239, 68, 68, 0.06)",
  },
  inputSuccess: {
    borderColor: THEME.tealPrimary,
    backgroundColor: "rgba(0, 210, 180, 0.06)",
  },
  fixedAt: {
    color: THEME.tealPrimary,
    fontSize: 17,
    fontWeight: "700",
    marginRight: 6,
  },
  inputFlex: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 16.5,
    fontWeight: "500",
    paddingVertical: 14,
  },
  availabilityIconWrap: {
    marginLeft: 10,
    width: 24,
    alignItems: "center",
  },
  feedbackRow: {
    width: "100%",
    marginTop: 8,
    paddingHorizontal: 6,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  usernameGuidelines: {
    width: "100%",
    marginTop: 14,
    paddingHorizontal: 8,
    gap: 5,
  },
  guidelineText: {
    color: THEME.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },

  /* Step 4: Bio */
  bioWrapper: {
    width: "100%",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 18,
    overflow: "hidden",
  },
  textArea: {
    height: 135,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  charCounter: {
    position: "absolute",
    bottom: 12,
    right: 16,
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },

  /* Step 3: Professions Grid with Icons */
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    rowGap: 11,
  },
  gridOption: {
    width: "48.2%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  gridOptionActive: {
    borderColor: THEME.tealPrimary,
    backgroundColor: "rgba(0, 210, 180, 0.12)",
  },
  gridOptionText: {
    flex: 1,
    color: THEME.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  gridOptionTextActive: {
    color: THEME.textPrimary,
    fontWeight: "700",
  },

  /* Step 5: Interests Icon Cards (Matching Reference Screenshot) */
  interestGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    rowGap: 14,
  },
  interestCardOuter: {
    width: "47.8%",
  },
  interestCardInner: {
    width: "100%",
    height: 112,
    borderRadius: 18,
    backgroundColor: "#0D1A1E",
    borderWidth: 1.4,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  interestCardActive: {
    borderColor: THEME.tealPrimary,
    backgroundColor: "#0F262A",
    shadowColor: THEME.tealPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  interestIconBox: {
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  interestCardLabel: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  interestCheckBadge: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: THEME.tealPrimary,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Step 6: Visibility */
  visibilityCard: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  visibilityCardActive: {
    borderColor: THEME.tealPrimary,
    backgroundColor: "rgba(0, 210, 180, 0.09)",
  },
  visTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },
  visTitle: {
    color: THEME.textPrimary,
    fontSize: 16.5,
    fontWeight: "700",
    marginBottom: 4,
  },
  visDesc: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  radioBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioBtnActive: {
    borderColor: THEME.tealPrimary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.tealPrimary,
  },

  /* Step 7: Profile Completed (Non-Scrolling & Unclipped) */
  finalScreenWrapper: {
    flex: 1,
    justifyContent: "space-between",
    width: "100%",
  },
  finalHeaderBlock: {
    alignItems: "center",
  },
  completedTickWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  finalTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: THEME.textPrimary,
    textAlign: "center",
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  finalSubtitle: {
    fontSize: 14.5,
    color: THEME.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  summaryCard: {
    width: "100%",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.borderTeal,
    borderRadius: 20,
    padding: 20,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressLabel: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: "600",
  },
  progressValue: {
    color: THEME.tealPrimary,
    fontSize: 14.5,
    fontWeight: "800",
  },
  progressBarTrack: {
    width: "100%",
    height: 9,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  finalProfileContainer: {
    alignItems: "center",
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  finalProfileImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 10,
  },
  finalProfileName: {
    color: THEME.textPrimary,
    fontSize: 18.5,
    fontWeight: "800",
    marginBottom: 3,
    textAlign: "center",
  },
  finalProfileProfession: {
    color: THEME.textSecondary,
    fontWeight: "500",
    fontSize: 15,
  },
  finalProfileUsername: {
    color: THEME.tealPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  finalProfileBio: {
    color: THEME.textSecondary,
    fontSize: 13.5,
    textAlign: "center",
    lineHeight: 19,
  },
  finalButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 12,
    paddingTop: 8,
  },
  secondaryBtnBlock: {
    flex: 1,
    height: 54,
    flexDirection: "row",
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.borderTeal,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  secondaryBtnBlockText: {
    color: THEME.tealPrimary,
    fontSize: 14.5,
    fontWeight: "700",
  },
  primaryBtnBlock: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    overflow: "hidden",
    shadowColor: THEME.tealPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryBtnBlockGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  primaryBtnBlockText: {
    color: THEME.textOnTeal,
    fontSize: 15,
    fontWeight: "800",
  },

  /* Footer & Primary Pill Buttons */
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backSquareBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  primaryPillBtn: {
    height: 54,
    borderRadius: 27,
    overflow: "hidden",
    shadowColor: THEME.tealPrimary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  btnGradientFill: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  disabledBtnInner: {
    flex: 1,
    backgroundColor: "#141D21",
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnText: {
    color: THEME.textOnTeal,
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  primaryBtnTextDisabled: {
    color: THEME.textMuted,
    fontSize: 16.5,
    fontWeight: "700",
  },
});

export default ProfileCreation;