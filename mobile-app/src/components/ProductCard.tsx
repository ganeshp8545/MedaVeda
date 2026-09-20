import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";
import { ProductScope } from "../services/productsService";

type Props = {
  title: string;
  description?: string;
  scope: ProductScope;
  price: number;
  owned: boolean;
  onPress: () => void;
};

const SCOPE_LABEL: Record<ProductScope, string> = {
  chapter: "Chapter",
  subject: "Full Subject",
  year: "Full Year",
  bundle: "Multi-Year Bundle",
};

export default function ProductCard({
  title,
  description,
  scope,
  price,
  owned,
  onPress,
}: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.content}>
        <View style={styles.scopeTag}>
          <Text style={styles.scopeTagText}>{SCOPE_LABEL[scope]}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>

        {!!description && (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        )}
      </View>

      {owned ? (
        <View style={[styles.badge, { backgroundColor: COLORS.success }]}>
          <Text style={styles.badgeText}>✓ Owned</Text>
        </View>
      ) : (
        <View style={[styles.badge, { backgroundColor: COLORS.accent }]}>
          <Text style={styles.badgeText}>₹{price}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  content: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  scopeTag: {
    alignSelf: "flex-start",
    backgroundColor: `${COLORS.accent}26`,
    borderRadius: 20,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    marginBottom: 6,
  },
  scopeTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.accentLight,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },
  description: {
    marginTop: 4,
    color: COLORS.subtitle,
    fontSize: FONT.small,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 30,
  },
  badgeText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: FONT.small,
  },
});
