import React, { useEffect, useRef, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  Dimensions, 
  Pressable,
  ScrollView,
  PanResponder
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  Extrapolation
} from 'react-native-reanimated';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';

const { width } = Dimensions.get('window');
const BANNER_CARD_GAP = 24;
const MAX_TILT_DEG = 27;
const MAX_DRAG_DISTANCE = 130;

// --- Exact SVG Icons matching the UI ---
const StarIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#E0FFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </Svg>
);

// Updated Icon for "Enhanced Experience"
const SparklesIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#E0FFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
  </Svg>
);

const CalendarIcon = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#E0FFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <Line x1="16" y1="2" x2="16" y2="6" />
    <Line x1="8" y1="2" x2="8" y2="6" />
    <Line x1="3" y1="10" x2="21" y2="10" />
    <Circle cx="8" cy="15" r="1" fill="#E0FFFF" />
    <Circle cx="12" cy="15" r="1" fill="#E0FFFF" />
    <Circle cx="16" cy="15" r="1" fill="#E0FFFF" />
  </Svg>
);

// --- Static Glassmorphic Card Component (Hover effect removed) ---
const FeatureCard = ({ icon: Icon, title, description }: any) => {
  return (
    <View style={styles.cardWrapper}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Icon />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{description}</Text>
        </View>
      </View>
    </View>
  );
};

// --- Controlled 3D Tilt Hero Image Component ---
const InteractiveHeroImage = ({ onInteractionChange }: { onInteractionChange: (active: boolean) => void }) => {
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const rotateZ = useSharedValue(0);
  const scale = useSharedValue(1);
  const hoverFloatY = useSharedValue(0);

  useEffect(() => {
    hoverFloatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const resetToRestingPosition = () => {
    onInteractionChange(false);
    rotateX.value = withSpring(0, { damping: 15, stiffness: 130, mass: 0.8 });
    rotateY.value = withSpring(0, { damping: 15, stiffness: 130, mass: 0.8 });
    rotateZ.value = withSpring(0, { damping: 16, stiffness: 140, mass: 0.8 });
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const getBoundedAngle = (delta: number, maxDeg: number) => {
    const normalized = Math.max(-1, Math.min(1, delta / MAX_DRAG_DISTANCE));
    return normalized * (1.25 - 0.25 * normalized * normalized) * maxDeg;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        onInteractionChange(true);
        scale.value = withSpring(1.06, { damping: 15, stiffness: 160 });
      },
      onPanResponderMove: (_, gestureState) => {
        const boundedRotateY = getBoundedAngle(gestureState.dx, MAX_TILT_DEG);
        const boundedRotateX = getBoundedAngle(-gestureState.dy, MAX_TILT_DEG);
        const boundedRotateZ = getBoundedAngle((gestureState.dx * gestureState.dy) / 120, 4);

        rotateY.value = boundedRotateY;
        rotateX.value = boundedRotateX;
        rotateZ.value = boundedRotateZ;
      },
      onPanResponderRelease: resetToRestingPosition,
      onPanResponderTerminate: resetToRestingPosition,
    })
  ).current;

  const heroAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 1000 },
        { translateY: hoverFloatY.value },
        { scale: scale.value },
        { rotateX: `${rotateX.value}deg` },
        { rotateY: `${rotateY.value}deg` },
        { rotateZ: `${rotateZ.value}deg` },
      ],
    };
  });

  const floorShadowAnimatedStyle = useAnimatedStyle(() => {
    const shadowScale = interpolate(hoverFloatY.value, [-8, 0], [0.88, 1], Extrapolation.CLAMP);
    const tiltShiftX = interpolate(rotateY.value, [-MAX_TILT_DEG, MAX_TILT_DEG], [-10, 10], Extrapolation.CLAMP);

    return {
      opacity: interpolate(scale.value, [1, 1.06], [0.35, 0.55], Extrapolation.CLAMP),
      transform: [
        { translateX: tiltShiftX },
        { scaleX: shadowScale * scale.value },
        { scaleY: 0.25 },
      ],
    };
  });

  return (
    <View style={styles.heroInteractiveContainer} {...panResponder.panHandlers}>
      {/* 2D Static Base Image added behind the 3D Image */}
      <View style={styles.baseImageContainer} pointerEvents="none">
        <Image 
          source={require('../../assets/base.png')} 
          style={styles.baseImage}
          resizeMode="contain"
        />
      </View>

      {/* 3D Glowing Book Image */}
      <Animated.View style={[styles.heroCard3D, heroAnimatedStyle]}>
        <Image 
          source={require('../../assets/glowpage.png')} 
          style={styles.heroImage}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
};

export default function Subscription() {
  const insets = useSafeAreaInsets();
  const [isRotatingHero, setIsRotatingHero] = useState(false);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#041216', '#02080A', '#031418']}
        style={StyleSheet.absoluteFillObject}
      />

      <Image 
        source={require('../../assets/bottomwave.png')} 
        style={styles.bottomWave}
        resizeMode="cover"
      />

      <Image 
        source={require('../../assets/page.png')} 
        style={[styles.logo, { top: Math.max(insets.top, 110) }]}
        resizeMode="contain"
      />

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 50) }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isRotatingHero}
      >
        <InteractiveHeroImage onInteractionChange={setIsRotatingHero} />

        <Text style={styles.overline}>SUBSCRIPTION PLANS</Text>
        <Text style={styles.title}>
          Coming <Text style={styles.titleHighlight}>Soon</Text>
        </Text>
        <Text style={styles.subtitle}>
          More value. More content. More ways{'\n'}to grow — with our upcoming plans.
        </Text>

        <View style={styles.cardsRow}>
          <FeatureCard 
            icon={StarIcon} 
            title="Special Rewards" 
            description="Earn exclusive rewards as you learn." 
          />
          <FeatureCard 
            icon={SparklesIcon} 
            title="Enhanced Experience" 
            description="A smoother, richer learning journey." 
          />
        </View>

        {/* Banner with subtle color change on hover/press active */}
        <Pressable style={styles.bannerContainer}>
          {({ pressed }) => (
            <View style={[styles.bottomBanner, { backgroundColor: pressed ? '#072428' : '#041619' }]}>
              <View style={styles.bannerIconWrap}>
                <CalendarIcon />
              </View>
              <Text style={styles.bannerText}>
                For now, enjoy full access to everything{'\n'}— and get ready for more!
              </Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02080A',
  },
  bottomWave: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: width,
    height: 180,
    opacity: 0.8,
    zIndex: 0,
  },
  logo: {
    position: 'absolute',
    right: 320,
    width: 60,
    height: 60,
    zIndex: 50,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 10,
    paddingBottom: 40,
    elevation: 10,
  },
  contentScroll: {
    flex: 1,
    zIndex: 10,
    elevation: 10,
  },
  heroInteractiveContainer: {
    width: width * 0.8,
    height: width * 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  baseImageContainer: {
    position: 'absolute',
    bottom: -20, // Isko apne hisaab se upar-neeche adjust kar lein space ke liye
    width: '100%',
    alignItems: 'center',
    zIndex: -1, 
  },
  baseImage: {
    width: width * 0.7, 
    height: width * 0.3,
  },
  heroCard3D: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width: width * 0.57, 
    height: width * 0.65,
  },
  heroFloorShadow: {
    position: 'absolute',
    bottom: -6,
    width: width * 0.48,
    height: 28,
    borderRadius: 100,
    backgroundColor: '#00E5C4',
    shadowColor: '#00E5C4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  overline: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00E5C4',
    letterSpacing: 4.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#F8FFFF',
    marginBottom: 16,
  },
  titleHighlight: {
    color: '#00D2B4',
  },
  subtitle: {
    fontSize: 14,
    color: '#A0B4B7',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '400',
    marginBottom: 32,
  },
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    gap: 16,
    marginBottom: 0,
  },
  cardWrapper: {
    flex: 1,
  },
  card: {
    flex: 1,
    minHeight: 150,
    width: '100%',
    backgroundColor: 'rgba(0, 210, 180, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 180, 0.15)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    paddingTop: 44,
    position: 'relative',
  },
  iconCircle: {
    position: 'absolute',
    top: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#041619',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 196, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00E5C4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  cardContent: {
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FFFF',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  cardDesc: {
    fontSize: 12,
    color: '#8BA3A5',
    textAlign: 'center',
    lineHeight: 18,
  },
  bannerContainer: {
    width: '100%',
    marginTop: BANNER_CARD_GAP,
    zIndex: 20,
    elevation: 12,
  },
  bottomBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 180, 0.15)',
    borderRadius: 16,
    padding: 16,
    paddingHorizontal: 20,
  },
  bannerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 229, 196, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: '#F8FFFF',
    lineHeight: 19,
    fontWeight: '500',
  },
});