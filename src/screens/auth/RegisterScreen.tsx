import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { registerSchema } from "../../validation/registerSchema";
import { parseAuthIdentifier } from "../../features/auth/identity";
import { registerWithEmailAndMobile } from "../../features/auth/authService";
import { getPasswordStrength } from "../../utils/passwordStrength";
import { savePendingReferral } from "../../utils/pendingReferral";
import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SPACING } from "../../theme/spacing";

type FormData = { fullName: string; email: string; mobileNumber: string; password: string; confirmPassword: string; referralCode?: string };

const STRENGTH_COLOR: Record<string, string> = {
  weak: COLORS.error,
  fair: COLORS.warning,
  good: COLORS.info,
  strong: COLORS.success,
};

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: yupResolver(registerSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { fullName: "", email: "", mobileNumber: "", password: "", confirmPassword: "", referralCode: "" },
  });

  const passwordValue = watch("password");
  const strength = getPasswordStrength(passwordValue || "");

  const register = async (data: FormData) => {
    // Guard against double-submits (double-tap, slow network + repeat
    // tap) in addition to the button's own `disabled` state.
    if (loading) return;

    const email = parseAuthIdentifier(data.email);
    const mobile = parseAuthIdentifier(data.mobileNumber);
    if (email?.kind !== "email" || mobile?.kind !== "phone") return;
    setLoading(true);
    try {
      const { error } = await registerWithEmailAndMobile({
        fullName: data.fullName.trim(), email: email.value, mobileNumber: mobile.value, password: data.password,
      });
      if (error) throw error;

      // Optional referral code: it can only be applied once there's a
      // session, so keep it on the device until the student logs in. It never
      // affects whether registration succeeds.
      const referralCode = data.referralCode?.trim().toUpperCase();
      if (referralCode) await savePendingReferral(referralCode, email.value);

      Alert.alert(
        "Verification email sent",
        "A verification email has been sent. Please verify your email before logging in.",
        [{ text: "Back to Login", onPress: () => navigation.replace("Login") }]
      );
    } catch {
      // Do not identify which unique field or account state caused failure.
      Alert.alert("Unable to create account", "Please check your details and try again.");
    } finally { setLoading(false); }
  };

  const field = (name: keyof FormData, placeholder: string, secure = false) => <>
    <Controller control={control} name={name} render={({ field: { onChange, onBlur, value } }) => <TextInput style={styles.input} placeholder={placeholder} placeholderTextColor={COLORS.subtitle} value={value} onChangeText={onChange} onBlur={onBlur} secureTextEntry={secure} autoCapitalize="none" editable={!loading} />} />
    {errors[name] && <Text style={styles.error}>{errors[name]?.message}</Text>}
  </>;

  return <View style={styles.container}>
    <Text style={styles.logo}>🌿</Text><Text style={styles.title}>Create Your Account</Text>
    {field("fullName", "Full Name")}{field("email", "Email Address")}{field("mobileNumber", "Mobile Number (e.g. 9876543210)")}
    {field("password", "Password", true)}

    {/* Password strength indicator - purely a UX aid; registerSchema is
        the actual policy gate that decides whether the form can submit. */}
    {!!passwordValue && (
      <View style={styles.strengthWrap}>
        <View style={styles.strengthTrack}>
          {[0, 1, 2, 3].map((segment) => (
            <View
              key={segment}
              style={[
                styles.strengthSegment,
                segment < strength.score ? { backgroundColor: STRENGTH_COLOR[strength.level] } : undefined,
              ]}
            />
          ))}
        </View>
        <Text style={[styles.strengthLabel, { color: STRENGTH_COLOR[strength.level] }]}>
          {strength.label}
        </Text>
      </View>
    )}

    {field("confirmPassword", "Confirm Password", true)}

    <Controller control={control} name="referralCode" render={({ field: { onChange, onBlur, value } }) => <TextInput style={styles.input} placeholder="Referral code (optional)" placeholderTextColor={COLORS.subtitle} value={value} onChangeText={(text) => onChange(text.toUpperCase())} onBlur={onBlur} autoCapitalize="characters" autoCorrect={false} maxLength={10} editable={!loading} />} />
    {errors.referralCode && <Text style={styles.error}>{errors.referralCode.message}</Text>}
    <TouchableOpacity style={[styles.button, loading && styles.disabled]} disabled={loading} onPress={handleSubmit(register)}>{loading ? <ActivityIndicator color={COLORS.textOnPrimary} /> : <Text style={styles.buttonText}>Create Account</Text>}</TouchableOpacity>
    <TouchableOpacity onPress={() => navigation.navigate("Login")} disabled={loading}><Text style={styles.link}>Already have an account? Login</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 25, backgroundColor: COLORS.background },
  logo: { textAlign: "center", fontSize: 64 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: SPACING.xl },
  input: { color: COLORS.text, backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xs },
  error: { color: COLORS.error, marginBottom: SPACING.sm },
  strengthWrap: { marginTop: -SPACING.xs / 2, marginBottom: SPACING.sm },
  strengthTrack: { flexDirection: "row", gap: 4 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  strengthLabel: { fontSize: 12, fontWeight: "600", marginTop: SPACING.xs / 2 },
  button: { backgroundColor: COLORS.accent, padding: 16, borderRadius: RADIUS.md, marginTop: SPACING.sm },
  disabled: { opacity: 0.6 },
  buttonText: { color: COLORS.textOnPrimary, fontWeight: "bold", textAlign: "center", fontSize: 17 },
  link: { color: COLORS.accentLight, textAlign: "center", marginTop: SPACING.lg },
});
