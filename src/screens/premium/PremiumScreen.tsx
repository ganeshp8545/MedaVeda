import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";

import PremiumCard from "../../components/PremiumCard";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

import LockCard from "../../components/LockCard";
import usePremium from "../../hooks/usePremium";
import { useNavigation } from "@react-navigation/native";

export default function PremiumScreen() {
    const { isPremium } = usePremium();
    const navigation = useNavigation<any>();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.icon}>👑</Text>

      <Text style={styles.title}>
        AyurPulse Premium
      </Text>

      <Text style={styles.subtitle}>
        Unlock all premium study resources.
      </Text>

      <View style={styles.features}>
        <Text style={styles.feature}>✅ Unlimited Notes</Text>
        <Text style={styles.feature}>✅ Unlimited Videos</Text>
        <Text style={styles.feature}>✅ Unlimited MCQ Quiz</Text>
        <Text style={styles.feature}>✅ Previous Year Papers</Text>
        <Text style={styles.feature}>✅ Mock Tests</Text>
        <Text style={styles.feature}>✅ AI Assistant (Coming Soon)</Text>
        <Text style={styles.feature}>✅ Offline PDF (Coming Soon)</Text>
      </View>

      <Text style={styles.sectionTitle}>
  Premium Features
</Text>

        <LockCard
        title="Previous Year Papers"
        subtitle="Unlock with Premium"
        onPress={() => {
            if (!isPremium) {
            navigation.navigate("Upgrade");
      return;
    }

    Alert.alert(
      "Success ✅",
      "Opening Previous Year Papers..."
    );
    }}
    />

        <LockCard
  title="Mock Test Series"
  subtitle="Unlock with Premium"
  onPress={() => {
    if (!isPremium) {
      Alert.alert(
        "Premium Required 👑",
        "Upgrade to Premium to access Mock Tests."
      );
      return;
    }

    Alert.alert(
      "Success ✅",
      "Opening Mock Tests..."
    );
  }}
/>

        <LockCard
  title="AI Assistant"
  subtitle="Coming Soon"
  onPress={() => {
    if (!isPremium) {
      Alert.alert(
        "Premium Required 👑",
        "Upgrade to Premium to use AI Assistant."
      );
      return;
    }

    Alert.alert(
      "Coming Soon 🚀",
      "AI Assistant module is under development."
    );
  }}
/>

      <PremiumCard
        title="Monthly"
        price="₹99"
        subtitle="1 Month Access"
        onPress={() =>
          Alert.alert(
            "Coming Soon",
            "Payment Gateway will be added soon."
          )
        }
      />

      <PremiumCard
        title="3 Months"
        price="₹199"
        subtitle="Most Popular"
        popular
        onPress={() =>
          Alert.alert(
            "Coming Soon",
            "Payment Gateway will be added soon."
          )
        }
      />

      <PremiumCard
        title="Yearly"
        price="₹499"
        subtitle="Best Value"
        onPress={() =>
          Alert.alert(
            "Coming Soon",
            "Payment Gateway will be added soon."
          )
        }
      />

      <PremiumCard
        title="Lifetime"
        price="₹999"
        subtitle="One Time Payment"
        onPress={() =>
          Alert.alert(
            "Coming Soon",
            "Payment Gateway will be added soon."
          )
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  sectionTitle: {
  fontSize: FONT.heading,
  fontWeight: "700",
  color: COLORS.primary,
  marginBottom: SPACING.md,
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
    marginBottom: 30,
    marginTop: 10,
  },

  features: {
    marginBottom: 30,
  },

  feature: {
    fontSize: FONT.body,
    color: COLORS.text,
    marginBottom: 10,
  },
});