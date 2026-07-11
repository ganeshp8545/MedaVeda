import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

export default function AboutScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.logo}>📚</Text>

      <Text style={styles.title}>
        AyurPulse
      </Text>

      <Text style={styles.version}>
        Version 1.0.0
      </Text>

      <Text style={styles.heading}>
        About
      </Text>

      <Text style={styles.description}>
        AyurPulse is a learning platform designed for
        BAMS students. It provides organized study
        notes, video lectures, quizzes, previous year
        papers, mock tests, and premium learning
        resources in one place.
      </Text>

      <Text style={styles.heading}>
        Features
      </Text>

      <Text style={styles.feature}>
        • PDF Notes
      </Text>

      <Text style={styles.feature}>
        • Video Lectures
      </Text>

      <Text style={styles.feature}>
        • MCQ Quiz
      </Text>

      <Text style={styles.feature}>
        • Premium Learning
      </Text>

      <Text style={styles.feature}>
        • Progress Tracking
      </Text>

      <Text style={styles.feature}>
        • Regular Updates
      </Text>

      <Text style={styles.footer}>
        © 2026 AyurPulse
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
    paddingBottom: 50,
  },

  logo: {
    fontSize: 70,
    textAlign: "center",
  },

  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
    textAlign: "center",
    marginTop: SPACING.sm,
  },

  version: {
    textAlign: "center",
    color: COLORS.subtitle,
    marginBottom: SPACING.xl,
  },

  heading: {
    fontSize: FONT.heading,
    fontWeight: "700",
    color: COLORS.accentLight,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },

  description: {
    fontSize: FONT.body,
    color: COLORS.text,
    lineHeight: 24,
  },

  feature: {
    fontSize: FONT.body,
    color: COLORS.text,
    marginBottom: 10,
  },

  footer: {
    marginTop: 40,
    textAlign: "center",
    color: COLORS.subtitle,
  },
});