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

      <Text style={styles.intro}>
        MedVeda respects your privacy and is committed to protecting
        your personal information.
      </Text>

      <Text style={styles.heading}>
        Information We Collect
      </Text>
      <Text style={styles.body}>
        • Full Name{"\n"}
        • Email Address{"\n"}
        • Profile Information{"\n"}
        • Purchase History{"\n"}
        • Learning Progress{"\n"}
        • Quiz Scores{"\n"}
        • Device Information{"\n"}
        • Crash Reports{"\n"}
        • Analytics Data
      </Text>

      <Text style={styles.heading}>
        How We Use Your Information
      </Text>
      <Text style={styles.body}>
        • Create your account{"\n"}
        • Authenticate users{"\n"}
        • Deliver purchased educational content{"\n"}
        • Track learning progress{"\n"}
        • Improve application performance{"\n"}
        • Provide customer support{"\n"}
        • Prevent fraud and abuse{"\n"}
        • Send important service notifications
      </Text>

      <Text style={styles.heading}>
        Payments
      </Text>
      <Text style={styles.body}>
        Payments are securely processed through trusted third-party
        payment providers.{"\n\n"}
        MedVeda does not store your debit card, credit card, UPI PIN,
        or banking credentials.
      </Text>

      <Text style={styles.heading}>
        Data Security
      </Text>
      <Text style={styles.body}>
        We implement appropriate technical and organizational measures
        to protect user information, including secure authentication,
        encrypted communications, and restricted database access.
      </Text>

      <Text style={styles.heading}>
        Third-Party Services
      </Text>
      <Text style={styles.body}>
        The application may use trusted third-party services including:
        {"\n"}
        • Supabase{"\n"}
        • Razorpay{"\n"}
        • Google Play Services{"\n\n"}
        These services maintain their own privacy policies.
      </Text>

      <Text style={styles.heading}>
        Children's Privacy
      </Text>
      <Text style={styles.body}>
        MedVeda is not intended for children under 13 years of age
        without parental or guardian supervision where required by law.
      </Text>

      <Text style={styles.heading}>
        Data Retention
      </Text>
      <Text style={styles.body}>
        User information is retained only as long as necessary to
        provide services, comply with legal obligations, resolve
        disputes, and enforce agreements.
      </Text>

      <Text style={styles.heading}>
        User Rights
      </Text>
      <Text style={styles.body}>
        Users may request:{"\n"}
        • Access to their data{"\n"}
        • Correction of inaccurate information{"\n"}
        • Account deletion{"\n"}
        • Data removal where legally applicable
      </Text>

      <Text style={styles.heading}>
        Changes to Privacy Policy
      </Text>
      <Text style={styles.body}>
        We may update this Privacy Policy periodically. Updates will
        become effective immediately upon publication inside the
        application.
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
