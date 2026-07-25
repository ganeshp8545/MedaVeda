import React from "react";
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";

type Props = {
  title: string;
  subtitle?: string;
  price: number | null;
  owned: boolean;
  // 0 = Year row, 1 = Subject row, 2 = Chapter row - controls left indent
  // and border, so the hierarchy is visually obvious (Year -> Subject ->
  // Chapter, each nested a step further right).
  level: 0 | 1 | 2;
  expandable?: boolean;
  expanded?: boolean;
  childrenLoading?: boolean;
  onToggleExpand?: () => void;
  onBuy: () => void;
};

// One row in the Store's Year -> Subject -> Chapter accordion. Tapping
// the row itself expands/collapses its children (Years and Subjects);
// tapping the price badge always buys that exact level's Notes pack,
// separately from expand/collapse.
export default function PurchaseRow({
  title,
  subtitle,
  price,
  owned,
  level,
  expandable = false,
  expanded = false,
  childrenLoading = false,
  onToggleExpand,
  onBuy,
}: Props) {
  const canBuy = !owned && price !== null;

  return (
    <TouchableOpacity
      activeOpacity={expandable ? 0.7 : 1}
      onPress={expandable ? onToggleExpand : undefined}
      style={[
        styles.row,
        level === 0 && styles.rowLevel0,
        level === 1 && styles.rowLevel1,
        level === 2 && styles.rowLevel2,
      ]}
    >
      {expandable && (
        <Text style={styles.chevron}>{expanded ? "⌄" : "›"}</Text>
      )}

      <View style={styles.textBlock}>
        <Text
          style={[styles.title, level > 0 && styles.titleSmaller]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {expandable && childrenLoading ? (
        <ActivityIndicator size="small" color={COLORS.accent} style={styles.priceSpacing} />
      ) : (
        <TouchableOpacity
          activeOpacity={canBuy ? 0.7 : 1}
          disabled={!canBuy}
          onPress={onBuy}
          style={[
            styles.badge,
            owned && styles.badgeOwned,
            price === null && !owned && styles.badgeUnavailable,
            styles.priceSpacing,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              owned && styles.badgeTextOwned,
              price === null && !owned && styles.badgeTextUnavailable,
            ]}
          >
            {owned ? "✓ Owned" : price !== null ? `₹${price}` : "—"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },

  rowLevel0: {
    marginLeft: 0,
  },
  rowLevel1: {
    marginLeft: SPACING.lg,
  },
  rowLevel2: {
    marginLeft: SPACING.lg * 2,
  },

  chevron: {
    fontSize: 18,
    color: COLORS.subtitle,
    marginRight: SPACING.sm,
    width: 16,
    textAlign: "center",
  },

  textBlock: {
    flex: 1,
    marginRight: SPACING.sm,
  },

  title: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },

  titleSmaller: {
    fontSize: FONT.small,
    fontWeight: "600",
  },

  subtitle: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 2,
  },

  priceSpacing: {
    marginLeft: SPACING.sm,
  },

  badge: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 60,
    alignItems: "flex-end",
  },

  badgeOwned: {},

  badgeUnavailable: {},

  badgeText: {
    color: COLORS.accent,
    fontWeight: "700",
    fontSize: FONT.body,
  },

  badgeTextOwned: {
    color: COLORS.success,
  },

  badgeTextUnavailable: {
    color: COLORS.subtitle,
  },
});
