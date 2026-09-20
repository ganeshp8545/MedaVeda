import React from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
} from "react-native";

import WebLink from "../../components/WebLink";
import { LEGAL, WEB } from "../../constants/legal";
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
        MedVeda respects your privacy. This is a short summary of how
        we handle your personal data under India's Digital Personal
        Data Protection Act, 2023. The full policy is on our website.
      </Text>
      <WebLink label="Read full policy" url={WEB.privacy} />

      <Text style={styles.heading}>
        Information We Collect
      </Text>
      <Text style={styles.body}>
        • Account: full name, email address, mobile number{"\n"}
        • Study profile: course, academic year, referral code{"\n"}
        • Purchases and payments: orders, products, amounts, Razorpay IDs{"\n"}
        • Learning activity: quiz scores and usage events (screens, notes, videos, quizzes, searches){"\n"}
        • Notifications: push token, device platform and your preferences{"\n"}
        • Crash and error data: device model, OS and app version{"\n"}
        • Anything you send to support{"\n\n"}
        We do not collect your location, contacts or photos.
      </Text>
      <Text style={styles.heading}>
        How We Use Your Information
      </Text>
      <Text style={styles.body}>
        • Create and secure your account{"\n"}
        • Deliver purchased content and track your progress{"\n"}
        • Send account emails and notifications you allow{"\n"}
        • Fix bugs and improve the app{"\n"}
        • Provide support and prevent fraud and abuse{"\n\n"}
        We do not sell your personal data.
      </Text>
      <Text style={styles.heading}>
        Payments
      </Text>
      <Text style={styles.body}>
        Payments are processed by Razorpay. MedVeda does not store
        your card numbers, UPI PIN or bank credentials.
      </Text>
      <Text style={styles.heading}>
        Who We Share Data With
      </Text>
      <Text style={styles.body}>
        Service providers that process data on our behalf:{"\n"}
        • Supabase – database, sign-in and file storage (hosted in Seoul, South Korea){"\n"}
        • Razorpay – payments{"\n"}
        • Resend – account emails (verification and password reset){"\n"}
        • Sentry – crash and error reports{"\n"}
        • Expo – push notifications{"\n"}
        • Google Play – app distribution{"\n\n"}
        Each provider follows its own privacy policy. We may also
        disclose data where the law requires it.
      </Text>
      <Text style={styles.heading}>
        Data Security
      </Text>
      <Text style={styles.body}>
        We use encrypted connections, per-user access rules, secure
        device storage for your session and time-limited links for
        paid notes.
      </Text>
      <Text style={styles.heading}>
        Children
      </Text>
      <Text style={styles.body}>
        MedVeda is for students of degree-level AYUSH courses and is
        not directed at children. If you are under 18, please use the
        app only with the consent and supervision of a parent or
        guardian.
      </Text>
      <Text style={styles.heading}>
        Data Retention
      </Text>
      <Text style={styles.body}>
        Account data is kept while your account is active. After you
        delete your account, personal data is erased within 30 days,
        except payment, invoice and tax records, which we must keep
        for up to 8 years under Indian tax and accounting laws.
        Crash reports and usage data are kept for up to 12 months,
        then deleted or kept only in anonymised, aggregated form.
      </Text>
      <Text style={styles.heading}>
        Your Rights
      </Text>
      <Text style={styles.body}>
        You may ask for a summary of your data, correction of
        inaccurate data, erasure, withdrawal of consent, or to
        nominate someone to act for you. Email us from your
        registered address and we will respond within 30 days.
      </Text>
      <Text style={styles.heading}>
        Delete Your Account
      </Text>
      <Text style={styles.body}>
        Go to Settings → Delete Account in the app, or see the
        steps online.
      </Text>
      <WebLink label="Account & data deletion help" url={WEB.deleteAccount} />
      <Text style={styles.heading}>
        Grievance Officer
      </Text>
      <Text style={styles.body}>
        Name: {LEGAL.grievanceOfficer}{"\n"}
        Email: {LEGAL.email}{"\n"}
        Phone: {LEGAL.phoneDisplay}{"\n"}
        Address: {LEGAL.address}{"\n\n"}
        We acknowledge complaints {LEGAL.grievanceAck} and resolve
        them {LEGAL.grievanceResolution}.
      </Text>
      <Text style={styles.footer}>
        Effective date: {LEGAL.effectiveDate}
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
