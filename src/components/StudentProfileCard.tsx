import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT, FONT_WEIGHT, LETTER_SPACING } from "../theme/typography";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

import ProgressRing from "./ProgressRing";
import StreakBadge from "./StreakBadge";
import GradientBackground from "./GradientBackground";
import AnimatedPressable from "./motion/AnimatedPressable";
import useStreak from "../hooks/useStreak";

type Props = {
  name: string;
  email: string;
  progressPercentage: number;
  purchasedCount: number;
  // e.g. "BAMS · 1st Year" - the student's current course and year.
  courseLabel?: string;
  onPress?: () => void;
};

// DESIGN SYSTEM - premium hero card. Same information as before (name,
// email, packages owned, overall quiz progress) plus a new Study Streak
// badge, now on a subtle brand-gradient surface instead of a flat card
// background, with AnimatedPressable's spring press-feedback replacing
// the plain TouchableOpacity fade.
export default function StudentProfileCard({
  name,
  email,
  progressPercentage,
  purchasedCount,
  courseLabel,
  onPress,
}: Props) {
  const { currentStreak, loading: streakLoading } = useStreak();
  const initial = name ? name.charAt(0).toUpperCase() : "?";

  return (
    <AnimatedPressable onPress={onPress} disabled={!onPress} scaleTo={0.98}>
      <View style={styles.card}>
        <GradientBackground
          colors={[COLORS.card, COLORS.primaryDark, COLORS.card]}
          direction="diagonal"
          style={styles.gradientLayer}
        />

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
          <View style={styles.avatarSheen} pointerEvents="none" />
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
          {!!courseLabel && (
            <Text style={styles.courseLabel} numberOfLines={1}>
              🎓 {courseLabel}
            </Text>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.badgeText}>
              📦 {purchasedCount} {purchasedCount === 1 ? "package" : "packages"}
            </Text>
            {!streakLoading && <StreakBadge days={currentStreak} />}
          </View>
        </View>

        <ProgressRing percentage={progressPercentage} size={72} strokeWidth={7} label="progress" />
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    overflow: "hidden",
    ...SHADOW.card,
  },

  gradientLayer: {
    opacity: 0.55,
  },

  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
    ...SHADOW.glow,
  },

  avatarSheen: {
    position: "absolute",
    top: 6,
    left: 9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  avatarText: {
    fontSize: 22,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLORS.textOnPrimary,
  },

  info: {
    flex: 1,
    paddingRight: SPACING.sm,
  },

  name: {
    fontSize: FONT.body,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLORS.text,
    letterSpacing: LETTER_SPACING.heading,
  },

  courseLabel: {
    fontSize: FONT.small,
    color: COLORS.accent,
    fontWeight: "600",
    marginTop: 2,
  },
  email: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 2,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },

  badgeText: {
    fontSize: FONT.tiny,
    color: COLORS.accentLight,
    fontWeight: FONT_WEIGHT.semiBold as any,
  },
});
