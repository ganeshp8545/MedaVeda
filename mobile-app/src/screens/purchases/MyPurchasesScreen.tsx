import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";

import { useFocusEffect } from "@react-navigation/native";

import EmptyState from "../../components/EmptyState";
import ErrorState from "../../components/ErrorState";
import BottomNav from "../../components/BottomNav";

import { fetchMyPurchases, MyPurchase } from "../../services/purchasesService";
import { ProductScope } from "../../services/productsService";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

// SRS Part 4, section 4 - Orders & Purchase History:
// Order ID, Package Name, Amount, Payment Date, Payment Status.
// (Download Invoice is explicitly listed there as a future item.)

const SCOPE_LABEL: Record<ProductScope, string> = {
  chapter: "Chapter Pack",
  subject: "Subject Pack",
  year: "Year Pack",
  bundle: "Lifetime / Multi-Year Bundle",
};

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  success: { label: "✅ Paid", color: COLORS.success },
  paid: { label: "✅ Paid", color: COLORS.success },
  completed: { label: "✅ Paid", color: COLORS.success },
  pending: { label: "⏳ Pending", color: COLORS.warning },
  failed: { label: "❌ Failed", color: COLORS.error },
};

function statusFor(status?: string) {
  if (!status) return STATUS_STYLE.success; // existing purchase docs predate the status field
  return STATUS_STYLE[status.toLowerCase()] ?? STATUS_STYLE.success;
}

function formatDate(ms?: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function MyPurchasesScreen() {
  const [purchases, setPurchases] = useState<MyPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchMyPurchases()
      .then(setPurchases)
      .catch((err) => {
        console.error("Failed to load purchase history:", err);
        setError("Could not load your purchase history. Please try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Refresh every time the screen is focused, so a purchase made just now
  // (via the external Razorpay checkout page) shows up on return.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>My Purchases</Text>
        <Text style={styles.subtitle}>Your order & payment history</Text>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.accent}
            style={styles.loader}
          />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <FlatList
            data={purchases}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
            renderItem={({ item }) => {
              const status = statusFor(item.status);

              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>

                    {typeof item.amount === "number" && (
                      <Text style={styles.amount}>₹{item.amount}</Text>
                    )}
                  </View>

                  <Text style={styles.cardScope}>
                    {SCOPE_LABEL[item.scope] ?? item.scope}
                  </Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.orderId} numberOfLines={1}>
                      Order ID: {item.orderId ?? item.id}
                    </Text>
                    <Text style={styles.date}>{formatDate(item.purchasedAt)}</Text>
                  </View>

                  <Text style={[styles.statusBadge, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <EmptyState title="🧾 No purchases yet. Buy a chapter, subject, or year pack from the Store to see it here." />
            }
          />
        )}
      </View>

      <BottomNav active="MyPurchases" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    paddingTop: 60,
  },

  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },

  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginTop: 6,
    marginBottom: SPACING.lg,
  },

  loader: {
    marginTop: 40,
  },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  cardTitle: {
    flex: 1,
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
    paddingRight: SPACING.sm,
  },

  amount: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.accent,
  },

  cardScope: {
    marginTop: 4,
    fontSize: FONT.small,
    color: COLORS.subtitle,
  },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.sm,
  },

  orderId: {
    flex: 1,
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    paddingRight: SPACING.sm,
  },

  date: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
  },

  statusBadge: {
    marginTop: SPACING.xs,
    fontSize: FONT.small,
    fontWeight: "700",
  },
});
