import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  interpolate,
  Easing,
} from "react-native-reanimated";
import Svg, { Path, Ellipse, Circle, G } from "react-native-svg";
import PopButton from "../props/PopButton";
import pallete from "../../lib/Colors";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// Palette matched directly to your reference sleepy cat illustration
const CAT_COLORS = {
  outline: "#0A1426",
  bodyBase: "#166E70",
  bodyHighlight: "#269E9E",
  bodyShine: "#64D2CE",
  stripeDark: "#0E4C52",
  headBase: "#135D63",
  mouthDeep: "#4E1B61",
  mouthMid: "#7A2E8C",
  tongue: "#D16BA5",
  fang: "#F8FAFC",
  nose: "#8A338C",
  navel: "#6E2B7E",
  dropOuter: "#33B5C8",
  dropInner: "#9CF2F5",
  dropHighlight: "#FFFFFF",
  sparkleFill: "#F2A8D8",
  sparkleStroke: "#B05D9B",
  shadow: "#0B1926",
};

// --- Twinkling 4-Point Sparkle Star ---
const TwinkleStar = ({
  x,
  y,
  size,
  delay = 0,
  duration = 1800,
}: {
  x: number;
  y: number;
  size: number;
  delay?: number;
  duration?: number;
}) => {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: duration / 2, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedProps = useAnimatedProps(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.78, 1.18]);
    const dy = interpolate(pulse.value, [0, 1], [2, -4]);
    const opacity = interpolate(pulse.value, [0, 1], [0.65, 1]);
    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y + dy },
        { scale },
      ],
    };
  });

  // 4-point concave diamond star path centered at (0,0)
  const r = size;
  const inner = size * 0.24;
  const d = `M 0 ${-r} Q ${inner * 0.4} ${-inner * 0.4} ${r} 0 Q ${inner * 0.4} ${inner * 0.4} 0 ${r} Q ${-inner * 0.4} ${inner * 0.4} ${-r} 0 Q ${-inner * 0.4} ${-inner * 0.4} 0 ${-r} Z`;

  return (
    <AnimatedG animatedProps={animatedProps}>
      <Path
        d={d}
        fill={CAT_COLORS.sparkleFill}
        stroke={CAT_COLORS.sparkleStroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </AnimatedG>
  );
};

// --- Alive Sleepy Cat Illustration ---
const SleepyCatAnimation = () => {
  const breath = useSharedValue(0);
  const tailWag = useSharedValue(0);
  const dropPulse = useSharedValue(0);

  useEffect(() => {
    // Deep slow sleepy inhale/exhale cycle
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2100, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    // Lazy dream tail sway
    tailWag.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    // Drool / sweat drop gentle swell
    dropPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  // Belly breathing expansion
  const bellyAnimatedProps = useAnimatedProps(() => {
    const scaleY = interpolate(breath.value, [0, 1], [1, 1.055]);
    const scaleX = interpolate(breath.value, [0, 1], [1, 1.015]);
    const translateY = interpolate(breath.value, [0, 1], [0, -4]);
    return {
      transform: [
        { translateX: 195 },
        { translateY: 190 + translateY },
        { scaleX },
        { scaleY },
        { translateX: -195 },
        { translateY: -190 },
      ],
    };
  });

  // Head slight nod with breath
  const headAnimatedProps = useAnimatedProps(() => {
    const rotate = interpolate(breath.value, [0, 1], [0, -2.5]);
    const translateY = interpolate(breath.value, [0, 1], [0, -1.5]);
    return {
      transform: [
        { translateX: 112 },
        { translateY: 165 + translateY },
        { rotate: `${rotate}deg` },
        { translateX: -112 },
        { translateY: -165 },
      ],
    };
  });

  // Striped tail gentle wag
  const tailAnimatedProps = useAnimatedProps(() => {
    const rotate = interpolate(tailWag.value, [0, 1], [-4, 7]);
    return {
      transform: [
        { translateX: 258 },
        { translateY: 185 },
        { rotate: `${rotate}deg` },
        { translateX: -258 },
        { translateY: -185 },
      ],
    };
  });

  // Tear/drool drop subtle stretch
  const dropAnimatedProps = useAnimatedProps(() => {
    const scaleY = interpolate(dropPulse.value, [0, 1], [0.95, 1.1]);
    const translateY = interpolate(dropPulse.value, [0, 1], [0, 2]);
    return {
      transform: [
        { translateX: 110 },
        { translateY: 170 + translateY },
        { scaleY },
        { translateX: -110 },
        { translateY: -170 },
      ],
    };
  });

  // Ground shadow synced with breathing
  const shadowAnimatedProps = useAnimatedProps(() => {
    const rx = interpolate(breath.value, [0, 1], [122, 127]);
    return { rx };
  });

  return (
    <View style={styles.catWrapper}>
      <Svg width={310} height={240} viewBox="0 0 340 250">
        {/* --- Ground Contact Shadow --- */}
        <AnimatedEllipse
          cx={176}
          cy={206}
          ry={12}
          fill={CAT_COLORS.shadow}
          opacity={0.55}
          animatedProps={shadowAnimatedProps}
        />

        {/* --- Striped Tail (Back Layer) --- */}
        <AnimatedG animatedProps={tailAnimatedProps}>
          <Path
            d="M 255 186 C 282 186, 305 174, 302 156 C 299 142, 282 142, 276 155 C 271 166, 263 171, 253 172 Z"
            fill={CAT_COLORS.bodyBase}
            stroke={CAT_COLORS.outline}
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Tail Stripes */}
          <Path
            d="M 267 170 C 271 175, 273 181, 272 185 L 281 183 C 282 177, 279 169, 274 164 Z"
            fill={CAT_COLORS.stripeDark}
          />
          <Path
            d="M 281 151 C 287 154, 293 160, 295 167 L 301 160 C 300 152, 294 146, 287 145 Z"
            fill={CAT_COLORS.stripeDark}
          />
          {/* Tail Top Highlight */}
          <Path
            d="M 282 149 C 288 147, 294 149, 296 153"
            stroke={CAT_COLORS.bodyShine}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        </AnimatedG>

        {/* --- Head & Snoring Open Mouth --- */}
        <AnimatedG animatedProps={headAnimatedProps}>
          {/* Far Left Ear */}
          <Path
            d="M 75 142 L 60 144 C 57 145, 57 149, 60 151 L 72 157 Z"
            fill={CAT_COLORS.headBase}
            stroke={CAT_COLORS.outline}
            strokeWidth={3.2}
            strokeLinejoin="round"
          />

          {/* Rounded Tilted Cat Head */}
          <Path
            d="M 72 174 C 66 142, 86 112, 118 112 C 142 112, 158 126, 162 146 L 122 186 Z"
            fill={CAT_COLORS.headBase}
            stroke={CAT_COLORS.outline}
            strokeWidth={3.2}
            strokeLinejoin="round"
          />

          {/* Head Forehead Stripes */}
          <Path
            d="M 75 135 C 80 137, 84 140, 86 144 L 80 148 C 77 144, 74 141, 71 140 Z"
            fill={CAT_COLORS.stripeDark}
          />
          <Path
            d="M 142 117 C 139 122, 138 126, 139 130 L 146 128 C 145 124, 146 121, 149 119 Z"
            fill={CAT_COLORS.stripeDark}
          />

          {/* Closed Happy/Sleepy Arched Eyes */}
          <Path
            d="M 90 141 C 91 132, 99 128, 105 132"
            stroke={CAT_COLORS.outline}
            strokeWidth={2.8}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 122 118 C 128 115, 135 117, 138 122"
            stroke={CAT_COLORS.outline}
            strokeWidth={2.8}
            strokeLinecap="round"
            fill="none"
          />

          {/* Small Purple Nose */}
          <Path
            d="M 109 115 C 112 113, 117 114, 118 117 C 118 120, 114 123, 112 122 C 110 121, 108 117, 109 115 Z"
            fill={CAT_COLORS.nose}
            stroke={CAT_COLORS.outline}
            strokeWidth={2}
          />
          {/* Nose Bridge Line */}
          <Path
            d="M 114 122 L 117 127"
            stroke={CAT_COLORS.outline}
            strokeWidth={2.2}
            strokeLinecap="round"
          />

          {/* Whisker Dots */}
          <Circle cx={106} cy={126} r={1.3} fill={CAT_COLORS.outline} />
          <Circle cx={110} cy={129} r={1.3} fill={CAT_COLORS.outline} />
          <Circle cx={105} cy={130} r={1.3} fill={CAT_COLORS.outline} />

          {/* Open Snoring/Yawning Mouth */}
          <Path
            d="M 108 148 C 105 140, 118 126, 130 126 C 138 126, 140 135, 132 144 C 124 153, 111 155, 108 148 Z"
            fill={CAT_COLORS.mouthDeep}
            stroke={CAT_COLORS.outline}
            strokeWidth={2.8}
          />
          {/* Inner Mouth Shading */}
          <Path
            d="M 112 147 C 113 139, 123 130, 132 130 C 135 133, 133 140, 127 146 C 121 151, 114 151, 112 147 Z"
            fill={CAT_COLORS.mouthMid}
          />
          {/* Pink Tongue */}
          <Path
            d="M 110 148 C 113 144, 119 144, 122 148 C 118 152, 112 152, 110 148 Z"
            fill={CAT_COLORS.tongue}
          />
          {/* Cute Tiny Upper Fang */}
          <Path
            d="M 112 137 L 114 142 L 117 134 Z"
            fill={CAT_COLORS.fang}
          />
        </AnimatedG>

        {/* --- Chubby Sleeping Torso & Belly (Animated Breath) --- */}
        <AnimatedG animatedProps={bellyAnimatedProps}>
          {/* Main Round Belly & Back */}
          <Path
            d="M 118 184 C 124 145, 158 118, 200 120 C 242 122, 266 152, 264 188 C 263 200, 250 204, 240 198 L 236 184 C 232 198, 215 204, 196 204 C 175 204, 162 201, 152 194 L 118 192 Z"
            fill={CAT_COLORS.bodyBase}
            stroke={CAT_COLORS.outline}
            strokeWidth={3.2}
            strokeLinejoin="round"
          />

          {/* Large Teal Belly Highlight Patch */}
          <Path
            d="M 142 162 C 154 134, 184 122, 214 126 C 242 130, 256 150, 252 172 C 232 168, 202 168, 174 176 C 158 180, 146 174, 142 162 Z"
            fill={CAT_COLORS.bodyHighlight}
          />

          {/* Glossy Rim Light Along Top Curve of Belly */}
          <Path
            d="M 172 127 C 188 123, 206 124, 220 129"
            stroke={CAT_COLORS.bodyShine}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />

          {/* Belly Side Stripes */}
          <Path
            d="M 148 194 C 152 184, 158 179, 164 180 C 169 181, 171 189, 170 201 C 161 200, 154 198, 148 194 Z"
            fill={CAT_COLORS.stripeDark}
          />
          <Path
            d="M 128 192 C 131 185, 136 182, 140 183 C 143 184, 144 189, 143 194 Z"
            fill={CAT_COLORS.stripeDark}
          />

          {/* Cute Purple 'X' Belly Button */}
          <Path
            d="M 227 154 L 235 161 M 235 154 L 227 161"
            stroke={CAT_COLORS.navel}
            strokeWidth={2.6}
            strokeLinecap="round"
          />

          {/* Tucked Front/Back Paw Bump */}
          <Path
            d="M 192 163 C 204 166, 214 178, 212 192 C 210 202, 196 206, 184 203"
            fill={CAT_COLORS.bodyBase}
            stroke={CAT_COLORS.outline}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          {/* Paw Glossy Highlight */}
          <Path
            d="M 202 172 C 206 176, 207 182, 206 187"
            stroke={CAT_COLORS.bodyShine}
            strokeWidth={3.2}
            strokeLinecap="round"
            fill="none"
          />
        </AnimatedG>

        {/* --- Outstretched Sploot Front Arm --- */}
        <G>
          <Path
            d="M 122 174 C 102 174, 82 184, 64 186 C 56 187, 55 194, 64 195 C 74 196, 86 194, 96 192 C 94 196, 98 199, 105 197 C 115 195, 128 193, 138 193"
            fill={CAT_COLORS.bodyBase}
            stroke={CAT_COLORS.outline}
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>

        {/* --- Animated Cyan Drool / Sleepy Tear Drop --- */}
        <AnimatedG animatedProps={dropAnimatedProps}>
          <Path
            d="M 110 164 C 110 164, 118 176, 118 182 C 118 187, 114.5 190, 110 190 C 105.5 190, 102 187, 102 182 C 102 176, 110 164, 110 164 Z"
            fill={CAT_COLORS.dropOuter}
            stroke={CAT_COLORS.outline}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <Path
            d="M 110 169 C 110 169, 115 177, 115 181 C 115 184.5, 112.8 187, 110 187 C 107.2 187, 105 184.5, 105 181 C 105 177, 110 169, 110 169 Z"
            fill={CAT_COLORS.dropInner}
          />
          <Ellipse
            cx={107.5}
            cy={181}
            rx={1.5}
            ry={3.2}
            fill={CAT_COLORS.dropHighlight}
          />
        </AnimatedG>

        {/* --- Twinkling Pink 4-Point Sparkles Above Head --- */}
        <TwinkleStar x={60} y={76} size={13} delay={0} duration={1900} />
        <TwinkleStar x={106} y={56} size={16} delay={450} duration={2100} />
        <TwinkleStar x={113} y={96} size={11} delay={900} duration={1700} />
      </Svg>
    </View>
  );
};

const Offline = ({ onRefresh }: { onRefresh?: () => void }) => {
  return (
    <View style={style.container}>
      <SleepyCatAnimation />
      <Text style={style.title}>You're Offline</Text>
      <Text style={style.subtitle}>
        Looks like your connection took a quick nap.{"\n"}Check your network and try again.
      </Text>
      <PopButton styles={style.button} onPress={onRefresh}>
        <Text style={style.buttonText}>Refresh</Text>
      </PopButton>
    </View>
  );
};

const styles = StyleSheet.create({
  catWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
});

const style = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: pallete.textwhite,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 32,
    backgroundColor: pallete.accent,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 50,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: pallete.textwhite,
  },
});

export default Offline;