import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Pressable, Dimensions, 
  ScrollView, StatusBar, Vibration 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, 
  withSequence, interpolate, Easing, runOnJS
} from 'react-native-reanimated';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import CachedImage from '../../components/props/CachedImage';

// Use React Native's built-in vibration API instead of requiring expo-haptics.
const Haptics = {
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  impactAsync: async (style: string) => {
    Vibration.vibrate(style === 'medium' ? 20 : 10);
  },
  notificationAsync: async (type: string) => {
    Vibration.vibrate(type === 'success' ? [0, 15, 50, 25] : [0, 40, 50, 40]);
  },
  selectionAsync: async () => {
    Vibration.vibrate(5);
  },
};

const { width, height } = Dimensions.get('window');

// --- Crisp Native SVGs ---
const Icons = {
  Back: () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  ),
  GiftOutline: ({ color = "#00D2B4", size = 32 }: { color?: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="8" width="18" height="14" rx="2" />
      <Path d="M12 5a3 3 0 1 0-3 3h6a3 3 0 1 0-3-3z" />
      <Line x1="12" y1="8" x2="12" y2="22" />
      <Line x1="3" y1="13" x2="21" y2="13" />
    </Svg>
  ),
  Flame: ({ color = "#F59E0B", size = 24 }: { color?: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </Svg>
  ),
  Book: ({ color = "#A78BFA", size = 24 }: { color?: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </Svg>
  ),
  PlusSpin: ({ color = "#00D2B4", size = 24 }: { color?: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="8" x2="12" y2="16" />
      <Line x1="8" y1="12" x2="16" y2="12" />
    </Svg>
  ),
  Lock: ({ color = "#9CA3AF" }) => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  ),
  Cross: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  ),
  ChevronRight: () => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18l6-6-6-6" />
    </Svg>
  ),
};

// --- Mock Data ---
const RECENT_REWARDS = [
  { id: '1', type: 'streak', title: '+3 Streak Days', time: 'Today · 12:34 PM', status: 'Active', color: '#F59E0B', icon: Icons.Flame },
  { id: '2', type: 'book', title: 'The 48 Laws of Power (7 days)', time: 'Yesterday · 09:21 PM', status: 'Active', subtitle: '7 days left', color: '#A78BFA', icon: Icons.Book },
  { id: '3', type: 'spin', title: '+1 Extra Spin', time: '2 days ago · 04:12 PM', status: 'Used', color: '#00D2B4', icon: Icons.PlusSpin },
  { id: '4', type: 'streak', title: '+6 Streak Days', time: '4 days ago · 11:03 AM', status: 'Expired', color: '#F59E0B', icon: Icons.Flame },
  { id: '5', type: 'none', title: 'No Reward', time: '5 days ago · 08:17 PM', status: '-', color: '#9CA3AF', icon: Icons.Lock },
];

// --- Smooth Native Non-Bouncy Pressable Button ---
const CleanButton = ({ onPress, children, style, disabled = false }: any) => {
  const opacity = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        if (disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        opacity.value = withTiming(0.85, { duration: 80 });
      }}
      onPressOut={() => {
        opacity.value = withTiming(1, { duration: 120 });
      }}
      onPress={onPress}
    >
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
};

// --- Main Screen Component ---
export default function DailyRewards({ navigation }: any) {
  const insets = useSafeAreaInsets();
  
  // States: 'idle' | 'searching' | 'result-streak' | 'result-book' | 'result-none'
  const [spinState, setSpinState] = useState<'idle' | 'searching' | 'result-streak' | 'result-book' | 'result-none'>('idle');
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [streakCount, setStreakCount] = useState(7);

  // Animations (Clean & Non-Bouncy)
  const idlePulse = useSharedValue(1);
  const searchGlow = useSharedValue(0);
  const liquidRotate1 = useSharedValue(0);
  const liquidRotate2 = useSharedValue(0);
  const particleOrbit = useSharedValue(0);
  const resultOpacity = useSharedValue(0);
  const resultScale = useSharedValue(0.96);
  const sheetTranslateY = useSharedValue(height);

  // Background Ambient Breathing Pulse (Idle)
  useEffect(() => {
    idlePulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const idlePulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: idlePulse.value }],
    opacity: interpolate(idlePulse.value, [1, 1.08], [0.45, 0.15]),
  }));

  // Liquid blur particle rotation styles (Searching state)
  const liquidStyle1 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${liquidRotate1.value}deg` }],
  }));

  const liquidStyle2 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${liquidRotate2.value}deg` }],
  }));

  const particleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${particleOrbit.value}deg` }],
    opacity: searchGlow.value,
  }));

  // Sudden Fullscreen Popup: Fast, clean, NO bouncy spring
  const resultStyle = useAnimatedStyle(() => ({
    opacity: resultOpacity.value,
    transform: [{ scale: resultScale.value }],
    pointerEvents: resultOpacity.value > 0 ? 'auto' : 'none',
  }));

  // Bottom Sheet Style (Fast & Smooth with NO bouncy spring)
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  // --- Start Liquid Blur Searching (NO Wheel Spin) ---
  const handleStartSearch = () => {
    if (spinState !== 'idle') return;

    // Trigger initial tactile flutter
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSpinState('searching');

    // Activate liquid blur search animations
    searchGlow.value = withTiming(1, { duration: 250 });
    liquidRotate1.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
    liquidRotate2.value = withRepeat(
      withTiming(-360, { duration: 900, easing: Easing.linear }),
      -1,
      false
    );
    particleOrbit.value = withRepeat(
      withTiming(360, { duration: 700, easing: Easing.linear }),
      -1,
      false
    );

    // Rapid subtle haptic pulses during search
    const hapticInterval = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 180);

    // Sudden transition to fullscreen pop-up after ~1.5s
    setTimeout(() => {
      clearInterval(hapticInterval);
      runOnJS(triggerSuddenResult)();
    }, 1500);
  };

  // --- Sudden Pop-up Trigger ---
  const triggerSuddenResult = () => {
    // Choose randomly between: streak extension, book access, or no reward
    const outcomes: ('result-streak' | 'result-book' | 'result-none')[] = [
      'result-streak',
      'result-book',
      'result-streak',
      'result-none',
    ];
    const picked = outcomes[Math.floor(Math.random() * outcomes.length)];

    setSpinState(picked);

    if (picked === 'result-streak') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStreakCount(prev => prev + 3);
    } else if (picked === 'result-book') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    // Fast, crisp entry (200ms cubic-bezier, no bouncing)
    resultScale.value = withTiming(1, { 
      duration: 200, 
      easing: Easing.bezier(0.16, 1, 0.3, 1) 
    });
    resultOpacity.value = withTiming(1, { 
      duration: 180, 
      easing: Easing.out(Easing.ease) 
    });
  };

  const closeResult = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resultOpacity.value = withTiming(0, { duration: 160 }, () => {
      resultScale.value = 0.96;
      searchGlow.value = 0;
      liquidRotate1.value = 0;
      liquidRotate2.value = 0;
      particleOrbit.value = 0;
      runOnJS(setSpinState)('idle');
    });
  };

  // Bottom Sheet (Fast & Non-bouncy)
  const openSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowBottomSheet(true);
    sheetTranslateY.value = withTiming(0, { 
      duration: 220, 
      easing: Easing.bezier(0.16, 1, 0.3, 1) 
    });
  };

  const closeSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sheetTranslateY.value = withTiming(height, { 
      duration: 180, 
      easing: Easing.in(Easing.ease) 
    }, () => {
      runOnJS(setShowBottomSheet)(false);
    });
  };

  // Status Pill Renderer
  const renderStatusPill = (status: string) => {
    let color = '#9CA3AF';
    let bg = 'rgba(156, 163, 175, 0.1)';
    if (status === 'Active') { color = '#00D2B4'; bg = 'rgba(0, 210, 180, 0.12)'; }
    if (status === 'Used') { color = '#6B7280'; bg = 'rgba(107, 114, 128, 0.15)'; }

    return (
      <View style={[styles.pill, { backgroundColor: bg }]}>
        <Text style={[styles.pillText, { color }]}>{status}</Text>
      </View>
    );
  };

  const filteredRewards = activeFilter === 'All' 
    ? RECENT_REWARDS 
    : RECENT_REWARDS.filter(r => 
        (activeFilter === 'Streak' && r.type === 'streak') ||
        (activeFilter === 'Books' && r.type === 'book') ||
        (activeFilter === 'Extra Spins' && r.type === 'spin')
      );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Background Gradient */}
      <LinearGradient colors={['#020914', '#01050A']} style={StyleSheet.absoluteFillObject} />

      {/* --- MAIN DAILY REWARDS SCREEN --- */}
      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 24) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation?.goBack?.()} hitSlop={12} style={styles.iconBtn}>
            <Icons.Back />
          </Pressable>
          <Text style={styles.headerTitle}>Daily Rewards</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroTexts}>
            <Text style={styles.heroTitle}>Your streak, your reward.</Text>
            <Text style={styles.heroSub}>Keep your streak alive and spin for a chance to win something special.</Text>
          </View>
          <View style={styles.topRightGiftGlow}>
            <Icons.GiftOutline color="#00D2B4" size={28} />
          </View>
        </View>

        {/* Current Streak Card */}
        <View style={styles.streakCard}>
          <View style={styles.streakCardLeft}>
            <View style={styles.flameIconWrap}>
              <Icons.Flame color="#F59E0B" size={22} />
            </View>
            <View>
              <Text style={styles.streakCardLabel}>Current <Text style={{ color: '#F59E0B' }}>Streak</Text></Text>
              <Text style={styles.streakCardValue}>{streakCount} Days</Text>
            </View>
          </View>
          {renderStatusPill('Active')}
        </View>

        {/* --- LIQUID BLUR SEARCHING CIRCLE (NO SPIN WHEEL) --- */}
        <View style={styles.circleContainer}>
          {/* Ambient Outer Idle Glow */}
          <Animated.View style={[styles.circleGlowPulse, idlePulseStyle]} />
          
          {/* Swirling Liquid Blur Aura (Active during search) */}
          <Animated.View style={[styles.liquidAura, liquidStyle1]}>
            <LinearGradient 
              colors={['rgba(0, 210, 180, 0.4)', 'rgba(56, 189, 248, 0.25)', 'transparent']} 
              style={StyleSheet.absoluteFillObject} 
            />
          </Animated.View>

          <Animated.View style={[styles.liquidAuraSecondary, liquidStyle2]}>
            <LinearGradient 
              colors={['rgba(167, 139, 250, 0.3)', 'rgba(245, 158, 11, 0.2)', 'transparent']} 
              style={StyleSheet.absoluteFillObject} 
            />
          </Animated.View>

          {/* Orbiting Liquid Search Particles */}
          <Animated.View style={[styles.particlesOrbitContainer, particleStyle]}>
            <View style={[styles.particleDot, { top: 10, left: 100 }]} />
            <View style={[styles.particleDot, { bottom: 18, right: 80, backgroundColor: '#F59E0B' }]} />
            <View style={[styles.particleDot, { top: 90, right: 12, backgroundColor: '#38BDF8' }]} />
            <View style={[styles.particleDot, { bottom: 80, left: 16 }]} />
          </Animated.View>

          {/* Central Main Circle Button */}
          <Pressable 
            onPress={handleStartSearch}
            disabled={spinState !== 'idle'}
            style={({ pressed }) => [
              styles.mainCircle,
              pressed && { transform: [{ scale: 0.98 }] },
              spinState === 'searching' && styles.mainCircleSearching
            ]}
          >
            <LinearGradient 
              colors={['rgba(0, 210, 180, 0.12)', 'rgba(2, 9, 20, 0.95)']} 
              style={StyleSheet.absoluteFillObject} 
            />

            {spinState === 'searching' ? (
              <View style={styles.searchingContent}>
                <View style={styles.radarPing} />
                <Icons.GiftOutline color="#00D2B4" size={32} />
                <Text style={styles.searchingText}>SEARCHING...</Text>
                <Text style={styles.searchingSubText}>Scanning reward frequency</Text>
              </View>
            ) : (
              <View style={styles.circleInnerContent}>
                <Icons.GiftOutline color="#00D2B4" size={38} />
                <Text style={styles.circleTitle}>Daily Reward</Text>
                <Text style={styles.circleSubTitle}>One chance today</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Primary Action Button */}
        <CleanButton 
          disabled={spinState !== 'idle'}
          style={[styles.mainButton, spinState !== 'idle' && { opacity: 0.7 }]} 
          onPress={handleStartSearch}
        >
          <Text style={styles.mainButtonText}>
            {spinState === 'searching' ? 'Searching reward...' : 'Spin for reward'}
          </Text>
        </CleanButton>
        <Text style={styles.disclaimerText}>Rewards are random. Some spins may give no reward.</Text>

        {/* Mini Recent Rewards Card */}
        <View style={styles.recentMiniCard}>
          <View style={styles.recentMiniHeader}>
            <Text style={styles.recentMiniTitle}>Recent Rewards</Text>
            <Pressable onPress={openSheet} hitSlop={12}>
              <Text style={styles.viewAllText}>View all</Text>
            </Pressable>
          </View>
          
          {RECENT_REWARDS.slice(0, 3).map((reward, i) => (
            <View key={reward.id} style={[styles.rewardListItem, i !== 2 && styles.borderBottom]}>
              <View style={styles.rewardListLeft}>
                <View style={[styles.rewardIconWrap, { borderColor: reward.color + '40', backgroundColor: reward.color + '15' }]}>
                  <reward.icon color={reward.color} size={20} />
                </View>
                <View>
                  <Text style={styles.rewardTitle}>{reward.title}</Text>
                  <Text style={styles.rewardTime}>{reward.time}</Text>
                </View>
              </View>
              <View style={styles.rewardListRight}>
                {renderStatusPill(reward.status)}
                {reward.subtitle && <Text style={styles.rewardSubtitle}>{reward.subtitle}</Text>}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* --- SUDDEN FULLSCREEN RESULT POP-UP (NO BOUNCY ANIMATION) --- */}
      {spinState !== 'idle' && spinState !== 'searching' && (
        <Animated.View style={[styles.resultOverlay, resultStyle]}>
          <LinearGradient colors={['#020914', '#01050A']} style={StyleSheet.absoluteFillObject} />
          
          <View style={styles.resultInner}>
            {/* Top Close / Skip */}
            <Pressable onPress={closeResult} style={styles.skipBtn} hitSlop={10}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>

            {/* 1. STREAK EXTENSION RESULT */}
            {spinState === 'result-streak' && (
              <View style={styles.resultCenter}>
                <View style={styles.resultStreakRing}>
                  <Icons.Flame color="#F59E0B" size={32} />
                  <Text style={styles.resultBigNumber}>+3</Text>
                </View>
                <Text style={styles.resultTitle}>+3 Streak Days</Text>
                <Text style={styles.resultDesc}>
                  Your streak has been extended by <Text style={{ color: '#F59E0B', fontWeight: '700' }}>3</Text> days.{'\n'}Keep going!
                </Text>
              </View>
            )}

            {/* 2. BOOK ACCESS UNLOCKED RESULT */}
            {spinState === 'result-book' && (
              <View style={styles.resultCenter}>
                <View style={styles.resultBookCoverWrapper}>
                  <CachedImage
                    uri={'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400'}
                    label="Reward"
                    style={styles.resultBookCover}
                    letterSize={30}
                  />
                  <View style={styles.bookSpineHighlight} />
                </View>
                <Text style={styles.resultTitle}>7-Day Access Unlocked!</Text>
                <Text style={styles.resultDesc}>
                  You can now access this book for{'\n'}7 days from now.
                </Text>
                <CleanButton style={[styles.mainButton, { marginBottom: 12 }]} onPress={() => {}}>
                  <Text style={styles.mainButtonText}>View Book</Text>
                </CleanButton>
              </View>
            )}

            {/* 3. NO REWARD RESULT */}
            {spinState === 'result-none' && (
              <View style={styles.resultCenter}>
                <View style={[styles.resultStreakRing, { borderColor: '#374151', backgroundColor: 'rgba(55, 65, 81, 0.1)' }]}>
                  <Icons.GiftOutline color="#6B7280" size={48} />
                </View>
                <Text style={styles.resultTitle}>No reward this time</Text>
                <Text style={styles.resultDesc}>
                  Don't worry! Keep your streak going.{'\n'}The next spin could be better.
                </Text>
              </View>
            )}

            {/* Bottom Continue & Context Card */}
            <View style={styles.resultBottomSection}>
              <CleanButton 
                style={spinState === 'result-book' ? styles.outlineButton : styles.mainButton} 
                onPress={closeResult}
              >
                <Text style={spinState === 'result-book' ? styles.outlineButtonText : styles.mainButtonText}>
                  Continue
                </Text>
              </CleanButton>

              {/* Context Bottom Card */}
              {spinState === 'result-streak' && (
                <View style={styles.streakResultCard}>
                  <View style={styles.streakCardLeft}>
                    <View style={styles.flameIconWrap}>
                      <Icons.Flame color="#F59E0B" size={20} />
                    </View>
                    <View>
                      <Text style={styles.streakCardLabel}>Updated Streak</Text>
                      <Text style={styles.streakCardValue}>{streakCount} Days</Text>
                    </View>
                  </View>
                  <Icons.ChevronRight />
                </View>
              )}

              {spinState === 'result-book' && (
                <View style={styles.streakResultCard}>
                  <View style={styles.streakCardLeft}>
                    <View style={[styles.flameIconWrap, { backgroundColor: 'rgba(167, 139, 250, 0.15)', borderColor: 'rgba(167, 139, 250, 0.3)' }]}>
                      <Icons.Book color="#A78BFA" size={20} />
                    </View>
                    <View>
                      <Text style={styles.streakCardLabel}>Your Reward</Text>
                      <Text style={styles.streakCardValue}>Atomic Habits</Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>Valid for 7 days</Text>
                    </View>
                  </View>
                  <Icons.ChevronRight />
                </View>
              )}

              {spinState === 'result-none' && (
                <View style={styles.streakResultCard}>
                  <View style={styles.streakCardLeft}>
                    <View style={styles.flameIconWrap}>
                      <Icons.Flame color="#F59E0B" size={20} />
                    </View>
                    <View>
                      <Text style={styles.streakCardLabel}>Your Streak</Text>
                      <Text style={styles.streakCardValue}>{streakCount} Days</Text>
                    </View>
                  </View>
                  <Icons.ChevronRight />
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      )}

      {/* --- NATIVE SLIDING RECENT REWARDS BOTTOM SHEET --- */}
      {showBottomSheet && (
        <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSheet}>
          <View style={styles.sheetBackdrop} />
        </Pressable>
      )}
      <Animated.View style={[styles.bottomSheet, sheetStyle]}>
        <View style={styles.dragHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Recent Rewards</Text>
          <Pressable onPress={closeSheet} hitSlop={10}>
            <Icons.Cross />
          </Pressable>
        </View>

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          {['All', 'Streak', 'Books', 'Extra Spins'].map((chip) => {
            const isActive = activeFilter === chip;
            return (
              <Pressable 
                key={chip} 
                onPress={() => { Haptics.selectionAsync(); setActiveFilter(chip); }}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{chip}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sheet Items List */}
        <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
          {filteredRewards.map((reward) => (
            <View key={reward.id} style={styles.sheetListItem}>
              <View style={styles.rewardListLeft}>
                <View style={[styles.rewardIconWrap, { borderColor: reward.color + '40', backgroundColor: reward.color + '15' }]}>
                  <reward.icon color={reward.color} size={20} />
                </View>
                <View>
                  <Text style={styles.rewardTitle}>{reward.title}</Text>
                  <Text style={styles.rewardTime}>{reward.time}</Text>
                </View>
              </View>
              <View style={styles.rewardListRight}>
                {renderStatusPill(reward.status)}
                {reward.subtitle && <Text style={styles.rewardSubtitle}>{reward.subtitle}</Text>}
              </View>
            </View>
          ))}
          <Text style={styles.viewHistoryText}>View all history →</Text>
        </ScrollView>
      </Animated.View>
      
    </View>
  );
}

// --- Styles (Pixel-Perfect to Designs) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020914' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  iconBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  
  heroSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  heroTexts: { flex: 1, paddingRight: 16 },
  heroTitle: { fontSize: 23, fontWeight: '800', color: '#fff', marginBottom: 6, letterSpacing: -0.3 },
  heroSub: { fontSize: 13, color: '#9CA3AF', lineHeight: 20 },
  topRightGiftGlow: { 
    width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(0, 210, 180, 0.12)', 
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0, 210, 180, 0.35)',
    shadowColor: '#00D2B4', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10
  },

  streakCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 18, padding: 16, marginBottom: 28
  },
  streakCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flameIconWrap: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', alignItems: 'center', justifyContent: 'center'
  },
  streakCardLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '500', marginBottom: 2 },
  streakCardValue: { fontSize: 18, fontWeight: '800', color: '#fff' },

  // Liquid Blur Searching Circle
  circleContainer: { alignItems: 'center', justifyContent: 'center', height: 230, marginBottom: 24 },
  circleGlowPulse: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(0, 210, 180, 0.2)',
  },
  liquidAura: {
    position: 'absolute', width: 215, height: 215, borderRadius: 107.5,
    overflow: 'hidden', opacity: 0.6,
  },
  liquidAuraSecondary: {
    position: 'absolute', width: 225, height: 225, borderRadius: 112.5,
    overflow: 'hidden', opacity: 0.4,
  },
  particlesOrbitContainer: {
    position: 'absolute', width: 210, height: 210,
  },
  particleDot: {
    position: 'absolute', width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#00D2B4', shadowColor: '#00D2B4', shadowRadius: 6, shadowOpacity: 0.9,
  },
  mainCircle: {
    width: 195, height: 195, borderRadius: 97.5,
    borderWidth: 2, borderColor: '#00D2B4',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#020914', overflow: 'hidden',
    shadowColor: '#00D2B4', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 24, elevation: 10
  },
  mainCircleSearching: {
    borderColor: '#38BDF8',
    shadowColor: '#38BDF8',
  },
  circleInnerContent: { alignItems: 'center', justifyContent: 'center' },
  circleTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 10, marginBottom: 2 },
  circleSubTitle: { fontSize: 11, color: '#9CA3AF' },

  searchingContent: { alignItems: 'center', justifyContent: 'center' },
  radarPing: {
    position: 'absolute', width: 70, height: 70, borderRadius: 35,
    borderWidth: 1, borderColor: '#00D2B4', opacity: 0.5,
  },
  searchingText: { fontSize: 12, fontWeight: '800', color: '#00D2B4', letterSpacing: 1.5, marginTop: 10 },
  searchingSubText: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },

  mainButton: { backgroundColor: '#00D2B4', borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', width: '100%' },
  mainButtonText: { color: '#01050A', fontSize: 16, fontWeight: '800' },
  outlineButton: { backgroundColor: 'transparent', borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', width: '100%', borderWidth: 1, borderColor: '#00D2B4' },
  outlineButtonText: { color: '#00D2B4', fontSize: 16, fontWeight: '700' },
  disclaimerText: { fontSize: 11, color: '#6B7280', textAlign: 'center', marginTop: 10, marginBottom: 24 },

  recentMiniCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18, padding: 16
  },
  recentMiniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  recentMiniTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  viewAllText: { fontSize: 13, color: '#00D2B4', fontWeight: '600' },
  
  rewardListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
  rewardListLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rewardIconWrap: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rewardTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  rewardTime: { fontSize: 11, color: '#9CA3AF' },
  rewardListRight: { alignItems: 'flex-end', gap: 4 },
  rewardSubtitle: { fontSize: 10, color: '#F87171' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 11, fontWeight: '700' },

  // Sudden Fullscreen Popup
  resultOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 999, justifyContent: 'center', padding: 20 },
  resultInner: { flex: 1, justifyContent: 'space-between', paddingVertical: 30, alignItems: 'center' },
  skipBtn: { alignSelf: 'flex-end', padding: 8 },
  skipText: { color: '#9CA3AF', fontSize: 13 },
  resultCenter: { alignItems: 'center', width: '100%' },
  resultStreakRing: {
    width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: '#00D2B4',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    backgroundColor: 'rgba(0, 210, 180, 0.08)',
    shadowColor: '#00D2B4', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 28
  },
  resultBookCoverWrapper: {
    width: 140, height: 190, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0, 210, 180, 0.5)',
    marginBottom: 24, overflow: 'hidden', backgroundColor: '#0B132B',
    shadowColor: '#00D2B4', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 25
  },
  resultBookCover: { width: '100%', height: '100%', resizeMode: 'cover' },
  bookSpineHighlight: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: 'rgba(255,255,255,0.15)' },
  resultBigNumber: { fontSize: 46, fontWeight: '900', color: '#fff', marginTop: -4 },
  resultTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 8, textAlign: 'center' },
  resultDesc: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  resultBottomSection: { width: '100%', gap: 12 },
  streakResultCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16, padding: 14
  },

  // Bottom Sheet
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.72,
    backgroundColor: '#04101A', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', padding: 20, zIndex: 200,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  filterChipsRow: { gap: 10, paddingBottom: 16 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'transparent' },
  filterChipActive: { borderColor: '#00D2B4', backgroundColor: 'rgba(0, 210, 180, 0.15)' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  filterChipTextActive: { color: '#00D2B4' },
  sheetList: { flex: 1 },
  sheetListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  viewHistoryText: { textAlign: 'center', color: '#00D2B4', fontSize: 14, fontWeight: '600', marginTop: 26, marginBottom: 20 }
});