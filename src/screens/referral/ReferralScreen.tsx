import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Share, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";

import CustomButton from "../../components/CustomButton";
import EmptyState from "../../components/EmptyState";
import ErrorState from "../../components/ErrorState";

import { getCurrentUser } from "../../services/authState";
import { fetchUserProfile } from "../../services/usersService";
import {
  fetchMyReferrals,
  fetchReferralSettings,
  ReferralHistoryItem,
  ReferralSettings,
} from "../../services/referralsService";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { RADIUS } from "../../theme/radius";
import { SPACING } from "../../theme/spacing";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.ayurpulse.app";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  qualified: "Qualified",
  rewarded: "Rewarded",
  rejected: "Not eligible",
};

const STATUS_COLOR: Record<string, string> = {
  pending: COLORS.warning,
  qualified: COLORS.info,
  rewarded: COLORS.success,
  rejected: COLORS.error,
};

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReferralScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [code, setCode] = useState("");
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
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
      if (s?.enabled) setHistory(await fetchMyReferrals());
    } catch (err) {
      console.error("Failed to load referrals:", err);
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
      console.error("Copy failed:", err);
      Alert.alert("Could not copy", "Please long-press the code or use Share instead.");
    }
  };

  const shareCode = async () => {
    try {
      await Share.share({
        message: `Join me on MedVeda - the study app for Ayurveda students.\n\nUse my referral code ${code} when you sign up.\n\n${PLAY_STORE_URL}`,
      });
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  if (loading) {
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

  if (!settings?.enabled) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Refer & Earn</Text>
        <EmptyState title="The referral program isn't available right now." />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Refer & Earn</Text>
      <Text style={styles.subtitle}>
        Share your code with friends. They enter it when they sign up.{" "}
        {settings.qualifyOn === "first_purchase"
          ? "A referral counts once your friend makes their first purchase."
          : "A referral counts once your friend signs up with your code."}
      </Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Your referral code</Text>
        <Text style={styles.code} selectable>
          {code || "—"}
        </Text>
        <View style={styles.actions}>
          <View style={styles.action}>
            <CustomButton title={copied ? "Copied ✓" : "Copy"} onPress={copyCode} />
          </View>
          <View style={styles.action}>
            <CustomButton title="Share" onPress={shareCode} />
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Your referrals</Text>
      {history.length === 0 ? (
        <EmptyState title="No referrals yet. Share your code to get started." />
      ) : (
        history.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.referredName || "A friend"}</Text>
              <Text style={styles.rowDate}>{formatDate(item.createdAt)}</Text>
            </View>
            <Text style={[styles.rowStatus, { color: STATUS_COLOR[item.status] ?? COLORS.subtitle }]}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg, paddingTop: 60 },
  center: { justifyContent: "center", alignItems: "center" },
  content: { paddingBottom: SPACING.xl },
  title: { fontSize: FONT.title, fontWeight: "bold", color: COLORS.text },
  subtitle: { fontSize: FONT.body, color: COLORS.subtitle, marginTop: 4, marginBottom: SPACING.lg },
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
  sectionTitle: { color: COLORS.text, fontSize: FONT.body, fontWeight: "700", marginBottom: SPACING.sm },
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
  rowStatus: { fontSize: FONT.small, fontWeight: "700" },
});
