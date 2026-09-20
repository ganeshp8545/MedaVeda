import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { resetPasswordSchema } from "../../validation/resetPasswordSchema";
import { completePasswordReset } from "../../features/auth/authService";
import { logError } from "../../utils/logger";
import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SPACING } from "../../theme/spacing";

type ResetPasswordForm = { password: string; confirmPassword: string };

export default function ResetPasswordScreen() {
  const navigation = useNavigation<any>();
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [checkingLink, setCheckingLink] = useState(true);
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<ResetPasswordForm>({
    resolver: yupResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    // The recovery access/refresh tokens live in the URL's "#" fragment,
    // which React Navigation's linking config does not forward as a route
    // param - so the raw URL is read directly here. getInitialURL covers
    // a cold start (email link opened the app fresh); the "url" event
    // covers a warm start (app was already open/backgrounded).
    let isMounted = true;
    Linking.getInitialURL().then((url) => {
      if (!isMounted) return;
      if (url) setResetUrl(url);
      setCheckingLink(false);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (isMounted) setResetUrl(url);
    });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const submit = async ({ password }: ResetPasswordForm) => {
    if (!resetUrl) {
      Alert.alert("Link Invalid", "This reset link is invalid or has expired. Please request a new one.");
      return;
    }
    setSaving(true);
    try {
      await completePasswordReset(resetUrl, password);
      Alert.alert(
        "Password Updated",
        "Your password has been reset. Please log in with your new password.",
        [{ text: "OK", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Login" }] }) }]
      );
    } catch (error: any) {
      logError("resetPassword failed", error);
      Alert.alert(
        "Something Went Wrong",
        error?.message || "This reset link is invalid or has expired. Please request a new one."
      );
    } finally {
      setSaving(false);
    }
  };

  if (checkingLink) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🔑</Text>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.subtitle}>Enter a new password for your account.</Text>

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
      {errors.password && <Text style={styles.error}>{errors.password.message}</Text>}

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
      {errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword.message}</Text>}

      <TouchableOpacity
        style={[styles.button, saving && styles.disabled]}
        disabled={saving}
        onPress={handleSubmit(submit)}
      >
        {saving ? <ActivityIndicator color={COLORS.textOnPrimary} /> : <Text style={styles.buttonText}>Update Password</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.link}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 25, backgroundColor: COLORS.background },
  logo: { textAlign: "center", fontSize: 60 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: SPACING.sm },
  subtitle: { color: COLORS.subtitle, textAlign: "center", marginBottom: SPACING.xl },
  input: { color: COLORS.text, backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xs },
  error: { color: COLORS.error, marginBottom: SPACING.sm },
  button: { backgroundColor: COLORS.accent, padding: 16, borderRadius: RADIUS.md, marginTop: SPACING.lg },
  disabled: { opacity: 0.6 },
  buttonText: { color: COLORS.textOnPrimary, fontWeight: "bold", textAlign: "center", fontSize: 17 },
  link: { color: COLORS.accentLight, textAlign: "center", marginTop: SPACING.lg },
});