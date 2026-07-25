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
import { SPACING } from "../theme/spacing";

type Props = {
  icon: string;
  title: string;
  onPress: () => void;
};

export default function ProfileMenuCard({
  icon,
  title,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.left}>
        <Text style={styles.icon}>{icon}</Text>

        <Text style={styles.title}>
          {title}
        </Text>
      </View>

      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 14,

    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",

    ...SHADOW.card,
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
  },

  icon: {
    fontSize: 26,
    marginRight: SPACING.md,
  },

  title: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
  },

  arrow: {
    fontSize: 28,
    color: COLORS.accent,
  },
});