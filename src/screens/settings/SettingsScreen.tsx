import React, { useState } from "react";
import {
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
import { SPACING } from "../../theme/spacing";

import { supabase } from "../../config/supabase";
import { deleteAccount } from "../../services/usersService";


export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleShare = async () => {
    try {
      await Share.share({
        message:
          "Download MedVeda - The Ultimate BAMS Study App.\n\nhttps://play.google.com/store/apps/details?id=com.ayurpulse",
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleContact = async () => {
    const url =
      "mailto:medvedaforu@gmail.com?subject=MedVeda Support";

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
      await supabase.auth.signOut();
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

  const confirmDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);

    try {
      await deleteAccount();
      setDeleteDialogVisible(false);
      // No global auth-state listener redirects on sign-out (same reason
      // Logout above does it explicitly), so navigate away manually.
      navigation.replace("Login");
    } catch (error: any) {
      console.error("Delete account failed:", error);
      setDeleteDialogVisible(false);

      Alert.alert(
        "Delete Account Failed",
        error?.message || "Something went wrong. Please try again, or contact support."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SettingsItem
        icon="⏰"
        title="Study Reminder"
        onPress={() => navigation.navigate("StudyReminder")}
      />

      <SettingsItem
        icon="🛍️"
        title="Notes"
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
        title="About MedVeda"
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

      <SettingsItem
        icon="🗑️"
        title="Delete Account"
        destructive
        onPress={() => setDeleteDialogVisible(true)}
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

      <ConfirmationDialog
        visible={deleteDialogVisible}
        title="Delete Account"
        message="This will permanently delete your account, purchases, and all saved data. This action cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        onConfirm={confirmDeleteAccount}
        onCancel={() => !deleting && setDeleteDialogVisible(false)}
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
});