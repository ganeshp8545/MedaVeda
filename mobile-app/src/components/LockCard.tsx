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
  subtitle: string;
  onPress: () => void;
};

export default function LockCard({
  title,
  subtitle,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.card}
      onPress={onPress}
    >
      <Text style={styles.lock}>🔒</Text>

      <View style={styles.content}>
        <Text style={styles.title}>
          {title}
        </Text>

        <Text style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },

  lock: {
    fontSize: 30,
    marginRight: SPACING.md,
  },

  content: {
    flex: 1,
  },

  title: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },

  subtitle: {
    marginTop: 4,
    fontSize: FONT.small,
    color: COLORS.subtitle,
  },
});