import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { forgotPasswordSchema } from "../../validation/forgotPasswordSchema";
import { parseAuthIdentifier } from "../../features/auth/identity";
import { requestPasswordReset } from "../../features/auth/authService";
import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SPACING } from "../../theme/spacing";

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<{ identifier: string }>({ resolver: yupResolver(forgotPasswordSchema), defaultValues: { identifier: "" } });
  const submit = async ({ identifier: text }: { identifier: string }) => {
    const identifier = parseAuthIdentifier(text);
    if (!identifier) return;
    setLoading(true);
    try { await requestPasswordReset(identifier); }
    finally {
      // Same response for both a missing profile and a delivery failure.
      setLoading(false);
      Alert.alert("Check your email", "If an account matches these details, a password reset email has been sent.");
    }
  };
  return <View style={styles.container}>
    <Text style={styles.logo}>🔑</Text><Text style={styles.title}>Forgot Password?</Text>
    <Text style={styles.subtitle}>Enter your email or mobile number. We will send a reset email to the linked verified email account.</Text>
    <Controller control={control} name="identifier" render={({ field: { onChange, value } }) => <TextInput style={styles.input} placeholder="Email or Mobile Number" placeholderTextColor={COLORS.subtitle} value={value} onChangeText={onChange} autoCapitalize="none" editable={!loading} />} />
    {errors.identifier && <Text style={styles.error}>{errors.identifier.message}</Text>}
    <TouchableOpacity style={[styles.button, loading && styles.disabled]} disabled={loading} onPress={handleSubmit(submit)}>{loading ? <ActivityIndicator color={COLORS.textOnPrimary} /> : <Text style={styles.buttonText}>Send Reset Email</Text>}</TouchableOpacity>
    <TouchableOpacity onPress={() => navigation.navigate("Login")}><Text style={styles.link}>Back to Login</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, justifyContent: "center", padding: 25, backgroundColor: COLORS.background }, logo: { textAlign: "center", fontSize: 60 }, title: { color: COLORS.text, fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: SPACING.sm }, subtitle: { color: COLORS.subtitle, textAlign: "center", marginBottom: SPACING.xl }, input: { color: COLORS.text, backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md }, error: { color: COLORS.error, marginTop: SPACING.xs }, button: { backgroundColor: COLORS.accent, padding: 16, borderRadius: RADIUS.md, marginTop: SPACING.lg }, disabled: { opacity: 0.6 }, buttonText: { color: COLORS.textOnPrimary, fontWeight: "bold", textAlign: "center", fontSize: 17 }, link: { color: COLORS.accentLight, textAlign: "center", marginTop: SPACING.lg } });
