import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";

type Props = {
  query: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onBrowseStore: () => void;
};

// "Graceful empty-state screens with helpful suggestions when no matching
// content is found" - distinguishes "your filters are too narrow" (an
// easy one-tap fix) from a genuine no-match, and always offers a way
// back into browsing instead of a dead end.
export default function SearchEmptyState({ query, hasActiveFilters, onClearFilters, onBrowseStore }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔍</Text>
      <Text style={styles.title}>No results for "{query}"</Text>
      <Text style={styles.subtitle}>
        {hasActiveFilters
          ? "Try removing a filter, or check the spelling."
          : "Try a different keyword, a subject name, or a shorter search term."}
      </Text>

      <View style={styles.actions}>
        {hasActiveFilters && (
          <TouchableOpacity style={styles.actionBtn} onPress={onClearFilters} activeOpacity={0.85}>
            <Text style={styles.actionText}>Clear Filters</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnGhost]}
          onPress={onBrowseStore}
          activeOpacity={0.85}
        >
          <Text style={[styles.actionText, styles.actionTextGhost]}>Browse Notes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
  },
  icon: {
    fontSize: 44,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT.subHeading,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    textAlign: "center",
    marginTop: SPACING.sm,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  actionBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
  },
  actionBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: FONT.small,
  },
  actionTextGhost: {
    color: COLORS.text,
  },
});
