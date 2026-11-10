import React from "react";
import { View, StyleSheet } from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";
import { LinearGradient } from "expo-linear-gradient";

const Shimmer = createShimmerPlaceholder(LinearGradient);

const SHIMMER_COLORS = ["#141020", "#201a33", "#141020"];

const Block = ({
  width,
  height,
  radius = 8,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: any;
}) => (
  <Shimmer
    shimmerColors={SHIMMER_COLORS as unknown as string[]}
    style={[{ width: width ?? "100%", height, borderRadius: radius }, style]}
  />
);

/**
 * ProfileSkeleton
 * ---------------------------------------------------------------------------
 * Same geometry as the real screen (avatar ring, name, badges, bio, journey,
 * streak, referral, rows, log-out) so the layout never jumps when the cached
 * profile or the network response lands.
 */
export default function ProfileSkeleton() {
  return (
    <View style={styles.root} pointerEvents="none">
      {/* Avatar + identity */}
      <View style={styles.identityRow}>
        <View style={styles.avatarRing}>
          <Block width={88} height={88} radius={44} />
        </View>
        <View style={styles.identityText}>
          <Block width={"72%"} height={22} radius={7} />
          <Block width={"52%"} height={13} radius={6} style={{ marginTop: 8 }} />
          <View style={styles.badgesRow}>
            <Block width={92} height={22} radius={11} />
            <Block width={74} height={22} radius={11} />
          </View>
        </View>
      </View>

      {/* Bio */}
      <View style={styles.section}>
        <Block height={14} radius={6} />
        <Block width={"78%"} height={14} radius={6} style={{ marginTop: 8 }} />
      </View>

      {/* Learning journey */}
      <View style={styles.section}>
        <View style={styles.card}>
          <Block width={46} height={46} radius={14} />
          <View style={styles.cardBody}>
            <Block width={"62%"} height={16} radius={6} />
            <Block width={"40%"} height={12} radius={6} style={{ marginTop: 9 }} />
            <Block height={7} radius={4} style={{ marginTop: 12 }} />
          </View>
        </View>
      </View>

      {/* Streak */}
      <View style={styles.section}>
        <View style={[styles.card, styles.streakCard]}>
          <Block width={34} height={34} radius={17} />
          <View style={[styles.cardBody, { marginLeft: 14 }]}>
            <Block width={110} height={11} radius={5} />
            <Block width={128} height={40} radius={8} style={{ marginTop: 8 }} />
          </View>
        </View>
      </View>

      {/* Referral */}
      <View style={styles.section}>
        <View style={[styles.card, styles.referCard]}>
          <View style={styles.referTop}>
            <Block width={46} height={46} radius={14} />
            <View style={[styles.cardBody, { marginLeft: 14 }]}>
              <Block width={"54%"} height={16} radius={6} />
              <Block width={"88%"} height={11} radius={5} style={{ marginTop: 8 }} />
            </View>
            <Block width={72} height={34} radius={17} />
          </View>
          <Block height={52} radius={12} style={{ marginTop: 16 }} />
        </View>
      </View>

      {/* Rows */}
      <View style={styles.section}>
        <View style={styles.row}>
          <Block width={26} height={26} radius={7} />
          <Block width={"45%"} height={15} radius={6} style={{ marginLeft: 18 }} />
        </View>
        <View style={[styles.row, { marginTop: 12 }]}>
          <Block width={26} height={26} radius={7} />
          <Block width={"38%"} height={15} radius={6} style={{ marginLeft: 18 }} />
        </View>
      </View>

      {/* Log out */}
      <View style={[styles.section, { marginTop: 4 }]}>
        <Block height={54} radius={27} />
      </View>

      <Block width={168} height={11} radius={5} style={styles.footer} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 4 },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 22,
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "rgba(0, 210, 180, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  identityText: { flex: 1, marginLeft: 16 },
  badgesRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 16,
  },
  streakCard: { backgroundColor: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.14)" },
  referCard: { flexDirection: "column", alignItems: "stretch" },
  referTop: { flexDirection: "row", alignItems: "center" },
  cardBody: { flex: 1, marginLeft: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 62,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  footer: { alignSelf: "center", marginTop: 18, marginBottom: 28 },
});
