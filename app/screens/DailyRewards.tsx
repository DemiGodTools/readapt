import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  StatusBar,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// App Accent Palette (Readapt Theme)
const COLORS = {
  bgTop: '#020914',
  bgBottom: '#01050A',
  accent: '#00D2B4',
  accentBright: '#34F5D8',
  accentLight: '#5EEAD4',
  accentMid: '#2DD4BF',
  accentDark: '#01796F',
  accentDeep: '#015049',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0BAC9',
  textMuted: '#8A94A6',
};

// --- 3D Isometric Teal Gift Box (Matched to ReferralCodeScreen, without side confetti) ---
const IsometricGiftBox = () => {
  return (
    <Svg width={176} height={164} viewBox="0 0 176 164" fill="none">
      <Defs>
        <RadialGradient id="giftAmbientGlow" cx="50%" cy="54%" r="50%">
          <Stop offset="0%" stopColor={COLORS.accent} stopOpacity="0.38" />
          <Stop offset="65%" stopColor={COLORS.accentDark} stopOpacity="0.12" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>

        <SvgLinearGradient id="boxLeftGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={COLORS.accent} />
          <Stop offset="100%" stopColor={COLORS.accentDark} />
        </SvgLinearGradient>

        <SvgLinearGradient id="boxRightGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#0D9488" />
          <Stop offset="100%" stopColor={COLORS.accentDeep} />
        </SvgLinearGradient>

        <SvgLinearGradient id="lidTopGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#99F6E4" />
          <Stop offset="55%" stopColor={COLORS.accentLight} />
          <Stop offset="100%" stopColor={COLORS.accent} />
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
      <Path d="M42 66 L88 84 L88 95 L42 77 Z" fill={COLORS.accentMid} />
      {/* Box Lid - Right Rim */}
      <Path d="M88 84 L134 66 L134 77 L88 95 Z" fill={COLORS.accentDark} />
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
        fill={COLORS.accentDark}
      />
      <Path
        d="M86 64 C72 44, 53 40, 56 54 C58 63, 74 65, 86 64 Z"
        fill="#CCFBF1"
      />

      <Path
        d="M90 64 C106 50, 124 46, 120 60 C117 69, 101 67, 90 65 Z"
        fill={COLORS.accentDeep}
      />
      <Path
        d="M90 64 C104 44, 123 40, 120 54 C118 63, 102 65, 90 64 Z"
        fill="#F0FDFA"
      />

      {/* Center Bow Knot */}
      <Circle cx="88" cy="63" r="6.5" fill={COLORS.accent} />
      <Circle cx="87" cy="61.5" r="3" fill="#F0FDFA" opacity="0.85" />
    </Svg>
  );
};

// --- Decorative Sweeping Top & Bottom Waves ---
const BackgroundWaves = () => (
  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Defs>
        <SvgLinearGradient id="topWaveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={COLORS.accent} stopOpacity="0.16" />
          <Stop offset="50%" stopColor="#00A890" stopOpacity="0.06" />
          <Stop offset="100%" stopColor={COLORS.bgTop} stopOpacity="0" />
        </SvgLinearGradient>

        <SvgLinearGradient id="bottomWaveBack" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={COLORS.accentDark} stopOpacity="0.24" />
          <Stop offset="50%" stopColor={COLORS.accent} stopOpacity="0.14" />
          <Stop offset="100%" stopColor={COLORS.accentBright} stopOpacity="0.3" />
        </SvgLinearGradient>

        <SvgLinearGradient id="bottomWaveFront" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={COLORS.accent} stopOpacity="0.35" />
          <Stop offset="50%" stopColor={COLORS.accentDeep} stopOpacity="0.12" />
          <Stop offset="100%" stopColor={COLORS.accentBright} stopOpacity="0.42" />
        </SvgLinearGradient>

        <SvgLinearGradient id="strokeHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={COLORS.accent} stopOpacity="0.35" />
          <Stop offset="50%" stopColor={COLORS.accentBright} stopOpacity="0.15" />
          <Stop offset="100%" stopColor={COLORS.accent} stopOpacity="0.45" />
        </SvgLinearGradient>
      </Defs>

      {/* Top Sweeping Wave */}
      <Path
        d={`M0 0 L${width * 0.85} 0 C${width * 0.65} ${height * 0.09}, ${width * 0.25} ${height * 0.08}, 0 ${height * 0.19} Z`}
        fill="url(#topWaveGrad)"
      />
      <Path
        d={`M0 ${height * 0.19} C${width * 0.25} ${height * 0.08}, ${width * 0.65} ${height * 0.09}, ${width * 0.85} 0`}
        stroke="url(#strokeHighlight)"
        strokeWidth="1.2"
        fill="none"
      />

      {/* Subtle Ambient Mid Arc */}
      <Path
        d={`M${width * 0.15} ${height * 0.12} C${width * 0.55} ${height * 0.05}, ${width * 0.88} ${height * 0.14}, ${width} ${height * 0.24}`}
        stroke={COLORS.accent}
        strokeOpacity="0.12"
        strokeWidth="1"
        fill="none"
      />

      {/* Bottom Sweeping Layered Waves */}
      <Path
        d={`M0 ${height * 0.89} C${width * 0.32} ${height * 0.96}, ${width * 0.68} ${height * 0.86}, ${width} ${height * 0.85} L${width} ${height} L0 ${height} Z`}
        fill="url(#bottomWaveBack)"
      />
      <Path
        d={`M0 ${height * 0.86} C${width * 0.28} ${height * 0.85}, ${width * 0.58} ${height * 0.97}, ${width} ${height * 0.91} L${width} ${height} L0 ${height} Z`}
        fill="url(#bottomWaveFront)"
      />
      <Path
        d={`M0 ${height * 0.86} C${width * 0.28} ${height * 0.85}, ${width * 0.58} ${height * 0.97}, ${width} ${height * 0.91}`}
        stroke="url(#strokeHighlight)"
        strokeWidth="1.2"
        fill="none"
      />
      <Path
        d={`M0 ${height * 0.93} C${width * 0.35} ${height * 0.99}, ${width * 0.72} ${height * 0.91}, ${width} ${height * 0.87}`}
        stroke={COLORS.accentBright}
        strokeOpacity="0.25"
        strokeWidth="1"
        fill="none"
      />
    </Svg>
  </View>
);

const triggerLightHaptic = () => {
  Vibration.vibrate(8);
};

export default function DailyRewards({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const btnScale = useSharedValue(1);

  // Idle hover & 3D touch-drag shared values
  const giftFloat = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const isInteracting = useSharedValue(0);

  // Subtle idle floating breath when untouched
  useEffect(() => {
    giftFloat.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(3, { duration: 2200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [giftFloat]);

  // Single-touch 3D rotation & smooth return on release
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      isInteracting.value = withTiming(1, { duration: 150 });
      runOnJS(triggerLightHaptic)();
    })
    .onUpdate((event) => {
      dragX.value = Math.max(-140, Math.min(140, event.translationX));
      dragY.value = Math.max(-140, Math.min(140, event.translationY));
    })
    .onFinalize(() => {
      isInteracting.value = withTiming(0, { duration: 300 });
      dragX.value = withSpring(0, {
        damping: 18,
        stiffness: 150,
        mass: 0.8,
      });
      dragY.value = withSpring(0, {
        damping: 18,
        stiffness: 150,
        mass: 0.8,
      });
    });

  // 3D perspective rotation style driven by single-touch drag
  const gift3DStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(
      dragX.value,
      [-140, 140],
      [-34, 34],
      Extrapolation.CLAMP
    );
    const rotateX = interpolate(
      dragY.value,
      [-140, 140],
      [28, -28],
      Extrapolation.CLAMP
    );
    const rotateZ = interpolate(
      dragX.value,
      [-140, 140],
      [-6, 6],
      Extrapolation.CLAMP
    );
    const scale = interpolate(isInteracting.value, [0, 1], [1, 1.07]);
    const idleOffset = interpolate(isInteracting.value, [0, 1], [giftFloat.value, 0]);

    return {
      transform: [
        { perspective: 750 },
        { translateY: idleOffset + dragY.value * 0.08 },
        { translateX: dragX.value * 0.08 },
        { rotateX: `${rotateX}deg` },
        { rotateY: `${rotateY}deg` },
        { rotateZ: `${rotateZ}deg` },
        { scale },
      ],
    };
  });

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleGotIt = () => {
    Vibration.vibrate(12);
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate?.('Home');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgTop} />

      {/* Base Dark Gradient */}
      <LinearGradient
        colors={[COLORS.bgTop, '#030D1C', COLORS.bgBottom]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Sweeping Top & Bottom Waves */}
      <BackgroundWaves />

      {/* Main Content */}
      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 32),
          },
        ]}
      >
        {/* Top Hero: Interactive 3D Rotatable Gift Box */}
        <View style={styles.heroArea}>
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.giftTouchTarget, gift3DStyle]}>
              <IsometricGiftBox />
            </Animated.View>
          </GestureDetector>
        </View>

        {/* Center Typography */}
        <View style={styles.textBlock}>
          <Text style={styles.title}>Rewards are{'\n'}Coming Soon!</Text>
          <Text style={styles.subtitle}>
            Keep inviting your friends.{'\n'}
            Exciting rewards will be available{'\n'}
            with the upcoming subscription launch.
          </Text>
        </View>

        {/* Primary Pill CTA Button */}
        <View style={styles.ctaBlock}>
          <Pressable
            onPressIn={() => {
              btnScale.value = withTiming(0.97, { duration: 90 });
            }}
            onPressOut={() => {
              btnScale.value = withTiming(1, { duration: 120 });
            }}
            onPress={handleGotIt}
          >
            <Animated.View style={[styles.gotItButton, btnAnimStyle]}>
              <LinearGradient
                colors={[COLORS.accentBright, COLORS.accent, '#00A890']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.gotItText}>Got It</Text>
            </Animated.View>
          </Pressable>

          {/* Footer Tagline */}
          <Text style={styles.footerTagline}>
            Together, let's build a{'\n'}bigger learning community!
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgTop,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  heroArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    height: 210,
    width: '100%',
  },
  giftTouchTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 42,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 37,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    paddingHorizontal: 8,
  },
  ctaBlock: {
    width: '100%',
    alignItems: 'center',
  },
  gotItButton: {
    width: width - 56,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  gotItText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#01050A',
    letterSpacing: 0.2,
  },
  footerTagline: {
    marginTop: 26,
    fontSize: 13.5,
    fontWeight: '400',
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});