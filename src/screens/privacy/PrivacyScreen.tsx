import React from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
} from "react-native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

export default function PrivacyScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>
        🔒 Privacy Policy
      </Text>

      <Text style={styles.heading}>
        Information We Collect
      </Text>

      <Text style={styles.body}>
        AyurPulse collects basic account information such as
        your email address for authentication and progress
        tracking.
      </Text>

      <Text style={styles.heading}>
        How We Use Your Information
      </Text>

      <Text style={styles.body}>
        • To provide study materials{"\n"}
        • To save quiz scores{"\n"}
        • To improve user experience{"\n"}
        • To manage premium access
      </Text>

      <Text style={styles.heading}>
        Data Security
      </Text>

      <Text style={styles.body}>
        Your data is securely stored using Firebase services.
      </Text>

      <Text style={styles.heading}>
        Contact
      </Text>

      <Text style={styles.body}>
        Email: support@ayurpulse.in
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