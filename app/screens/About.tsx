import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from "../../components/nav/MainNavigation";

type Props = NativeStackScreenProps<RootStackParamList, 'About'>;


import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
} from 'react-native';
import Svg, { Path, Polyline, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCENT = '#01796F';
const BG = '#090314';
const CARD_BG = 'rgba(20, 20, 20, 0.6)';
const TEXT_GRAY = '#9ca3af';
const TEXT_WHITE = '#ffffff';
const PADDING_SIDE = 24;

const MailIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
      stroke={ACCENT}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Polyline
      points="22,6 12,13 2,6"
      stroke={ACCENT}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const PhoneIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
      stroke={ACCENT}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const FeedbackIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      stroke={ACCENT}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Line x1="12" y1="11" x2="12" y2="11.01" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" />
    <Line x1="12" y1="7" x2="12" y2="9" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const ChevronRight = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill={TEXT_GRAY}>
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.853333333333333 7.6466666666666665a0.5 0.5 0 0 1 0 0.7066666666666667l-5 5a0.5 0.5 0 0 1 -0.7066666666666667 -0.7066666666666667L9.793333333333333 8 5.1466666666666665 3.3533333333333335a0.5 0.5 0 0 1 0.7066666666666667 -0.7066666666666667l5 5Z"
    />
  </Svg>
);

// ——— Screen ———
const About = ({ route, navigation }: Props) => {
  const openEmail = () => Linking.openURL('mailto:readaptsupport@gmail.com');
  const openPhone = () => Linking.openURL('tel:+917073036234');
  const openFeedback = () =>
    Linking.openURL('mailto:readaptsupport@gmail.com?subject=Feedback%20/%20Report%20an%20Issue');
  const openPrivacy = () => Linking.openURL('https://drive.google.com/file/d/1bcqXVKT4yyC3PCPlttcxuARzA1IHob2Z/view'); // replace with real URL
  const openTerms = () => Linking.openURL('https://drive.google.com/file/d/1N4WK0jX7ZDYXMTSgWLc51LQOrQoZ-8hR/view');     // replace with real URL
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.safe,{paddingBottom: insets.bottom, paddingTop: insets.top + 90}]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <View style={styles.squircle}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.appIcon}
              resizeMode="cover"
              fadeDuration={0}
            />
          </View>
          <View style={styles.brandDetails}>
            <Text style={styles.appName}>Readapt</Text>
            <Text style={styles.appVersion}>Version 1.0.2</Text>
          </View>
        </View>

        {/* Help and Feedback */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Help and Feedback</Text>
          <View style={styles.card}>
            {/* Email */}
            <TouchableOpacity style={styles.contactRow} onPress={openEmail} activeOpacity={0.7}>
              <View style={styles.contactLead}>
                <View style={styles.contactIcon}>
                  <MailIcon />
                </View>
                <View>
                  <Text style={styles.contactLabel}>Email</Text>
                  <Text style={styles.contactVal}>readaptsupport@gmail.com</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Phone */}
            <TouchableOpacity style={styles.contactRow} onPress={openPhone} activeOpacity={0.7}>
              <View style={styles.contactLead}>
                <View style={styles.contactIcon}>
                  <PhoneIcon />
                </View>
                <View>
                  <Text style={styles.contactLabel}>Phone</Text>
                  <Text style={styles.contactVal}>+91 70730-36234</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Feedback */}
            <TouchableOpacity
              style={[styles.contactRow, styles.lastRow]}
              onPress={openFeedback}
              activeOpacity={0.7}
            >
              <View style={styles.contactLead}>
                <View style={styles.contactIcon}>
                  <FeedbackIcon />
                </View>
                <View>
                  <Text style={styles.contactLabel}>Send Feedback</Text>
                  <Text style={styles.contactVal}>Report an Issue</Text>
                </View>
              </View>
              <ChevronRight />
            </TouchableOpacity>
          </View>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Legal</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.linkRow} onPress={openPrivacy} activeOpacity={0.7}>
              <Text style={styles.linkText}>Privacy Policy</Text>
              <ChevronRight />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.linkRow, styles.lastRow]}
              onPress={openTerms}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText}>Terms & Conditions</Text>
              <ChevronRight />
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>© 2026 Readapt · All rights reserved.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING_SIDE,
    paddingVertical: 12,
  },
  navSide: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_WHITE,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PADDING_SIDE,
    marginBottom: 32,
    gap: 16,
  },
  squircle: {
    width: 58,
    height: 58,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    // shadow (iOS)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    // elevation (Android)
    elevation: 6,
  },
  appIcon: {
    width: '100%',
    height: '100%',
  },
  brandDetails: {
    justifyContent: 'center',
  },
  appName: {
    fontFamily: 'PlayfairDisplay_600SemiBold', // optional – load via expo-font if you want the exact serif
    fontSize: 26,
    fontWeight: '600',
    color: TEXT_WHITE,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  appVersion: {
    fontSize: 12,
    color: TEXT_GRAY,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  section: {
    paddingHorizontal: PADDING_SIDE,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: ACCENT,
    marginBottom: 12,
  },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  contactLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  contactIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: TEXT_GRAY,
    fontWeight: '600',
    marginBottom: 2,
  },
  contactVal: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_WHITE,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_WHITE,
  },
  footer: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 11,
    color: '#555',
    fontWeight: '500',
    paddingHorizontal: PADDING_SIDE,
  },
});

export default About;