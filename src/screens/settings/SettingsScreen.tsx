import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  Linking,
} from "react-native";

import { useNavigation } from "@react-navigation/native";

import SettingsItem from "../../components/SettingsItem";
import ConfirmationDialog from "../../components/ConfirmationDialog";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";

import { signOut } from "firebase/auth";
import { auth } from "../../config/firebase";


export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  const handleShare = async () => {
    try {
      await Share.share({
        message:
          "Download AyurPulse - The Ultimate BAMS Study App.\n\nhttps://play.google.com/store/apps/details?id=com.ayurpulse",
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleContact = async () => {
    const url =
      "mailto:support@ayurpulse.in?subject=AyurPulse Support";

    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(
        "Error",
        "No email application found."
      );
    }
  };

  const handleRateApp = async () => {
    const packageName = "com.ayurpulse";

    try {
      await Linking.openURL(
        `market://details?id=${packageName}`
      );
    } catch {
      await Linking.openURL(
        `https://play.google.com/store/apps/details?id=${packageName}`
      );
    }
  };

  const confirmLogout = async () => {
    setLogoutDialogVisible(false);

    try {
      await signOut(auth);
      // Previously missing: without this, the user was left on this
      // screen after signing out (no global auth-state listener exists
      // to redirect them), able to keep tapping into screens with no
      // valid session.
      navigation.replace("Login");
    } catch (error) {
      console.error(error);

      Alert.alert(
        "Logout Failed",
        "Please try again."
      );
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>
        ⚙️ Settings
      </Text>

      <Text style={styles.subtitle}>
        Manage your account and application settings.
      </Text>

      <SettingsItem
        icon="👤"
        title="My Profile"
        onPress={() => navigation.navigate("Profile")}
      />

      <SettingsItem
        icon="🛍️"
        title="Store"
        onPress={() => navigation.navigate("Store")}
      />

      <SettingsItem
        icon="⭐"
        title="Rate App"
        onPress={handleRateApp}
      />

      <SettingsItem
        icon="📤"
        title="Share App"
        onPress={handleShare}
      />

      <SettingsItem
        icon="📞"
        title="Contact Us"
        onPress={handleContact}
      />

      <SettingsItem
        icon="ℹ️"
        title="About AyurPulse"
        onPress={() => navigation.navigate("About")}
      />

      <SettingsItem
        icon="🔒"
        title="Privacy Policy"
        onPress={() => navigation.navigate("Privacy")}
      />

      <SettingsItem
        icon="📜"
        title="Terms & Conditions"
        onPress={() => navigation.navigate("Terms")}
      />

      <SettingsItem
        icon="🚪"
        title="Logout"
        onPress={() => setLogoutDialogVisible(true)}
      />

      <ConfirmationDialog
        visible={logoutDialogVisible}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmLabel="Logout"
        destructive
        onConfirm={confirmLogout}
        onCancel={() => setLogoutDialogVisible(false)}
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
    paddingBottom: 40,
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
    marginBottom: SPACING.xl,
  },
});