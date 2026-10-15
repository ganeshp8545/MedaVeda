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
        Welcome to MedVeda, an educational platform for AYUSH students
        offering notes, video lectures and practice tests. By creating
        an account or using the app you agree to these Terms & Conditions
        and our Privacy Policy. This is a summary; the full terms are
        on our website.
      </Text>
      <WebLink label="Read full terms" url={WEB.terms} />

      <Text style={styles.heading}>
        1. Eligibility and Account
      </Text>
      <Text style={styles.body}>
        You must be able to enter a contract in India, or use the app
        with the consent and supervision of a parent or guardian.
        You are responsible for your login details and all activity
        on your account. One person, one account.
      </Text>
      <Text style={styles.heading}>
        2. Educational Purpose
      </Text>
      <Text style={styles.body}>
        Content is for study only and is not medical advice, diagnosis
        or treatment. MedVeda is an independent educational platform
        and is not affiliated with the Ministry of AYUSH, NCISM, NCH,
        any university, college or government body.
      </Text>
      <Text style={styles.heading}>
        3. Purchases
      </Text>
      <Text style={styles.body}>
        Video lectures and MCQ tests are free. PDF notes are sold as
        paid packages. All prices are in Indian Rupees (INR) and are
        inclusive of applicable taxes, if any. Payments are processed
        through Google Play Billing or, where Google Play offers the
        choice, through Razorpay. The payment method, final price and
        applicable terms are shown before you pay. Referral discounts
        and wallet credit apply only to eligible Razorpay purchases;
        Google Play purchases use the price shown by Google Play.{"\n\n"}
        Purchased content has no fixed expiry. Access continues for as
        long as your account is active and the content is offered on
        the platform.
      </Text>
      <Text style={styles.heading}>
        4. Refunds and Cancellation
      </Text>
      <Text style={styles.body}>
        For Razorpay purchases, because content is digital and unlocked
        instantly, purchases are generally non-refundable once
        unlocked, except:{"\n"}
        (a) payment deducted but content not unlocked within 24 hours;{"\n"}
        (b) duplicate or multiple payments for the same purchase;{"\n"}
        (c) a technical fault on our side that prevents access and
        that we cannot fix within 7 days.{"\n\n"}
        Raise Razorpay refund requests within 7 days of payment. We
        reply within 48 hours; approved refunds normally reach the
        original payment method in 5–7 working days. For Google Play
        purchases, Google Play processes billing and refunds under its
        applicable policies. Contact us if paid notes do not unlock.
      </Text>
      <WebLink label="Read refund policy" url={WEB.refund} />
      <Text style={styles.heading}>
        5. Intellectual Property
      </Text>
      <Text style={styles.body}>
        All notes, videos, tests and app content belong to MedVeda or
        its licensors. You may not copy, share, resell, upload or
        redistribute content, or screenshot or record paid notes.
      </Text>
      <Text style={styles.heading}>
        6. Acceptable Use
      </Text>
      <Text style={styles.body}>
        Do not attempt unauthorised access, reverse engineer or scrape
        the app, share paid content, upload harmful content, misuse
        the referral or payment systems, or break the law.
      </Text>
      <Text style={styles.heading}>
        7. Suspension
      </Text>
      <Text style={styles.body}>
        We may suspend or terminate accounts involved in fraud, misuse,
        piracy or breach of these Terms. You may delete your account
        at any time from Settings → Delete Account.
      </Text>
      <Text style={styles.heading}>
        8. Disclaimer and Liability
      </Text>
      <Text style={styles.body}>
        The app is provided "as is". We do not guarantee that content
        is complete or error-free, or any exam result. To the extent
        permitted by law, our liability for a paid purchase is limited
        to the amount you paid for it.
      </Text>
      <WebLink label="Read disclaimer" url={WEB.disclaimer} />
      <Text style={styles.heading}>
        9. Governing Law
      </Text>
      <Text style={styles.body}>
        These Terms are governed by the laws of India. Courts at
        {LEGAL.jurisdiction} have exclusive jurisdiction, subject to
        any mandatory consumer rights.
      </Text>
      <Text style={styles.heading}>
        10. Updates
      </Text>
      <Text style={styles.body}>
        We may update these Terms. Continued use means you accept the
        updated version.
      </Text>
      <Text style={styles.heading}>
        Contact and Grievance Officer
      </Text>
      <Text style={styles.body}>
        {LEGAL.companyName}, {LEGAL.address}{"\n"}
        Email: {LEGAL.email}{"\n"}
        Phone / WhatsApp: {LEGAL.phoneDisplay}{"\n"}
        Grievance Officer: {LEGAL.grievanceOfficer}{"\n\n"}
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
