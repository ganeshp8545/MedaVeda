import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";

import { useRoute, useNavigation, CommonActions } from "@react-navigation/native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";
import { supabase } from "../../config/supabase";

type ConfirmedPurchase = { title: string; amount: number; orderId: string };

export default function PaymentSuccessScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const orderId = typeof route.params?.orderId === "string" ? route.params.orderId : "";
  const [confirmed, setConfirmed] = useState<ConfirmedPurchase | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    setChecking(true);
    setConfirmed(null);
    void (async () => {
      try {
        if (!/^[0-9a-f-]{36}$/i.test(orderId)) return;
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) return;
        const { data: order, error: orderError } = await supabase.from("orders")
          .select("id,user_id,status,amount").eq("id", orderId).eq("user_id", auth.user.id).maybeSingle();
        if (orderError || order?.status !== "paid") return;
        const { data: purchase, error: purchaseError } = await supabase.from("purchases")
          .select("product_title,amount").eq("order_id", orderId).eq("user_id", auth.user.id)
          .eq("status", "success").maybeSingle();
        if (purchaseError || !purchase || Number(purchase.amount) !== Number(order.amount)) return;
        if (mounted) setConfirmed({ title: purchase.product_title || "Your content",
          amount: Number(order.amount), orderId });
      } catch {
        // A network failure must not turn route parameters into success.
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [orderId]);

  function goTo(screenName: string) {
    // Reset to a stable destination after viewing the purchase status.
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [{ name: "Home" }, { name: screenName }],
      })
    );
  }

  return (
    <View style={styles.container}>
      {checking ? <ActivityIndicator color={COLORS.accent} /> : (
        <Text style={styles.title}>{confirmed ? "Payment Successful!" : "Purchase not confirmed"}</Text>
      )}
      <Text style={styles.subtitle}>
        {checking ? "Checking your purchase…" : confirmed
          ? `"${confirmed.title}" is now unlocked.`
          : "We could not confirm access for this order. Check My Purchases or contact support."}
      </Text>

      {confirmed && (
        <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Package</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{confirmed.title}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount Paid</Text>
              <Text style={styles.detailValue}>₹{confirmed.amount}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Order ID</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{confirmed.orderId}</Text>
            </View>
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


