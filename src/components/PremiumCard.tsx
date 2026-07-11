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
  price: string;
  subtitle: string;
  popular?: boolean;
  onPress: () => void;
};

export default function PremiumCard({
  title,
  price,
  subtitle,
  popular,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.card,
        popular && styles.popularCard,
      ]}
      onPress={onPress}
    >
      {popular && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            MOST POPULAR
          </Text>
        </View>
      )}

      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.price}>
        {price}
      </Text>

      <Text style={styles.subtitle}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOW.card,
  },

  popularCard: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },

  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: SPACING.md,
  },

  badgeText: {
    color: COLORS.white,
    fontSize: FONT.tiny,
    fontWeight: "700",
  },

  title: {
    fontSize: FONT.heading,
    fontWeight: "700",
    color: COLORS.text,
  },

  price: {
    marginTop: SPACING.sm,
    fontSize: 30,
    fontWeight: "bold",
    color: COLORS.primary,
  },

  subtitle: {
    marginTop: SPACING.sm,
    color: COLORS.subtitle,
    fontSize: FONT.body,
  },
});