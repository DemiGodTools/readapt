import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from "../../components/nav/MainNavigation";

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;
import useAuth from "../../hooks/useAuth";
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Svg, { Polyline, Line } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import pallete from '../../lib/Colors';
import { useUser } from '../../hooks/useUser';
import { useToast } from '../../hooks/useToast';
import { api } from '../../lib/api';
import Offline from '../../components/state/Offline';
import UpgradeSheet from '../../components/props/UpgradeSheet';
import { useNetworkStatus } from '../../hooks/useNetwork';

const CARD_WIDTH = 290;
const CARD_GAP = 16;
const NEXT_API_URL = 'https://redapt-admin-sand.vercel.app/api/user';

// Plan indices: 0 = free, 1 = Basic, 2 = Standard, 4 = Pro (as per your mapping)
const PLANS = [
  {
    id: 'basic',
    index: 1,
    name: 'Basic',
    price: '₹19',
    numericPrice: 19,
    duration: '30 Days Validity',
    featured: false,
    features: ['Eligible content access', 'Post comments support'],
    buttonText: 'Get Basic',
  },
  {
    id: 'standard',
    index: 2,
    name: 'Standard',
    price: '₹49',
    numericPrice: 49,
    duration: '30 Days Validity',
    featured: true,
    features: [
      'Eligible content access',
      'Audio Transcription',
      'Download Support',
    ],
    buttonText: 'Get Standard',
  },
  {
    id: 'pro',
    index: 3,
    name: 'Pro',
    price: '₹99',
    numericPrice: 99,
    duration: '40 Days Validity',
    featured: false,
    features: [
      'All content access',
      'Background Play',
      'Extended Month Plan',
    ],
    buttonText: 'Get Pro',
  },
];

const COMPARISON = [
  { feature: 'Content Access', basic: 'Eligible', standard: 'Eligible', pro: 'All Access' },
  { feature: 'Post Comment', basic: true, standard: true, pro: true },
  { feature: 'Download Support', basic: false, standard: true, pro: true },
  { feature: 'Audio Transcription', basic: false, standard: true, pro: true },
  { feature: 'Background Play', basic: false, standard: false, pro: true },
  { feature: 'Duration', basic: '30 Days', standard: '30 Days', pro: '40 Days' },
];

const getDaysRemaining = (expireOn?: string | null): number | null => {
  if (!expireOn) return null;
  const expiry = new Date(expireOn).getTime();
  const now = Date.now();
  const diff = expiry - now;
  if (isNaN(expiry) || diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const formatExpiry = (expireOn?: string | null): string => {
  if (!expireOn) return '—';
  try {
    const d = new Date(expireOn);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const Subscription = ({ route, navigation }: Props) => {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { accessToken } = useAuth();
  const { user, reload } = useUser();
  const { showToast } = useToast();
  const { isConnected } = useNetworkStatus();

  const currentPlanIndex = user?.subscription?.plan ?? 0;
  const isSubscribed = currentPlanIndex > 0;
  const isPro = currentPlanIndex >= 4;

  
  const currentPlan = useMemo(
    () => PLANS.find((p) => p.index === currentPlanIndex) || null,
    [currentPlanIndex]
  );
  
  console.log(isSubscribed, currentPlan, "subs details")

  const daysRemaining = useMemo(
    () => getDaysRemaining(user?.subscription?.expiresOn + ""),
    [user?.subscription?.expiresOn]
  );

  const upgradeOptions = useMemo(
    () => PLANS.filter((p) => p.index > currentPlanIndex),
    [currentPlanIndex]
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  const handleDeepLink = (event: { url: string }) => {
    WebBrowser.dismissBrowser();

    const data = Linking.parse(event.url);
    if (data.path === 'payment-callback') {
      const razorpayPaymentId = data.queryParams?.razorpay_payment_id;
      const razorpayStatus = data.queryParams?.razorpay_payment_link_status;

      if (razorpayStatus === 'paid' || razorpayPaymentId) {
        Alert.alert('Payment Successful', 'Your subscription is now active!');
        reload();
      } else {
        Alert.alert('Payment Status', 'Payment completed or pending status check.');
      }
    }
  };

  const handlePayment = async (plan: (typeof PLANS)[0]) => {
     if (!isConnected) {
      showToast({
        title: "Please connect to the Internet.",
      });
      return;
    }
    try {
      if (!user || !accessToken) {
        showToast({ title: 'Please try again later.', time: 3000 });
        return;
      }

      // Prevent downgrade
      if (plan.index <= currentPlanIndex) {
        showToast({ title: 'You can only upgrade to a higher plan.', time: 3000 });
        return;
      }

      setLoadingPlanId(plan.id);
      setShowUpgradeModal(false);

      const response = await fetch(`${NEXT_API_URL}/payment/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          amount: plan.numericPrice,
          planId: plan.index,
          user,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Failed to create payment link');

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        Linking.createURL('payment-callback')
      );

      if (result.type === 'cancel') {
        console.log('Payment result:', result);
        api.post('/payment/fail', {}, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        showToast({ title: 'Payment Cancelled' });
      }
    } catch (error: any) {
      showToast({ title: error.message || 'Something went wrong' });
    } finally {
      reload();
      setLoadingPlanId(null);
    }
  };

  const renderCheck = (value: boolean | string, highlight = false) => {
    if (typeof value === 'string') {
      return (
        <Text style={[styles.compValue, highlight && { color: '#4ade80', fontWeight: '700' }]}>
          {value}
        </Text>
      );
    }

    return value ? (
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3">
        <Polyline points="20 6 9 17 4 12" />
      </Svg>
    ) : (
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fb7185" strokeWidth="3">
        <Line x1="18" y1="6" x2="6" y2="18" />
        <Line x1="6" y1="6" x2="18" y2="18" />
      </Svg>
    );
  };

  const renderPlan = ({ item }: { item: (typeof PLANS)[0] }) => (
    <Pressable
      style={({ pressed }) => [
        styles.planCard,
        item.featured && styles.planCardFeatured,
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      {item.featured && (
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedText}>Recommended</Text>
        </View>
      )}

      <View>
        <Text style={styles.planName}>{item.name}</Text>

        <View style={styles.planPriceRow}>
          <Text style={styles.planPrice}>{item.price}</Text>
          <Text style={styles.planPriceUnit}>/mo</Text>
        </View>

        <Text style={styles.planDuration}>{item.duration}</Text>

        <View style={styles.featuresList}>
          {item.features.map((feat, idx) => (
            <View key={idx} style={styles.featureItem}>
              <Svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke={item.featured ? '#4ade80' : pallete.accent}
                strokeWidth="3"
              >
                <Polyline points="20 6 9 17 4 12" />
              </Svg>
              <Text style={styles.featureText}>{feat}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        disabled={loadingPlanId !== null}
        style={({ pressed }) => [
          styles.actionBtn,
          item.featured && styles.actionBtnFeatured,
          pressed && { transform: [{ scale: 0.97 }] },
        ]}
        onPress={() => handlePayment(item)}
      >
        {loadingPlanId === item.id ? (
          <ActivityIndicator color={item.featured ? '#0b0b0b' : '#fff'} />
        ) : (
          <Text
            style={[
              styles.actionBtnText,
              item.featured && styles.actionBtnTextFeatured,
            ]}
          >
            {item.buttonText}
          </Text>
        )}
      </Pressable>
    </Pressable>
  );

  // ---------- Current Plan Card (when subscribed) ----------
  const renderCurrentPlanCard = () => {
    if (!currentPlan) return null;

    const isFeaturedLook = currentPlan.index >= 2;

    return (
      <View style={styles.currentPlanWrapper}>
        <View
          style={[
            styles.currentPlanCard,
            isFeaturedLook && styles.planCardFeatured,
          ]}
        >
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Current Plan</Text>
          </View>

          <Text style={styles.planName}>{currentPlan.name}</Text>

          <View style={styles.planPriceRow}>
            <Text style={styles.planPrice}>{currentPlan.price}</Text>
            <Text style={styles.planPriceUnit}>/mo</Text>
          </View>

          {/* Validity + Days Remaining */}
          <View style={styles.validityRow}>
            <View style={styles.validityItem}>
              <Text style={styles.validityLabel}>Valid Till</Text>
              <Text style={styles.validityValue}>
                {formatExpiry(user?.subscription?.expiresOn + "")}
              </Text>
            </View>
            <View style={styles.validityDivider} />
            <View style={styles.validityItem}>
              <Text style={styles.validityLabel}>Days Left</Text>
              <Text
                style={[
                  styles.validityValue,
                  daysRemaining !== null && daysRemaining <= 7 && { color: '#fbbf24' },
                  daysRemaining === 0 && { color: '#fb7185' },
                ]}
              >
                {daysRemaining === null
                  ? '—'
                  : daysRemaining === 0
                  ? 'Expired'
                  : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
              </Text>
            </View>
          </View>

          <View style={styles.featuresList}>
            {currentPlan.features.map((feat, idx) => (
              <View key={idx} style={styles.featureItem}>
                <Svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isFeaturedLook ? '#4ade80' : pallete.accent}
                  strokeWidth="3"
                >
                  <Polyline points="20 6 9 17 4 12" />
                </Svg>
                <Text style={styles.featureText}>{feat}</Text>
              </View>
            ))}
          </View>

          {/* Upgrade button – hidden for Pro */}
          {!isPro && (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnFeatured,
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => setShowUpgradeModal(true)}
            >
              <Text style={[styles.actionBtnText, styles.actionBtnTextFeatured]}>
                Upgrade Plan
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  // ---------- Upgrade Sheet ----------
  const renderUpgradeSheet = () => (
    <UpgradeSheet
      visible={showUpgradeModal}
      onClose={() => setShowUpgradeModal(false)}
      title="Upgrade Your Plan"
      subtitle="Choose a higher plan. You can only upgrade — downgrades are not allowed."
    >
      {upgradeOptions.length === 0 ? (
        <View style={styles.upgradeEmpty}>
          <Text style={styles.upgradeEmptyText}>
            You are already on the highest plan — no upgrades available.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.upgradeSheetBody}
        >
          {upgradeOptions.map((plan) => (
            <View
              key={plan.id}
              style={[
                styles.upgradeOptionCard,
                plan.featured && styles.planCardFeatured,
              ]}
            >
              <View style={styles.upgradeOptionHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.planPriceRow}>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  <Text style={styles.planPriceUnit}>/mo</Text>
                </View>
              </View>

              <Text style={styles.planDuration}>{plan.duration}</Text>

              <View style={styles.featuresList}>
                {plan.features.map((feat, idx) => (
                  <View key={idx} style={styles.featureItem}>
                    <Svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={plan.featured ? '#4ade80' : pallete.accent}
                      strokeWidth="3"
                    >
                      <Polyline points="20 6 9 17 4 12" />
                    </Svg>
                    <Text style={styles.featureText}>{feat}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                disabled={loadingPlanId !== null}
                style={({ pressed }) => [
                  styles.actionBtn,
                  plan.featured && styles.actionBtnFeatured,
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => handlePayment(plan)}
              >
                {loadingPlanId === plan.id ? (
                  <ActivityIndicator color={plan.featured ? '#0b0b0b' : '#fff'} />
                ) : (
                  <Text
                    style={[
                      styles.actionBtnText,
                      plan.featured && styles.actionBtnTextFeatured,
                    ]}
                  >
                    Upgrade to {plan.name}
                  </Text>
                )}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </UpgradeSheet>
  );

    if (!user && !isConnected) {
    return <View style={[styles.container,{ paddingTop: 100, alignItems: "center", justifyContent: "center"}]}>
      <Offline />
    </View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {isSubscribed && currentPlan ? (
          renderCurrentPlanCard()
        ) : (
          <FlatList
            data={PLANS}
            renderItem={renderPlan}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.plansContainer}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            snapToAlignment="center"
          />
        )}

        {/* Comparison table – still useful for free users or reference */}
        <View style={styles.compSection}>
          <Text style={styles.compTitle}>Compare Benefits</Text>
          <View style={styles.compTable}>
            <View style={styles.compHeaderRow}>
              <Text style={[styles.compHeaderCell, { flex: 1.4, textAlign: 'left' }]}>
                Features
              </Text>
              <Text style={styles.compHeaderCell}>Basic</Text>
              <Text style={[styles.compHeaderCell, { color: '#4ade80' }]}>Std</Text>
              <Text style={[styles.compHeaderCell, { color: '#fbbf24' }]}>Pro</Text>
            </View>

            {COMPARISON.map((row, idx) => (
              <View
                key={idx}
                style={[
                  styles.compRow,
                  idx === COMPARISON.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={[styles.featureLabel, { flex: 1.4 }]}>
                  {row.feature}
                </Text>
                <View style={styles.compCell}>{renderCheck(row.basic)}</View>
                <View style={styles.compCell}>{renderCheck(row.standard, true)}</View>
                <View style={styles.compCell}>{renderCheck(row.pro)}</View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {renderUpgradeSheet()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: pallete.bgmain || '#090314',
  },
  scrollContent: {
    paddingTop: 94,
    paddingBottom: 60,
  },
  plansContainer: {
    paddingHorizontal: 24,
    paddingTop: 35,
    paddingBottom: 32,
    gap: CARD_GAP,
  },

  // ---- Plan cards (shared) ----
  planCard: {
    width: CARD_WIDTH,
    backgroundColor: pallete.bgcard || 'rgba(20,20,20,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 24,
    justifyContent: 'space-between',
  },
  planCardFeatured: {
    borderWidth: 2,
    borderColor: '#00A36C',
    backgroundColor: 'rgba(20,20,20,0.85)',
    shadowColor: '#00A36C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 10,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: '#00A36C',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    shadowColor: '#00A36C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  recommendedText: {
    color: '#050505',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  planPriceUnit: {
    fontSize: 13,
    color: pallete.textgray,
    fontWeight: '400',
    marginLeft: 4,
  },
  planDuration: {
    fontSize: 12,
    color: '#fbbf24',
    fontWeight: '600',
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featuresList: {
    gap: 12,
    marginBottom: 28,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 13,
    color: '#e5e7eb',
    flex: 1,
  },
  actionBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  actionBtnFeatured: {
    backgroundColor: '#00A36C',
    shadowColor: '#00A36C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 4,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  actionBtnTextFeatured: {
    color: '#0b0b0b',
  },

  // ---- Current Plan specific ----
  currentPlanWrapper: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  currentPlanCard: {
    backgroundColor: pallete.bgcard || 'rgba(20,20,20,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 24,
  },
  currentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,163,108,0.15)',
    borderWidth: 1,
    borderColor: '#00A36C',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
  },
  currentBadgeText: {
    color: '#00A36C',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  validityRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 22,
    marginTop: 8,
  },
  validityItem: {
    flex: 1,
    alignItems: 'center',
  },
  validityDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 8,
  },
  validityLabel: {
    fontSize: 11,
    color: pallete.textgray,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  validityValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // ---- Comparison table ----
  compSection: {
    paddingHorizontal: 24,
    marginTop: 8,
  },
  compTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: pallete.textgray,
    marginBottom: 16,
  },
  compTable: {
    backgroundColor: pallete.bgcard || 'rgba(20,20,20,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  compHeaderRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  compHeaderCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  featureLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#e5e7eb',
  },
  compCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compValue: {
    fontSize: 12,
    color: '#e5e7eb',
    textAlign: 'center',
  },

  // ---- Upgrade Sheet ----
  upgradeSheetBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  upgradeEmpty: {
    paddingHorizontal: 20,
  },
  upgradeEmptyText: {
    fontSize: 13,
    color: pallete.textgray,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 28,
  },
  upgradeOptionCard: {
    backgroundColor: pallete.bgcard || 'rgba(20,20,20,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  upgradeOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
});

export default Subscription;