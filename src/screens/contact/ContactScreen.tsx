import React from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";

import SettingsItem from "../../components/SettingsItem";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

export default function ContactScreen() {

  const openLink = async (url: string) => {
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      Linking.openURL(url);
    } else {
      Alert.alert("Error", "Unable to open link.");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>
        📞 Contact Us
      </Text>

      <Text style={styles.subtitle}>
        We'd love to hear from you.
      </Text>

      <SettingsItem
        icon="📧"
        title="Email"
        onPress={() =>
          openLink(
            "mailto:support@ayurpulse.in"
          )
        }
      />

      <SettingsItem
        icon="🌐"
        title="Website"
        onPress={() =>
          openLink(
            "https://www.ayurpulse.in"
          )
        }
      />

      <SettingsItem
        icon="📱"
        title="WhatsApp"
        onPress={() =>
          openLink(
            "https://wa.me/919999999999"
          )
        }
      />

      <SettingsItem
        icon="📸"
        title="Instagram"
        onPress={() =>
          openLink(
            "https://instagram.com/ayurpulse"
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

  content: {
    padding: SPACING.lg,
    paddingTop: 60,
  },

  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },

  subtitle: {
    marginTop: 6,
    marginBottom: SPACING.xl,
    color: COLORS.subtitle,
    fontSize: FONT.body,
  },
});