import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

type Props = {
  title: string;
  questionCount: number;
  onPress: () => void;
  locked?: boolean;
  free?: boolean;
};

export default function TestCard({
  title,
  questionCount,
  onPress,
  locked = false,
  free = false,
}: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, locked && styles.cardLocked]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.icon}>{locked ? "🔒" : free ? "🎁" : "📝"}</Text>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, locked && styles.titleLocked]}>
            {title}
          </Text>
          {free && (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>FREE</Text>
            </View>
          )}
        </View>

        <Text style={styles.subtitle}>
          {locked
            ? "Premium - Purchase required to unlock"
            : `${questionCount} Questions - Tap to Start Test`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },

  cardLocked: {
    backgroundColor: COLORS.surfaceMuted,
    opacity: 0.85,
  },

  titleLocked: {
    color: COLORS.subtitle,
  },

  icon: {
    fontSize: 30,
    marginRight: 15,
  },

  content: {
    flex: 1,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  freeBadge: {
    marginLeft: 8,
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  freeBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
  },

  title: {
    fontSize: FONT.body,
    color: COLORS.text,
    fontWeight: "600",
  },

  subtitle: {
    marginTop: 5,
    color: COLORS.subtitle,
    fontSize: FONT.small,
  },
});
