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

      <Text style={styles.intro}>
        Welcome to MedVeda, an educational platform designed to help
        students access academic notes, video lectures, quizzes, and
        study materials. By downloading, installing, or using the
        MedVeda application, you agree to the following Terms &
        Conditions. If you do not agree with these terms, please do not
        use the application.
      </Text>

      <Text style={styles.heading}>
        1. Acceptance of Terms
      </Text>
      <Text style={styles.body}>
        By creating an account or using MedVeda, you confirm that you
        have read, understood, and agreed to these Terms & Conditions.
      </Text>

      <Text style={styles.heading}>
        2. Educational Purpose
      </Text>
      <Text style={styles.body}>
        MedVeda is developed exclusively for educational and learning
        purposes. The content provided is intended to assist students
        in their academic preparation and should not be considered
        professional medical advice, diagnosis, or treatment.
      </Text>

      <Text style={styles.heading}>
        3. User Account
      </Text>
      <Text style={styles.body}>
        Users are responsible for maintaining the confidentiality of
        their login credentials. You are responsible for all activities
        performed through your account.
      </Text>

      <Text style={styles.heading}>
        4. Purchases
      </Text>
      <Text style={styles.body}>
        Digital products purchased within the application provide
        access only to the purchased educational content.{"\n\n"}
        Unless required by applicable law, all purchases are generally
        non-refundable after successful delivery and activation of
        digital content.
      </Text>

      <Text style={styles.heading}>
        5. Intellectual Property
      </Text>
      <Text style={styles.body}>
        All notes, PDFs, videos, quizzes, graphics, logos, designs, and
        application content belong to MedVeda or their respective
        owners.{"\n\n"}
        Users may not copy, redistribute, modify, resell, upload, or
        share any content without written permission.
      </Text>

      <Text style={styles.heading}>
        6. Acceptable Use
      </Text>
      <Text style={styles.body}>
        Users agree not to:{"\n"}
        • Attempt unauthorized access{"\n"}
        • Reverse engineer the application{"\n"}
        • Share purchased content illegally{"\n"}
        • Upload harmful or malicious content{"\n"}
        • Violate applicable laws
      </Text>

      <Text style={styles.heading}>
        7. Account Suspension
      </Text>
      <Text style={styles.body}>
        MedVeda reserves the right to suspend or permanently terminate
        any account involved in fraudulent activity, misuse, piracy,
        payment fraud, or violation of these Terms.
      </Text>

      <Text style={styles.heading}>
        8. Disclaimer
      </Text>
      <Text style={styles.body}>
        Although every effort is made to maintain accurate educational
        content, MedVeda does not guarantee that all information is
        complete, error-free, or continuously updated.
      </Text>

      <Text style={styles.heading}>
        9. Limitation of Liability
      </Text>
      <Text style={styles.body}>
        MedVeda shall not be liable for any indirect, incidental, or
        consequential damages arising from the use or inability to use
        the application.
      </Text>

      <Text style={styles.heading}>
        10. Updates
      </Text>
      <Text style={styles.body}>
        We may modify these Terms & Conditions at any time. Continued
        use of the application constitutes acceptance of the updated
        Terms.
      </Text>

      <Text style={styles.heading}>
        Contact
      </Text>
      <Text style={styles.body}>
        Email: medvedaforu@gmail.com
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

  intro: {
    fontSize: FONT.body,
    color: COLORS.text,
    lineHeight: 24,
    marginBottom: SPACING.sm,
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
