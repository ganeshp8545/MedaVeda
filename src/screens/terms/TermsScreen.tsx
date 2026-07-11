import React from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
} from "react-native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

export default function TermsScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>
        📜 Terms & Conditions
      </Text>

      <Text style={styles.heading}>
        Acceptance
      </Text>

      <Text style={styles.body}>
        By using AyurPulse, you agree to follow these terms
        and conditions.
      </Text>

      <Text style={styles.heading}>
        Educational Purpose
      </Text>

      <Text style={styles.body}>
        All study materials are provided for educational
        purposes only.
      </Text>

      <Text style={styles.heading}>
        User Responsibility
      </Text>

      <Text style={styles.body}>
        Users should not copy, distribute or misuse any
        premium content without permission.
      </Text>

      <Text style={styles.heading}>
        Premium Membership
      </Text>

      <Text style={styles.body}>
        Premium subscriptions are subject to the pricing and
        policies displayed inside the app.
      </Text>

      <Text style={styles.heading}>
        Changes
      </Text>

      <Text style={styles.body}>
        AyurPulse may update these terms at any time.
      </Text>

      <Text style={styles.footer}>
        Last Updated: July 2026
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.lg,
    paddingTop: 60,
    paddingBottom: 40,
  },

  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },

  heading: {
    fontSize: FONT.heading,
    fontWeight: "700",
    color: COLORS.accentLight,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },

  body: {
    fontSize: FONT.body,
    color: COLORS.text,
    lineHeight: 24,
  },

  footer: {
    marginTop: SPACING.xl,
    textAlign: "center",
    color: COLORS.subtitle,
  },
});