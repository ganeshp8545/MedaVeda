import React from "react";
import {
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
        MedVeda
      </Text>

      <Text style={styles.version}>
        Version 1.0.0
      </Text>

      <Text style={styles.heading}>
        About Us
      </Text>

      <Text style={styles.description}>
        MedVeda is a modern digital learning platform built to simplify
        academic education through organized, accessible, and
        high-quality study resources. Our mission is to help students
        learn smarter by providing structured educational content in
        one secure platform.{"\n\n"}
        The application offers carefully organized study materials
        including subject-wise notes, video lectures, quizzes,
        downloadable resources, and progress tracking to support
        effective self-learning. Designed with a clean, intuitive, and
        user-friendly interface, MedVeda enables students to access
        educational content anytime and anywhere.{"\n\n"}
        Our goal is to continuously improve the learning experience by
        introducing new educational features, performance enhancements,
        and updated academic content that aligns with students'
        evolving needs.
      </Text>

      <Text style={styles.heading}>
        Our Mission
      </Text>
      <Text style={styles.description}>
        To make quality education more accessible, organized, and
        engaging for every learner.
      </Text>

      <Text style={styles.heading}>
        Our Vision
      </Text>
      <Text style={styles.description}>
        To become one of the most trusted and innovative digital
        learning platforms by empowering students with reliable
        educational resources and modern technology.
      </Text>

      <Text style={styles.heading}>
        Features
      </Text>

      <Text style={styles.feature}>• PDF Notes</Text>
      <Text style={styles.feature}>• Video Lectures</Text>
      <Text style={styles.feature}>• MCQ Quiz</Text>
      <Text style={styles.feature}>• Premium Learning</Text>
      <Text style={styles.feature}>• Progress Tracking</Text>
      <Text style={styles.feature}>• Regular Updates</Text>

      <Text style={styles.heading}>
        Contact Us
      </Text>
      <Text style={styles.description}>
        App Name: MedVeda{"\n"}
        Support Email: medvedaforu@gmail.com{"\n"}
        Developer: MedVeda Team{"\n"}
        Country: India
      </Text>

      <Text style={styles.footer}>
        © 2026 MedVeda
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
    marginBottom: SPACING.sm,
  },

  footer: {
    marginTop: 40,
    textAlign: "center",
    color: COLORS.subtitle,
  },
});
