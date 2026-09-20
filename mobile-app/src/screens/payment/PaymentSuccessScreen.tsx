import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { useRoute, useNavigation, CommonActions } from "@react-navigation/native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

// Reached via normal in-app navigation from PaymentCheckoutScreen once
// verify-payment confirms a successful payment (see usePurchase.ts and
// paymentService.ts). Used to be reached via a medveda://payment-success
// deep link from an external browser page - that page's script never
// actually ran (see paymentService.ts's purchaseProduct comment for why),
// so this screen was effectively unreachable before.
export default function PaymentSuccessScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { title, amount, orderId } = route.params ?? {};

  function goTo(screenName: string) {
    // Deep links can land here as the only screen on the stack (cold
    // start) - reset instead of navigate so the back button always makes
    // sense afterwards (Home underneath, not back into the browser flow).
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
        <Text style={styles.icon}>✅</Text>
      </View>

      <Text style={styles.title}>Payment Successful!</Text>
      <Text style={styles.subtitle}>
        {title ? `"${title}" is now unlocked.` : "Your purchase is now unlocked."}
      </Text>

      {(amount || orderId) && (
        <View style={styles.detailsCard}>
          {title && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Package</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{title}</Text>
            </View>
          )}
          {amount && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount Paid</Text>
              <Text style={styles.detailValue}>₹{amount}</Text>
            </View>
          )}
          {orderId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Order ID</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{orderId}</Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.85}
        onPress={() => goTo("MyPurchases")}
      >
        <Text style={styles.primaryButtonText}>View My Purchases</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        activeOpacity={0.85}
        onPress={() => goTo("Home")}
      >
        <Text style={styles.secondaryButtonText}>Continue Learning</Text>
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
    backgroundColor: `${COLORS.success}1F`,
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
    marginBottom: SPACING.xl,
  },

  detailsCard: {
    width: "100%",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    ...SHADOW.card,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.xs,
  },

  detailLabel: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
  },

  detailValue: {
    fontSize: FONT.small,
    color: COLORS.text,
    fontWeight: "700",
    maxWidth: "60%",
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


