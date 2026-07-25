import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { useRoute, useNavigation, CommonActions } from "@react-navigation/native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

// Reached via normal in-app navigation - either from
// PaymentCheckoutScreen (Razorpay reported a failure, or verify-payment
// rejected the payment) or from usePurchase.ts (checkout couldn't be
// started at all). Used to be reached via a medveda://payment-failed
// deep link from an external browser page; see PaymentSuccessScreen.tsx
// for why that page never actually worked.
export default function PaymentFailedScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { title, reason } = route.params ?? {};

  function goTo(screenName: string) {
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [{ name: "Home" }, { name: screenName }],
      })
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Text style={styles.icon}>❌</Text>
      </View>

      <Text style={styles.title}>Payment Failed</Text>
      <Text style={styles.subtitle}>
        {title
          ? `Your payment for "${title}" could not be completed.`
          : "Your payment could not be completed."}
      </Text>

      {reason && (
        <View style={styles.reasonCard}>
          <Text style={styles.reasonLabel}>Reason</Text>
          <Text style={styles.reasonText}>{reason}</Text>
        </View>
      )}

      <Text style={styles.note}>
        No amount has been charged if the payment didn't go through. You can
        try again anytime from the Store.
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.85}
        onPress={() => goTo("Store")}
      >
        <Text style={styles.primaryButtonText}>Try Again</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        activeOpacity={0.85}
        onPress={() => goTo("Contact")}
      >
        <Text style={styles.secondaryButtonText}>Contact Support</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },

  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${COLORS.error}1F`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },

  icon: {
    fontSize: 52,
  },

  title: {
    fontSize: FONT.heading,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },

  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    textAlign: "center",
    marginTop: SPACING.sm,
  },

  reasonCard: {
    width: "100%",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
    ...SHADOW.card,
  },

  reasonLabel: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginBottom: 4,
  },

  reasonText: {
    fontSize: FONT.small,
    color: COLORS.text,
    fontWeight: "600",
  },

  note: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    textAlign: "center",
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
    lineHeight: 18,
  },

  primaryButton: {
    width: "100%",
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    alignItems: "center",
    marginBottom: SPACING.md,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT.body,
    fontWeight: "700",
  },

  secondaryButton: {
    width: "100%",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },

  secondaryButtonText: {
    color: COLORS.text,
    fontSize: FONT.body,
    fontWeight: "700",
  },
});
