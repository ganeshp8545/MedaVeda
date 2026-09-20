import React from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
} from "react-native";

import { COLORS } from "../theme/colors";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";

type Props = {
  title: string;
  onPress: () => void;
  locked?: boolean;
};

export default function VideoCard({
  title,
  onPress,
  locked = false,
}: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, locked && styles.cardLocked]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.iconBadge, locked && styles.iconBadgeLocked]}>
        <Text style={styles.icon}>{locked ? "🔒" : "🎥"}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, locked && styles.titleLocked]}>
          {title}
        </Text>

        <Text style={styles.subtitle}>
          {locked ? "Purchase required to unlock" : "Tap to Watch Video"}
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
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },

  cardLocked: {
    backgroundColor: COLORS.surfaceMuted,
    opacity: 0.85,
  },

  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: `${COLORS.info}26`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },

  iconBadgeLocked: {
    backgroundColor: COLORS.surfaceMuted,
  },

  icon: {
    fontSize: 22,
  },

  content: {
    flex: 1,
  },

  title: {
    fontSize: FONT.body,
    fontWeight: "bold",
    color: COLORS.text,
  },

  titleLocked: {
    color: COLORS.subtitle,
  },

  subtitle: {
    marginTop: SPACING.xs,
    color: COLORS.subtitle,
    fontSize: FONT.small,
  },
});
