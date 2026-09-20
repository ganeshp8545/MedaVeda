import React from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";

export default function EmptyState({
  title,
}: {
  title: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📚</Text>

      <Text style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 60,
    alignItems: "center",
  },

  icon: {
    fontSize: 50,
    marginBottom: SPACING.md,
  },

  title: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
  },
});