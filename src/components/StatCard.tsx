import React from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SHADOW } from "../theme/shadows";
import { RADIUS } from "../theme/radius";

type Props = {
  title: string;
  value: string | number;
  icon?: string;
  color?: string;
};

export default function StatCard({
  title,
  value,
  icon,
  color = COLORS.accentLight,
}: Props) {
  return (
    <View style={styles.card}>
      {icon ? (
        <View style={[styles.badge, { backgroundColor: `${color}1A` }]}>
          <Text style={styles.badgeIcon}>{icon}</Text>
        </View>
      ) : null}

      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "flex-start",
    ...SHADOW.card,
  },

  badge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },

  badgeIcon: {
    fontSize: 16,
  },

  value: {
    fontSize: FONT.heading,
    fontWeight: "700",
  },

  title: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginTop: 2,
  },
});
