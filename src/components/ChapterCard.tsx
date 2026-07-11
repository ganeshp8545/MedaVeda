import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

type Props = {
  title: string;
  unlocked: boolean;
  onPress: () => void;
};

export default function ChapterCard({
  title,
  unlocked,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.iconBadge, !unlocked && styles.iconBadgeLocked]}>
        <Text style={styles.icon}>{unlocked ? "📂" : "🔒"}</Text>
      </View>

      <Text style={styles.title}>{title}</Text>

      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
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
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },

  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: `${COLORS.accent}26`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },

  iconBadgeLocked: {
    backgroundColor: COLORS.surfaceMuted,
  },

  icon: {
    fontSize: 20,
  },

  title: {
    flex: 1,
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.text,
  },

  chevron: {
    fontSize: 24,
    fontWeight: "300",
    color: COLORS.accent,
  },
});
