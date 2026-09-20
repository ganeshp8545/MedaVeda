import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import { resetPasswordSchema } from "../../validation/resetPasswordSchema";
import { completePasswordReset } from "../../features/auth/authService";
import { getLastDeepLinkUrl, clearLastDeepLinkUrl } from "../../features/auth/deepLinkStore";
import { supabase } from "../../config/supabase";
import { logError } from "../../utils/logger";
import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SPACING } from "../../theme/spacing";

type ResetPasswordForm = {
  password: string;
  confirmPassword: string;
};

export default function ResetPasswordScreen() {
  const navigation = useNavigation<any>();

  // BUG FIX ("link tapped while app was already open loses the token"):
  // this used to call Linking.getInitialURL()/addEventListener("url", ...)
  // itself. On a cold start that's fine, but on a warm start (app already
  // running in the background) React Navigation's own linking listener
  // reacts to the same "url" event and navigates here - by the time this
  // screen mounts and registers its own listener, the event has already
  // fired and passed, so it never actually catches the token. Reading
  // from deepLinkStore instead works both ways, since that listener is
  // registered once at app root (AppNavigator), before any screen exists.
  const [resetUrl] = useState<string | null>(() => getLastDeepLinkUrl());

  const [saving, setSaving] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: yupResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const submit = async ({ password }: ResetPasswordForm) => {
    if (!resetUrl) {
      Alert.alert(
        "Link Invalid",
        "This reset link is invalid or has expired. Please request a new one."
      );
      return;
    }

    setSaving(true);

    try {
      await completePasswordReset(resetUrl, password);
      clearLastDeepLinkUrl();

      // SECURITY: completePasswordReset() leaves the recovery session
      // active (it had to sign in with it to call updateUser()). Signing
      // out here forces a fresh login with the new password instead of
      // silently carrying that session forward - otherwise anyone who
      // still had the (single-use, but not yet expired) email link could
      // reopen it and land in an authenticated app state without ever
      // typing the new password.
      await supabase.auth.signOut();

      Alert.alert(
        "Password Updated",
        "Your password has been reset. Please log in with your new password.",
        [
          {
            text: "OK",
            onPress: () =>
              navigation.reset({
                index: 0,
                routes: [{ name: "Login" }],
              }),
          },
        ]
      );
    } catch (error: any) {
      logError("resetPassword failed", error);

      Alert.alert(
        "Something Went Wrong",
        error?.message ||
          "This reset link is invalid or has expired. Please request a new one."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🔑</Text>

      <Text style={styles.title}>Reset Password</Text>

      <Text style={styles.subtitle}>
        Enter a new password for your account.
      </Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="New Password"
            placeholderTextColor={COLORS.subtitle}
            value={value}
            onChangeText={onChange}
            secureTextEntry
            editable={!saving}
          />
        )}
      />

      {errors.password && (
        <Text style={styles.error}>{errors.password.message}</Text>
      )}

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            placeholderTextColor={COLORS.subtitle}
            value={value}
            onChangeText={onChange}
            secureTextEntry
            editable={!saving}
          />
        )}
      />

      {errors.confirmPassword && (
        <Text style={styles.error}>{errors.confirmPassword.message}</Text>
      )}

      <TouchableOpacity
        style={[styles.button, saving && styles.disabled]}
        disabled={saving}
        onPress={handleSubmit(submit)}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <Text style={styles.buttonText}>Update Password</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.link}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 25,
    backgroundColor: COLORS.background,
  },

  logo: {
    textAlign: "center",
    fontSize: 60,
  },

  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: SPACING.sm,
  },

  subtitle: {
    color: COLORS.subtitle,
    textAlign: "center",
    marginBottom: SPACING.xl,
  },

  input: {
    color: COLORS.text,
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
  },

  error: {
    color: COLORS.error,
    marginBottom: SPACING.sm,
  },

  button: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
  },

  disabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: COLORS.textOnPrimary,
    fontWeight: "bold",
    textAlign: "center",
    fontSize: 17,
  },

  link: {
    color: COLORS.accentLight,
    textAlign: "center",
    marginTop: SPACING.lg,
  },
});