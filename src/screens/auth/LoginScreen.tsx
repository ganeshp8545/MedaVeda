import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import { loginSchema } from "../../validation/loginSchema";

import { supabase } from "../../config/supabase";
import { createUserProfile, fetchUserProfile } from "../../services/usersService";
import { logDebug, logError } from "../../utils/logger";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";
import { SPACING } from "../../theme/spacing";
import { resolvePostLoginRoute } from "../../services/courseState";

export default function LoginScreen() {
  const navigation = useNavigation<any>();

  const [hidePassword, setHidePassword] = useState(true);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onLogin = async (data: any) => {
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) throw error;

      logDebug("Login success");

      // Backfill a profile row for accounts that predate this feature.
      // Normally the DB trigger (see schema.sql) already creates one on
      // signup - this only kicks in for older/edge-case accounts. Never
      // overwrites an existing profile (e.g. a name the student already
      // customized).
      try {
        const existingProfile = await fetchUserProfile(authData.user!.id);
        if (!existingProfile) {
          await createUserProfile(authData.user!.id, {
            name: authData.user?.user_metadata?.name || data.email.split("@")[0],
            email: data.email,
          });
        }
      } catch (profileError) {
        logDebug("profile backfill failed:", profileError);
      }

      navigation.replace(await resolvePostLoginRoute());

    } catch (error: any) {
      logError("Login failed", error);
      Alert.alert("Login Failed", "Invalid email or password");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌿</Text>

      <Text style={styles.title}>MedVeda</Text>

      <Text style={styles.subtitle}>
        Learn Ayurveda Anytime, Anywhere
      </Text>

      {/* Email */}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <TextInput
            placeholder="Email"
            placeholderTextColor={COLORS.subtitle}
            style={styles.input}
            value={value}
            onChangeText={onChange}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}
      />

      {errors.email && (
        <Text style={styles.error}>
          {errors.email.message}
        </Text>
      )}

      {/* Password */}

      <View style={styles.passwordContainer}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <TextInput
              placeholder="Password"
              placeholderTextColor={COLORS.subtitle}
              style={styles.passwordInput}
              secureTextEntry={hidePassword}
              value={value}
              onChangeText={onChange}
            />
          )}
        />

        <TouchableOpacity
          onPress={() => setHidePassword(!hidePassword)}
        >
          <Ionicons
            name={hidePassword ? "eye-off" : "eye"}
            size={22}
            color={COLORS.subtitle}
          />
        </TouchableOpacity>
      </View>

      {errors.password && (
        <Text style={styles.error}>
          {errors.password.message}
        </Text>
      )}

      {/* Forgot Password */}

      <TouchableOpacity
        onPress={() => navigation.navigate("ForgotPassword")}
      >
        <Text style={styles.forgot}>
          Forgot Password?
        </Text>
      </TouchableOpacity>

      {/* Login Button */}

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit(onLogin)}
      >
        <Text style={styles.buttonText}>
          Login
        </Text>
      </TouchableOpacity>

      {/* Register */}

      <TouchableOpacity
        onPress={() => navigation.navigate("Register")}
      >
        <Text style={styles.register}>
          Don't have an account? Register
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 25,
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },

  logo: {
    fontSize: 70,
    textAlign: "center",
  },

  title: {
    fontSize: 34,
    fontWeight: "bold",
    color: COLORS.text,
    textAlign: "center",
    marginTop: SPACING.sm,
  },

  subtitle: {
    textAlign: "center",
    color: COLORS.subtitle,
    marginTop: SPACING.sm,
    marginBottom: 40,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },

  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
  },

  passwordInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    color: COLORS.text,
  },

  error: {
    color: COLORS.error,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },

  forgot: {
    color: COLORS.accentLight,
    textAlign: "right",
    marginTop: SPACING.md,
    marginBottom: 25,
  },

  button: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    ...SHADOW.glow,
  },

  buttonText: {
    color: COLORS.textOnPrimary,
    fontWeight: "bold",
    textAlign: "center",
    fontSize: 18,
  },

  register: {
    marginTop: 25,
    textAlign: "center",
    color: COLORS.subtitle,
    fontSize: 16,
  },
});
