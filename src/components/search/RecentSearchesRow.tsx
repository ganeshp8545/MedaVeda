import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { RecentSearchEntry } from "../../utils/recentSearches";

type Props = {
  entries: RecentSearchEntry[];
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
  onClearAll: () => void;
};

// "Clear search history management" - shown above the discovery sections
// whenever the student hasn't typed a query yet and has searched before.
// Tapping a chip re-runs that search; the small × removes just that one
// entry without needing a confirmation dialog (same low-friction pattern
// as swipe-to-archive on Notifications).
export default function RecentSearchesRow({ entries, onSelect, onRemove, onClearAll }: Props) {
  if (entries.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Recent Searches</Text>
        <TouchableOpacity onPress={onClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.clearAll}>Clear All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.wrap}>
        {entries.map((entry) => (
          <TouchableOpacity
            key={entry.query}
            style={styles.pill}
            activeOpacity={0.75}
            onPress={() => onSelect(entry.query)}
          >
            <Text style={styles.pillIcon}>🕐</Text>
            <Text style={styles.pillText} numberOfLines={1}>
              {entry.query}
            </Text>
            <TouchableOpacity
              onPress={() => onRemove(entry.query)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.pillClose}
            >
              <Text style={styles.pillCloseText}>×</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  heading: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.subtitle,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  clearAll: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.accent,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 220,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.sm,
    paddingVertical: 8,
  },
  pillIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  pillText: {
    fontSize: FONT.small,
    fontWeight: "600",
    color: COLORS.text,
    flexShrink: 1,
  },
  pillClose: {
    marginLeft: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pillCloseText: {
    fontSize: 15,
    lineHeight: 15,
    color: COLORS.subtitle,
    fontWeight: "700",
  },
});
