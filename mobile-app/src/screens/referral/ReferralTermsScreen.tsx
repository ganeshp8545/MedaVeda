import React, { useEffect, useState } from "react";
import { ScrollView, Text, StyleSheet, ActivityIndicator, Linking, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { fetchReferralSettings, formatRupees, walletProductsText, ReferralSettings } from "../../services/referralsService";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

// Every number below is read from referral_settings (fetched fresh each time this
// screen opens) so these terms can never drift from what the server applies. If the admin sets a terms_url,
// that page is opened instead.
export default function ReferralTermsScreen() {
  const navigation = useNavigation<any>();
  const [s, setS] = useState<ReferralSettings | null>(null);

  useEffect(() => {
    fetchReferralSettings()
      .then(async (settings) => {
        if (settings?.termsUrl) {
          try {
            await Linking.openURL(settings.termsUrl);
            navigation.goBack();
            return;
          } catch {
            // fall through to the built-in terms
          }
        }
        setS(settings);
      })
      .catch(() => setS(null));
  }, [navigation]);

  if (!s) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const cap = s.friendDiscountMax != null ? `, up to ${formatRupees(s.friendDiscountMax)},` : "";
  const items = [
    `A referral code can be used only once, when a new user signs up. It cannot be added later, and you cannot use your own code.`,
    `The friend gets ${s.friendDiscountPercent}% off${cap} on their first purchase. The discount is calculated on the selling price shown in the app.`,
    `You get ${formatRupees(s.referrerCreditAmount)} of referral balance after your friend's first successful payment. One reward per friend.`,
    `Rewards are held for ${s.creditHoldDays} days and then become available. If your friend's payment is refunded during that time, the reward is cancelled.`,
    `Referral balance can be used on ${walletProductsText(s.walletProductTypes)} purchases only, and pays up to ${s.walletMaxPercent}% of an order's price. The rest is paid normally.`,
    `Referral balance has no cash value and cannot be withdrawn or transferred.${s.creditExpiryDays ? ` It expires ${s.creditExpiryDays} days after it becomes available.` : ""}`,
    `Accounts found abusing the program (fake accounts, self-referrals) may lose rewards or be suspended. MedVeda may change or end the program at any time; balance already earned is not affected.`,
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
      <Text style={styles.title}>Referral terms</Text>
      {items.map((t, i) => (
        <Text key={i} style={styles.body}>
          {i + 1}. {t}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg, paddingTop: 60 },
  title: { fontSize: FONT.title, fontWeight: "bold", color: COLORS.text, marginBottom: SPACING.md },
  body: { color: COLORS.subtitle, fontSize: FONT.body, marginBottom: SPACING.md, lineHeight: 22 },
});
