import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";

import { useNavigation } from "@react-navigation/native";

import { supabase } from "../../config/supabase";
import { getCurrentUser } from "../../services/authState";
import { logError } from "../../utils/logger";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";
import { SPACING } from "../../theme/spacing";
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_PATTERN } from "../../validation/passwordPolicy";


export default function ChangePasswordScreen() {
  const navigation = useNavigation<any>();
  const user = getCurrentUser();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  function validate(): boolean {
    let valid = true;

    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");

    if (!currentPassword) {
      setCurrentPasswordError("Enter your current password");
      valid = false;
    }

    if (!newPassword || !PASSWORD_POLICY_PATTERN.test(newPassword)) {
      setNewPasswordError(PASSWORD_POLICY_MESSAGE);
      valid = false;
    } else if (newPassword === currentPassword) {
      setNewPasswordError(
        "New password must be different from the current password"
      );
      valid = false;
    }

    if (confirmPassword !== newPassword) {
      setConfirmPasswordError("Passwords do not match");
      valid = false;
    }

    return valid;
  }

  const handleChangePassword = async () => {
    if (saving) return;
    const loginIdentifier = user?.email
      ? { email: user.email, password: currentPassword }
      : user?.phone
        ? { phone: user.phone, password: currentPassword }
        : null;
    if (!loginIdentifier) {
      Alert.alert("Error", "Could not find your account identifier. Please log in again.");
      return;
    }
    if (!validate()) return;

    try {
      setSaving(true);

      // Supabase's updateUser() doesn't ask for the current password, so we
      // re-authenticate with it first - this both confirms the user really
      // knows the current password and keeps the session valid.
      const { error: signInError } = await supabase.auth.signInWithPassword(loginIdentifier);

      if (signInError) {
        setCurrentPasswordError("Current password is incorrect");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      Alert.alert("Success", "Your password has been changed.");
      navigation.goBack();
    } catch (error: any) {
      logError("changePassword failed", error);
      Alert.alert(
        "Something Went Wrong",
        "Could not change your password. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Change Password</Text>

      <TextInput
        style={styles.input}
        placeholder="Current Password"
        placeholderTextColor={COLORS.subtitle}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        editable={!saving}
      />
      {!!currentPasswordError && (
        <Text style={styles.error}>{currentPasswordError}</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="New Password"
        placeholderTextColor={COLORS.subtitle}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        editable={!saving}
      />
      {!!newPasswordError && (
        <Text style={styles.error}>{newPasswordError}</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Confirm New Password"
        placeholderTextColor={COLORS.subtitle}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!saving}
      />
      {!!confirmPasswordError && (
        <Text style={styles.error}>{confirmPasswordError}</Text>
      )}

      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleChangePassword}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
        ) : (
          <Text style={styles.buttonText}>Update Password</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    justifyContent: "center",
  },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.xl,
    textAlign: "center",
  },

  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: RADIUS.md,
    padding: 16,
    fontSize: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  error: {
    color: COLORS.error,
    marginBottom: 12,
    marginLeft: 4,
  },

  button: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    marginTop: 12,
    ...SHADOW.glow,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: COLORS.textOnPrimary,
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
});
