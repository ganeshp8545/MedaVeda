import React from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  Alert,
} from "react-native";

import PremiumCard from "../../components/PremiumCard";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

import {
  purchasePlan,
} from "../../services/premiumService";

export default function UpgradeScreen() {

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.icon}>👑</Text>

      <Text style={styles.title}>
        Upgrade to Premium
      </Text>

      <Text style={styles.subtitle}>
        Unlock all Premium Features of AyurPulse
      </Text>

      <PremiumCard
        title="Monthly"
        price="₹99"
        subtitle="1 Month Access"
        onPress={async () => {

          const result = await purchasePlan("MONTHLY");

          Alert.alert(result.message);

        }}
      />

      <PremiumCard
        title="3 Months"
        price="₹199"
        subtitle="Most Popular"
        popular
        onPress={async () => {

          const result = await purchasePlan("THREE_MONTHS");

          Alert.alert(result.message);

        }}
      />

      <PremiumCard
        title="Yearly"
        price="₹499"
        subtitle="Best Value"
        onPress={async () => {

          const result = await purchasePlan("YEARLY");

          Alert.alert(result.message);

        }}
      />

      <PremiumCard
        title="Lifetime"
        price="₹999"
        subtitle="One Time Payment"
        onPress={async () => {

          const result = await purchasePlan("LIFETIME");

          Alert.alert(result.message);

        }}
      />

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
    paddingBottom: 40,
  },

  icon: {
    fontSize: 70,
    textAlign: "center",
    marginTop: 20,
  },

  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.primary,
    textAlign: "center",
    marginTop: 10,
  },

  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    textAlign: "center",
    marginVertical: 20,
  },

});