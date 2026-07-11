import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from "react-native";

import { COLORS } from "../theme/colors";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";

type Props = {
  title: string;
  icon: string;
  color: string;
  onPress: () => void;
};

export default function FeatureCard({
  title,
  icon,
  color,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.iconBadge, { backgroundColor: `${color}26` }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      <Text style={styles.title}>{title}</Text>

      <Text style={[styles.chevron, { color }]}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    marginVertical: 8,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },

  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },

  icon: {
    fontSize: 22,
  },

  title: {
    flex: 1,
    fontSize: FONT.subHeading,
    fontWeight: "600",
    color: COLORS.text,
  },

  chevron: {
    fontSize: 26,
    fontWeight: "300",
  },
});
