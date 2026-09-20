import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";

type Props = {
  title: string;
  locked?: boolean;
  onPress: () => void;
};

// Plain flat list row - just the title, a thin divider underneath, and a
// chevron (or a lock icon for locked chapters) - no card box, no
// shadow, no icon badge. Used for the Year -> Subject -> Chapter
// Quick Access flow (Notes/Videos/MCQ Test), which is meant to read as
// a simple list to pick from rather than a grid of cards.
export default function SimpleListItem({ title, locked = false, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.title, locked && styles.titleLocked]} numberOfLines={1}>
        {title}
      </Text>

      <Text style={styles.trailing}>{locked ? "🔒" : "›"}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  title: {
    flex: 1,
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.text,
    marginRight: SPACING.sm,
  },

  titleLocked: {
    color: COLORS.subtitle,
  },

  trailing: {
    fontSize: 20,
    color: COLORS.accent,
  },
});
