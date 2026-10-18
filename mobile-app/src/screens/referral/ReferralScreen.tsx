import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Share, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";

import CustomButton from "../../components/CustomButton";
import EmptyState from "../../components/EmptyState";
import ErrorState from "../../components/ErrorState";

import { getCurrentUser } from "../../services/authState";
import { fetchUserProfile } from "../../services/usersService";
import {
  fetchMyReferralList,
  fetchMyWallet,
  fetchReferralSettings,
  formatRupees,
  walletProductsText,
  ReferralListItem,
  ReferralListStatus,
  ReferralSettings,
  WalletSummary,
} from "../../services/referralsService";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { RADIUS } from "../../theme/radius";
import { SPACING } from "../../theme/spacing";
import { logError } from "../../utils/logger";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=in.medveda.app";

const STATUS_LABEL: Record<ReferralListStatus, string> = {
  joined: "Joined",
  purchased_pending: "Purchased – pending",
  credited: "Credited",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<ReferralListStatus, string> = {
  joined: COLORS.info,
  purchased_pending: COLORS.warning,
  credited: COLORS.success,
  cancelled: COLORS.error,
};

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// "<percent>% off (up to ₹<cap>)", or just "<percent>% off" when the admin has set no cap.
function friendOfferText(s: ReferralSettings): string {
  const cap = s.friendDiscountMax != null ? ` (up to ${formatRupees(s.friendDiscountMax)})` : "";
  return `${s.friendDiscountPercent}% off${cap}`;
}

export default function ReferralScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [code, setCode] = useState("");
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [history, setHistory] = useState<ReferralListItem[]>([]);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const user = getCurrentUser();
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [s, profile] = await Promise.all([fetchReferralSettings(), fetchUserProfile(user.id)]);
      setSettings(s);
      setCode(profile?.referralCode ?? "");
      // Wallet + list are read even if the program was just switched off, so
      // existing balances stay visible.
      const [w, list] = await Promise.all([fetchMyWallet(), fetchMyReferralList()]);
      setWallet(w);
      setHistory(list);
    } catch (err) {
      logError("Failed to load referrals:", err);
      setError("Could not load your referral details. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logError("Copy failed:", err);
      Alert.alert("Could not copy", "Please long-press the code or use Share instead.");
    }
  };

  const shareCode = async () => {
    if (!settings) return;
    try {
      await Share.share({
        message:
          `Join me on MedVeda - the study app for Ayurveda students.\n\n` +
          `Sign up with my referral code ${code} and get ${friendOfferText(settings)} on your first purchase.\n\n` +
          PLAY_STORE_URL,
      });
    } catch (err) {
      logError("Share failed:", err);
    }
  };

  if (loading && !settings) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ErrorState message={error} onRetry={load} />
      </View>
    );
  }

  const hasBalance = !!wallet && (wallet.available > 0 || wallet.pending > 0 || wallet.totalEarned > 0);

  if (!settings?.enabled && !hasBalance && history.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Refer & Earn</Text>
        <EmptyState title="The referral program isn't available right now." />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {settings?.enabled && (
        <>
          {/* 1. Header */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Invite friends, earn {formatRupees(settings.referrerCreditAmount)}</Text>
            <Text style={styles.heroSub}>Your friend gets {friendOfferText(settings)}</Text>
          </View>

          {/* 2. Code */}
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Your referral code</Text>
            <Text style={styles.code} selectable>
              {code || "—"}
            </Text>
            <View style={styles.actions}>
              <View style={styles.action}>
                <CustomButton title={copied ? "Copied ✓" : "Copy"} onPress={copyCode} disabled={!code} />
              </View>
              <View style={styles.action}>
                <CustomButton title="Share" onPress={shareCode} disabled={!code} />
              </View>
            </View>
          </View>
        </>
      )}

      {/* 3. Wallet */}
      <Text style={styles.sectionTitle}>Your wallet</Text>
      <View style={styles.walletCard}>
        <Text style={styles.walletLabel}>Available balance</Text>
        <Text style={styles.walletBalance}>{formatRupees(wallet?.available ?? 0)}</Text>
        <View style={styles.walletStats}>
          <View style={styles.walletStat}>
            <Text style={styles.statValue}>{formatRupees(wallet?.pending ?? 0)}</Text>
            <Text style={styles.statLabel}>Pending</Text>
            <Text style={styles.statNote}>
              {settings?.enabled ? `available after ${settings.creditHoldDays} days` : ""}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.walletStat}>
            <Text style={styles.statValue}>{formatRupees(wallet?.totalEarned ?? 0)}</Text>
            <Text style={styles.statLabel}>Total earned</Text>
          </View>
        </View>
        {settings?.enabled && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              Usable on {walletProductsText(settings.walletProductTypes)} purchases only, up to{" "}
              {settings.walletMaxPercent}% of the price
            </Text>
          </View>
        )}
      </View>

      {/* 4. How it works */}
      {settings?.enabled && (
        <>
          <Text style={styles.sectionTitle}>How it works</Text>
          <View style={styles.card}>
            <Step n={1} text="Share your code with a friend." />
            <Step
              n={2}
              text={`They sign up with it and get ${friendOfferText(settings)} on their first purchase.`}
            />
            <Step
              n={3}
              text={`You get ${formatRupees(settings.referrerCreditAmount)} after their first payment (available after ${settings.creditHoldDays} days).`}
              last
            />
          </View>
        </>
      )}

      {/* 5. List */}
      <Text style={styles.sectionTitle}>Your referrals</Text>
      {history.length === 0 ? (
        <EmptyState title="No referrals yet. Share your code to get started." />
      ) : (
        history.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.friendName}</Text>
              <Text style={styles.rowDate}>Joined {formatDate(item.joinedAt)}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowStatus, { color: STATUS_COLOR[item.status] ?? COLORS.subtitle }]}>
                {STATUS_LABEL[item.status] ?? item.status}
              </Text>
              {item.amount != null && item.status !== "joined" && (
                <Text style={[styles.rowAmount, item.status === "cancelled" && styles.strike]}>
                  {formatRupees(item.amount)}
                </Text>
              )}
            </View>
          </View>
        ))
      )}

      {/* 6. Terms */}
      <TouchableOpacity onPress={() => navigation.navigate("ReferralTerms")} style={styles.termsLink}>
        <Text style={styles.termsText}>Referral terms & conditions</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Step({ n, text, last }: { n: number; text: string; last?: boolean }) {
  return (
    <View style={[styles.step, !last && styles.stepGap]}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg, paddingTop: 60 },
  center: { justifyContent: "center", alignItems: "center" },
  content: { paddingBottom: SPACING.xl },
  title: { fontSize: FONT.title, fontWeight: "bold", color: COLORS.text, marginBottom: SPACING.md },

  hero: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  heroTitle: { color: COLORS.textOnPrimary, fontSize: FONT.title - 4, fontWeight: "bold" },
  heroSub: { color: COLORS.textOnPrimary, opacity: 0.85, fontSize: FONT.body, marginTop: 6 },

  codeCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  codeLabel: { color: COLORS.subtitle, fontSize: FONT.small },
  code: {
    color: COLORS.accent,
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: 4,
    marginVertical: SPACING.md,
  },
  actions: { flexDirection: "row", gap: SPACING.md, alignSelf: "stretch" },
  action: { flex: 1 },

  sectionTitle: { color: COLORS.text, fontSize: FONT.body, fontWeight: "700", marginBottom: SPACING.sm, marginTop: SPACING.sm },

  walletCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  walletLabel: { color: COLORS.subtitle, fontSize: FONT.small },
  walletBalance: { color: COLORS.text, fontSize: 34, fontWeight: "bold", marginVertical: 4 },
  walletStats: { flexDirection: "row", marginTop: SPACING.md },
  walletStat: { flex: 1 },
  statDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  statValue: { color: COLORS.text, fontSize: FONT.body + 2, fontWeight: "700" },
  statLabel: { color: COLORS.subtitle, fontSize: FONT.small },
  statNote: { color: COLORS.subtitle, fontSize: FONT.small - 2, marginTop: 2 },
  badge: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  badgeText: { color: COLORS.accentLight, fontSize: FONT.small, fontWeight: "600" },

  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  step: { flexDirection: "row", alignItems: "flex-start" },
  stepGap: { marginBottom: SPACING.md },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  stepNumText: { color: COLORS.textOnPrimary, fontWeight: "700", fontSize: FONT.small },
  stepText: { flex: 1, color: COLORS.text, fontSize: FONT.body },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowName: { color: COLORS.text, fontSize: FONT.body, fontWeight: "600" },
  rowDate: { color: COLORS.subtitle, fontSize: FONT.small, marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  rowStatus: { fontSize: FONT.small, fontWeight: "700" },
  rowAmount: { color: COLORS.text, fontSize: FONT.small, marginTop: 2 },
  strike: { textDecorationLine: "line-through", color: COLORS.subtitle },

  termsLink: { alignItems: "center", paddingVertical: SPACING.lg },
  termsText: { color: COLORS.accent, fontSize: FONT.small, textDecorationLine: "underline" },
});
