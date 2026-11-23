import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  BackHandler,
  Dimensions,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";
import { VersionInfo } from "../../lib/versionCheck";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/* --------------------------------------------------------------------------
 * READAPT Signature Teal-Mint & Deep Dark Palette (Matched to update.png)
 * ----------------------------------------------------------------------- */
const THEME = {
  bgMain: "#060D0C",
  bgDeep: "#040908",
  cardBg: "rgba(12, 24, 22, 0.88)",
  cardBorder: "rgba(0, 210, 180, 0.24)",
  iconBoxBg: "rgba(0, 210, 180, 0.11)",
  iconBoxBorder: "rgba(0, 210, 180, 0.28)",
  tealBright: "#5EEAD4",
  tealPrimary: "#00D2B4",
  tealMid: "#00B89C",
  tealDeep: "#01796F",
  textPrimary: "#FFFFFF",
  textSecondary: "#CBD5E1",
  textMuted: "#94A3B8",
  textOnTeal: "#041614",
};

interface ForceUpdateModalProps {
  visible: boolean;
  versionInfo?: VersionInfo | null;
  isPreview?: boolean;
  onClose?: () => void;
}

/* --------------------------------------------------------------------------
 * Subtle Bottom-Right Corner Wave Accent
 * ----------------------------------------------------------------------- */
const BottomCornerWave = () => (
  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
    <Svg
      width={SCREEN_WIDTH}
      height={SCREEN_HEIGHT}
      viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}
      preserveAspectRatio="none"
    >
      <Defs>
        <SvgLinearGradient id="bottomRightWave" x1="100%" y1="100%" x2="0%" y2="0%">
          <Stop offset="0%" stopColor={THEME.tealPrimary} stopOpacity="0.38" />
          <Stop offset="60%" stopColor={THEME.tealDeep} stopOpacity="0.14" />
          <Stop offset="100%" stopColor={THEME.bgMain} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>

      <Path
        d={`M${SCREEN_WIDTH} ${SCREEN_HEIGHT} L${
          SCREEN_WIDTH * 0.56
        } ${SCREEN_HEIGHT} C${SCREEN_WIDTH * 0.72} ${
          SCREEN_HEIGHT * 0.91
        }, ${SCREEN_WIDTH * 0.86} ${SCREEN_HEIGHT * 0.88}, ${SCREEN_WIDTH} ${
          SCREEN_HEIGHT * 0.84
        } Z`}
        fill="url(#bottomRightWave)"
      />
      <Path
        d={`M${SCREEN_WIDTH * 0.64} ${SCREEN_HEIGHT} C${
          SCREEN_WIDTH * 0.78
        } ${SCREEN_HEIGHT * 0.92}, ${SCREEN_WIDTH * 0.9} ${
          SCREEN_HEIGHT * 0.89
        }, ${SCREEN_WIDTH} ${SCREEN_HEIGHT * 0.86}`}
        stroke={THEME.tealBright}
        strokeOpacity="0.22"
        strokeWidth="1.2"
        fill="none"
      />
    </Svg>
  </View>
);

/* --------------------------------------------------------------------------
 * Crisp Vector Icons
 * ----------------------------------------------------------------------- */
const SyncRefreshIcon = ({ size = 15, color = THEME.tealPrimary }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <Path d="M3 3v5h5" />
    <Path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <Path d="M16 16h5v5" />
  </Svg>
);

const SparkleIcon = ({ size = 18, color = THEME.tealPrimary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2 Q12 12 22 12 Q12 12 12 22 Q12 12 2 12 Q12 12 12 2 Z"
      fill={color}
    />
  </Svg>
);

const CrownPlanIcon = ({ size = 20, color = THEME.tealPrimary }) => (
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
    <Path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
  </Svg>
);

const HeadphonesIcon = ({ size = 20, color = THEME.tealPrimary }) => (
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
    <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </Svg>
);

const MiniRocketIcon = ({ size = 20, color = THEME.tealPrimary }) => (
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
    <Path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <Path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <Path d="M9 12H4s.55-3.03 2-4.5c1.62-1.63 5-2.5 5-2.5" />
    <Path d="M15 15v5s3.03-.55 4.5-2c1.63-1.62 2.5-5 2.5-5" />
  </Svg>
);

const InfoCircleOutlineIcon = ({ size = 32, color = THEME.tealPrimary }) => (
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
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 16v-4" />
    <Path d="M12 8h.01" />
  </Svg>
);

const GooglePlayTriangleIcon = ({ size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3.6 2.4C3.3 2.7 3.1 3.2 3.1 3.9V20.1C3.1 20.8 3.3 21.3 3.6 21.6L3.7 21.7L12.8 12.6V12.4V12.2L3.7 3.1L3.6 2.4Z"
      fill="#00D2FF"
    />
    <Path
      d="M15.8 15.6L12.8 12.6V12.4V12.2L15.8 9.2L15.9 9.3L19.5 11.3C20.5 11.9 20.5 12.9 19.5 13.5L15.9 15.5L15.8 15.6Z"
      fill="#FFCE00"
    />
    <Path
      d="M15.9 15.5L12.8 12.4L3.6 21.6C3.9 22 4.5 22 5.2 21.6L15.9 15.5Z"
      fill="#FF3A44"
    />
    <Path
      d="M15.9 9.3L5.2 3.2C4.5 2.8 3.9 2.8 3.6 3.2L12.8 12.4L15.9 9.3Z"
      fill="#00F076"
    />
  </Svg>
);

/* --------------------------------------------------------------------------
 * Main Force Update Modal Component
 * ----------------------------------------------------------------------- */
export default function ForceUpdateModal({
  visible,
  versionInfo,
  isPreview = false,
  onClose,
}: ForceUpdateModalProps) {
  const insets = useSafeAreaInsets();

  // Lock hardware back press on Android when force update is active
  useEffect(() => {
    if (!visible || isPreview) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [visible, isPreview]);

  if (!visible) return null;

  const storeUrl =
    versionInfo?.storeUrl ||
    "https://play.google.com/store/apps/details?id=com.readapt.app";

  const defaultNotes = [
    "Paid plans now include exclusive series, full access, and much more",
    "Enhanced audio player and smoother reading experience",
    "Performance optimizations and critical bug fixes",
  ];

  const notes =
    versionInfo?.releaseNotes && versionInfo.releaseNotes.length > 0
      ? [
          "Paid plans now include exclusive series, full access, and much more",
          ...versionInfo.releaseNotes.slice(0, 2),
        ]
      : defaultNotes;

  const handleOpenStore = () => {
    Linking.openURL(storeUrl).catch(() => {
      Linking.openURL("https://play.google.com/store/apps");
    });
  };

  const renderNoteIcon = (index: number) => {
    if (index === 0) return <CrownPlanIcon size={20} color={THEME.tealPrimary} />;
    if (index === 1) return <HeadphonesIcon size={20} color={THEME.tealPrimary} />;
    return <MiniRocketIcon size={20} color={THEME.tealPrimary} />;
  };

  const heroImageHeight = Math.min(SCREEN_WIDTH * 0.68, 275);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (isPreview && onClose) onClose();
      }}
    >
      <View style={styles.container}>
        {/* Base Dark Background */}
        <LinearGradient
          colors={[THEME.bgMain, THEME.bgDeep, "#030706"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Full-Bleed Top Hero Artwork (update.png) with Seamless Bottom Fade */}
        <View
          style={[styles.heroArtworkContainer, { height: heroImageHeight }]}
          pointerEvents="none"
        >
          <Image
            source={require("../../assets/update.png")}
            style={styles.heroArtworkImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={[
              "rgba(6, 13, 12, 0)",
              "rgba(6, 13, 12, 0.68)",
              THEME.bgMain,
            ]}
            locations={[0.45, 0.82, 1]}
            style={styles.heroBottomFade}
          />
        </View>

        {/* Bottom-Right Subtle Corner Wave */}
        <BottomCornerWave />

        {/* Main Screen Content */}
        <View
          style={[
            styles.innerContent,
            {
              paddingTop: Math.max(insets.top + 8, 22),
              paddingBottom: Math.max(insets.bottom + 14, 24),
            },
          ]}
        >
          {/* Spacer framing the Rocket & Clouds inside update.png */}
          <View style={{ height: heroImageHeight - Math.max(insets.top + 8, 22) - 22 }} />

          {/* Update Required Pill Badge */}
          <View style={styles.requiredPill}>
            <SyncRefreshIcon size={15} color={THEME.tealPrimary} />
            <Text style={styles.requiredPillText}>UPDATE REQUIRED</Text>
          </View>

          {/* Headline & Supporting Subtitle */}
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            {versionInfo?.title || "Time to Update READAPT"}
          </Text>
          <Text style={styles.subtitle}>
            {versionInfo?.message ||
              "A new version is available with exciting improvements and a smoother experience."}
          </Text>

          {/* What's New Card */}
          <View style={styles.whatsNewCard}>
            <View style={styles.whatsNewHeader}>
              <SparkleIcon size={18} color={THEME.tealPrimary} />
              <Text style={styles.whatsNewTitle}>What’s New</Text>
            </View>

            <View style={styles.notesList}>
              {notes.slice(0, 3).map((note, index) => (
                <View key={index} style={styles.noteRow}>
                  <View style={styles.noteIconBox}>
                    {renderNoteIcon(index)}
                  </View>
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Required Info Banner Card */}
          <View style={styles.infoBannerCard}>
            <InfoCircleOutlineIcon size={30} color={THEME.tealPrimary} />
            <View style={styles.infoBannerTextWrap}>
              <Text style={styles.infoBannerTitle}>
                Update now to keep enjoying READAPT
              </Text>
              <Text style={styles.infoBannerSub}>
                This update is required to continue using the app.
              </Text>
            </View>
          </View>

          {/* Primary Pill CTA Button */}
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.86}
            onPress={handleOpenStore}
          >
            <LinearGradient
              colors={[THEME.tealBright, THEME.tealPrimary, THEME.tealMid]}
              start={{ x: 0.08, y: 0 }}
              end={{ x: 0.92, y: 1 }}
              style={styles.primaryBtnGradient}
            >
              <GooglePlayTriangleIcon size={22} />
              <Text style={styles.primaryBtnText}>Update on Play Store</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Preview Mode Dismiss Link */}
          {isPreview && onClose ? (
            <TouchableOpacity
              style={styles.exitPreviewBtn}
              activeOpacity={0.7}
              onPress={onClose}
            >
              <Text style={styles.exitPreviewText}>Exit Preview Mode</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
 * Styles
 * ----------------------------------------------------------------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bgMain,
  },
  heroArtworkContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: SCREEN_WIDTH,
    overflow: "hidden",
  },
  heroArtworkImage: {
    width: "100%",
    height: "100%",
  },
  heroBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 76,
  },
  innerContent: {
    flex: 1,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "space-between",
  },

  /* Update Required Pill */
  requiredPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(6, 18, 16, 0.85)",
    borderColor: "rgba(0, 210, 180, 0.36)",
    borderWidth: 1.2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  requiredPillText: {
    color: THEME.tealPrimary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  /* Title & Subtitle */
  title: {
    color: THEME.textPrimary,
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: THEME.textSecondary,
    fontSize: 14.5,
    lineHeight: 20.5,
    textAlign: "center",
    paddingHorizontal: 10,
  },

  /* What's New Card */
  whatsNewCard: {
    width: "100%",
    backgroundColor: THEME.cardBg,
    borderColor: THEME.cardBorder,
    borderWidth: 1.2,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  whatsNewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 13,
  },
  whatsNewTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  notesList: {
    gap: 11,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  noteIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: THEME.iconBoxBg,
    borderColor: THEME.iconBoxBorder,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noteText: {
    flex: 1,
    color: "#E2E8F0",
    fontSize: 13.5,
    lineHeight: 18.5,
    fontWeight: "500",
  },

  /* Info Banner Card */
  infoBannerCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.cardBg,
    borderColor: THEME.cardBorder,
    borderWidth: 1.2,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 14,
  },
  infoBannerTextWrap: {
    flex: 1,
  },
  infoBannerTitle: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: "700",
    marginBottom: 2,
  },
  infoBannerSub: {
    color: THEME.textMuted,
    fontSize: 12.5,
    lineHeight: 17,
  },

  /* Primary Pill CTA */
  primaryBtn: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: THEME.tealPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 14,
    elevation: 7,
  },
  primaryBtnGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },
  primaryBtnText: {
    color: THEME.textOnTeal,
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  /* Preview Dismiss Link */
  exitPreviewBtn: {
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  exitPreviewText: {
    color: THEME.textSecondary,
    fontSize: 13.5,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});