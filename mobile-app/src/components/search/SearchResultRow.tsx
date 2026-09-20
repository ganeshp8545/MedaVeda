import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";

import HighlightedText from "./HighlightedText";
import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SECTION_META, ScoredResult } from "../../types/search";

type Props = {
  result: ScoredResult;
  onPress: () => void;
  loading?: boolean;
};

// One consistent row for every content type (icon, title, subtitle,
// status badge, chevron) - the "categorized... each displaying an
// appropriate icon, thumbnail, title, subtitle, and navigation
// indicator" part of the spec, YouTube/Drive-search style rather than
// six visually different card layouts crammed into one list.
export default function SearchResultRow({ result, onPress, loading = false }: Props) {
  const icon = SECTION_META[result.type].icon;
  const locked = result.type === "note" && result.owned === false;
  const isPaidProduct = result.type === "product" && !result.owned;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75} disabled={loading}>
      <View style={[styles.iconWrap, locked && styles.iconWrapLocked]}>
        <Text style={styles.icon}>{locked ? "🔒" : icon}</Text>
      </View>

      <View style={styles.content}>
        <HighlightedText text={result.title} ranges={result.matchRanges} style={styles.title} numberOfLines={1} />
        {!!result.subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {result.subtitle}
          </Text>
        )}
      </View>

      <View style={styles.trailing}>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.accent} />
        ) : (
          <>
            {result.downloaded && <Text style={styles.badgeIcon}>⬇️</Text>}
            {result.type === "product" && (
              <Text style={[styles.badge, result.owned ? styles.badgeOwned : styles.badgePrice]}>
                {result.owned ? "Owned" : `₹${result.price ?? ""}`}
              </Text>
            )}
            {result.free && result.type !== "product" && <Text style={styles.badgeFree}>Free</Text>}
            {!isPaidProduct && <Text style={styles.chevron}>›</Text>}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
  },

  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },

  iconWrapLocked: {
    backgroundColor: `${COLORS.warning}22`,
  },

  icon: {
    fontSize: 18,
  },

  content: {
    flex: 1,
  },

  title: {
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.text,
  },

  subtitle: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginTop: 2,
  },

  trailing: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: SPACING.sm,
  },

  badgeIcon: {
    fontSize: 12,
    marginRight: 6,
  },

  badge: {
    fontSize: FONT.small,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    overflow: "hidden",
    marginRight: 4,
  },

  badgeOwned: {
    color: COLORS.success,
    backgroundColor: `${COLORS.success}22`,
  },

  badgePrice: {
    color: COLORS.accent,
    backgroundColor: `${COLORS.accent}1F`,
  },

  badgeFree: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.info,
    marginRight: 4,
  },

  chevron: {
    fontSize: 20,
    color: COLORS.subtitle,
    marginLeft: 2,
  },
});
