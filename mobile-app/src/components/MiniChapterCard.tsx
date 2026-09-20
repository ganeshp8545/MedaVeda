import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

type Props = {
  title: string;
  subtitle: string;
  emoji?: string;
  onPress: () => void;
};

export default function MiniChapterCard({ title, subtitle, emoji = "📘", onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 140,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginRight: SPACING.md,
    ...SHADOW.card,
  },
  emoji: {
    fontSize: 22,
    marginBottom: 8,
  },
  title: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.text,
    minHeight: 34,
  },
  subtitle: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 4,
  },
});
