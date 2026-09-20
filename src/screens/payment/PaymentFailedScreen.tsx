import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, AppState } from "react-native";

import { useRoute, useNavigation, useFocusEffect, CommonActions } from "@react-navigation/native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";
import { recoverPayment } from "../../services/paymentService";

// Reached via normal in-app navigation - either from
// PaymentCheckoutScreen (Razorpay reported a failure, or verify-payment
// rejected the payment) or from usePurchase.ts (checkout couldn't be
// started at all). Used to be reached via a medveda://payment-failed
// deep link from an external browser page; see PaymentSuccessScreen.tsx
// for why that page never actually worked.
//
// PENDING/CONFIRMING MODE: when PaymentCheckoutScreen couldn't get a
// definite verdict in time (verify-payment call dropped, e.g. from the
// WebView being backgrounded for a UPI app switch, and the ~24s recovery
// window ran out before Razorpay's autocapture actually finished), it
// routes here with `pending: true` instead of a hard failure - the
// payment genuinely might still be going through, so this screen keeps
// checking in the background (on an interval, and every time the app
// comes back to the foreground) and auto-redirects to PaymentSuccess the
// instant verify-payment's recovery path confirms it. This is what stops
// "payment actually succeeded, webhook granted it, but the app still
// shows a failure" - the old code gave up after 24s with no way to ever
// find out it was wrong.
const POLL_INTERVAL_MS = 8000;
const MAX_POLL_MINUTES = 10;

export default function PaymentFailedScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { title, reason, pending, verifyUrl, internalOrderId, paymentId } = route.params ?? {};

  const [stillConfirming, setStillConfirming] = useState(!!pending);
  const resolvedRef = useRef(false);
  const pollCountRef = useRef(0);

  function goTo(screenName: string) {
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [{ name: "Home" }, { name: screenName }],
      })
    );
  }

  const checkStatus = useCallback(async () => {
    if (resolvedRef.current || !pending || !verifyUrl || !internalOrderId) return;
    // Give up quietly after MAX_POLL_MINUTES - the student can still see
    // it unlock on its own via My Purchases, or reach out to support with
    // the Payment ID shown below.
    if (pollCountRef.current * (POLL_INTERVAL_MS / 1000) > MAX_POLL_MINUTES * 60) return;
    pollCountRef.current += 1;
    try {
      const result = await recoverPayment(verifyUrl, internalOrderId);
      if (result.success && !resolvedRef.current) {
        resolvedRef.current = true;
        navigation.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: "Home" },
              {
                name: "PaymentSuccess",
                params: { title, amount: result.amount, orderId: internalOrderId },
              },
            ],
          })
        );
      }
    } catch {
      // Transient - the next interval tick or app-resume will try again.
    }
  }, [pending, verifyUrl, internalOrderId, title, navigation]);

  // Poll on an interval while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      if (!pending) return;
      checkStatus();
      const interval = setInterval(checkStatus, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [pending, checkStatus])
  );

  // Also re-check immediately whenever the app comes back to the
  // foreground (e.g. student switched away and back), rather than waiting
  // for the next interval tick.
  useEffect(() => {
    if (!pending) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkStatus();
    });
    return () => sub.remove();
  }, [pending, checkStatus]);

  if (stillConfirming) {
    return (
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: `${COLORS.warning}1F` }]}>
          <Text style={styles.icon}>⏳</Text>
        </View>

        <Text style={styles.title}>Confirming Your Payment</Text>
        <Text style={styles.subtitle}>
          {title
            ? `We're still confirming your payment for "${title}". If money was deducted, it will unlock automatically - usually within a few minutes.`
            : "We're still confirming your payment. If money was deducted, it will unlock automatically - usually within a few minutes."}
        </Text>

        <View style={styles.reasonCard}>
          <Text style={styles.reasonLabel}>Details</Text>
          <Text style={styles.reasonText}>
            Payment may have succeeded but verification could not be confirmed yet
            {paymentId ? `. Payment ID: ${paymentId}` : "."}
          </Text>
        </View>

        <Text style={styles.note}>
          No need to pay again. Check My Purchases in a few minutes - if it's
          still locked after {MAX_POLL_MINUTES} minutes, contact support with
          the Payment ID above.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={() => {
            resolvedRef.current = true;
            goTo("MyPurchases");
          }}
        >
          <Text style={styles.primaryButtonText}>Check My Purchases</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={() => {
            resolvedRef.current = true;
            goTo("Contact");
          }}
        >
          <Text style={styles.secondaryButtonText}>Contact Support</Text>
        </TouchableOpacity>
      </View>
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
