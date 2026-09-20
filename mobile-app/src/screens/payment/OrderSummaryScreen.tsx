import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Switch, ActivityIndicator, Alert } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import CustomButton from "../../components/CustomButton";
import ErrorState from "../../components/ErrorState";

import { fetchOrderQuote, formatRupees, OrderQuote } from "../../services/referralsService";
import { purchaseProduct } from "../../services/paymentService";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { RADIUS } from "../../theme/radius";
import { SPACING } from "../../theme/spacing";

// Shown between "Buy" and Razorpay. Every number here comes from the server
// (quote_my_order); the client sends no amounts. The wallet toggle is only
// rendered when the server says this product is wallet-eligible (notes
// products) and there is a balance to use.
export default function OrderSummaryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { productId, productTitle } = route.params ?? {};

  const [useWallet, setUseWallet] = useState(false);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const requestId = useRef(0);

  const loadQuote = useCallback(
    async (wallet: boolean) => {
      const id = ++requestId.current;
      try {
        setLoading(true);
        setError(null);
        const q = await fetchOrderQuote(productId, wallet);
        if (id !== requestId.current) return; // a newer request superseded this one
        if (!q.ok) {
          setError("This product is no longer available.");
          return;
        }
        setQuote(q);
      } catch (err) {
        if (id !== requestId.current) return;
        console.error("quote failed:", err);
        setError("Could not load the price. Please try again.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [productId]
  );

  useEffect(() => {
    loadQuote(false);
  }, [loadQuote]);

  const onToggleWallet = (next: boolean) => {
    setUseWallet(next);
    loadQuote(next);
  };

  const pay = async () => {
    if (paying) return;
    try {
      setPaying(true);
      // Same flag the server just quoted for; the server recomputes everything.
      const checkoutData = await purchaseProduct(productId, useWallet);
      navigation.replace("PaymentCheckout", checkoutData);
    } catch (err: any) {
      Alert.alert("Could Not Start Payment", err?.message || "Please try again.");
      loadQuote(useWallet); // balance / discount may have changed
    } finally {
      setPaying(false);
    }
  };

  if (!productId) {
    return (
      <View style={styles.container}>
        <ErrorState message="Something went wrong." onRetry={() => navigation.goBack()} />
      </View>
    );
  }

  if (error && !quote) {
    return (
      <View style={styles.container}>
        <ErrorState message={error} onRetry={() => loadQuote(useWallet)} />
      </View>
    );
  }

  const showWallet = !!quote?.walletEligible && (quote?.walletAvailable ?? 0) > 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Order summary</Text>
        <Text style={styles.product} numberOfLines={2}>
          {productTitle}
        </Text>

        {!quote ? (
          <ActivityIndicator style={{ marginTop: SPACING.xl }} color={COLORS.accent} />
        ) : (
          <>
            {showWallet && (
              <View style={styles.walletRow}>
                <View style={{ flex: 1, paddingRight: SPACING.md }}>
                  <Text style={styles.walletTitle}>
                    Use referral balance ({formatRupees(quote.walletAvailable)} available)
                  </Text>
                  <Text style={styles.walletNote}>
                    Notes purchases only · up to {formatRupees(quote.walletMaxUsable)} on this order
                  </Text>
                </View>
                <Switch
                  value={useWallet}
                  onValueChange={onToggleWallet}
                  disabled={paying}
                  trackColor={{ true: COLORS.accent, false: COLORS.border }}
                  thumbColor={COLORS.white}
                />
              </View>
            )}

            <View style={[styles.card, loading && { opacity: 0.6 }]}>
              <Line label="Price" value={formatRupees(quote.listPrice)} />
              {quote.referralDiscount > 0 && (
                <Line label="Friend discount" value={`− ${formatRupees(quote.referralDiscount)}`} positive />
              )}
              {useWallet && quote.walletAmount > 0 && (
                <Line label="Referral balance used" value={`− ${formatRupees(quote.walletAmount)}`} positive />
              )}
              <View style={styles.divider} />
              <Line label="Amount payable" value={formatRupees(quote.amount)} bold />
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <CustomButton
          title={paying ? "Please wait…" : quote ? `Pay ${formatRupees(quote.amount)}` : "Pay"}
          onPress={pay}
          disabled={!quote || loading || paying}
        />
      </View>
    </View>
  );
}

function Line({ label, value, positive, bold }: { label: string; value: string; positive?: boolean; bold?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.lineValue, positive && { color: COLORS.success }, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 60 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  title: { fontSize: FONT.title, fontWeight: "bold", color: COLORS.text },
  product: { color: COLORS.subtitle, fontSize: FONT.body, marginTop: 4, marginBottom: SPACING.lg },
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  walletTitle: { color: COLORS.text, fontSize: FONT.body, fontWeight: "600" },
  walletNote: { color: COLORS.subtitle, fontSize: FONT.small, marginTop: 2 },
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  lineLabel: { color: COLORS.subtitle, fontSize: FONT.body },
  lineValue: { color: COLORS.text, fontSize: FONT.body },
  bold: { color: COLORS.text, fontWeight: "700", fontSize: FONT.body + 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  footer: { padding: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border },
});
