import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";

import { useNavigation } from "@react-navigation/native";

import { Ionicons } from "@expo/vector-icons";

import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import { registerSchema } from "../../validation/registerSchema";

import { supabase } from "../../config/supabase";
import { createUserProfile } from "../../services/usersService";
import { logDebug, logError } from "../../utils/logger";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";
import { SPACING } from "../../theme/spacing";

export default function RegisterScreen() {
  const [hidePassword, setHidePassword] = useState(true);
  const [hideConfirmPassword, setHideConfirmPassword] = useState(true);
  const navigation = useNavigation<any>();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onRegister = async (data: any) => {
    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { name: data.fullName } },
      });
      if (error) throw error;

      logDebug("Registration success");

      // The DB trigger (see schema.sql) already creates a profile row on
      // signup with a blank name - this fills in the name/email the user
      // just typed. A hiccup here shouldn't be reported as a failed
      // registration - the auth account already exists at this point.
      try {
        if (authData.user) {
          await createUserProfile(authData.user.id, {
            name: data.fullName,
            email: data.email,
          });
        }
      } catch (profileError) {
        logDebug("createUserProfile failed:", profileError);
      }

      Alert.alert("Success", "Registration Successful");

      navigation.navigate("Login");

    } catch (error: any) {
      logError("Registration failed", error);

      const message =
        error.message?.includes("already registered")
          ? "This email is already registered. Please login instead."
          : error.message?.includes("Password should be")
          ? "Password is too weak. Please use at least 8 characters."
          : error.message?.includes("valid email")
          ? "Please enter a valid email address."
          : "Registration failed. Please try again.";

      Alert.alert("Registration Failed", message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌿</Text>

      <Text style={styles.title}>MedVeda</Text>

      <Text style={styles.subtitle}>
        Create Your Account
      </Text>

      {/* Full Name */}

      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, value } }) => (
          <TextInput
            placeholder="Full Name"
            placeholderTextColor={COLORS.subtitle}
            style={styles.input}
            value={value}
            onChangeText={onChange}
          />
        )}
      />

      {errors.fullName && (
        <Text style={styles.error}>
          {errors.fullName.message}
        </Text>
      )}

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
          onPress={() =>
            setHidePassword(!hidePassword)
          }
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

      {/* Confirm Password */}

      <View style={styles.passwordContainer}>

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value } }) => (
            <TextInput
              placeholder="Confirm Password"
              placeholderTextColor={COLORS.subtitle}
              style={styles.passwordInput}
              secureTextEntry={hideConfirmPassword}
              value={value}
              onChangeText={onChange}
            />
          )}
        />

        <TouchableOpacity
          onPress={() =>
            setHideConfirmPassword(
              !hideConfirmPassword
            )
          }
        >
          <Ionicons
            name={
              hideConfirmPassword
                ? "eye-off"
                : "eye"
            }
            size={22}
            color={COLORS.subtitle}
          />
        </TouchableOpacity>

      </View>

      {errors.confirmPassword && (
        <Text style={styles.error}>
          {errors.confirmPassword.message}
        </Text>
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit(onRegister)}
      >
        <Text style={styles.buttonText}>
          Register
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    padding: 25,
  },

  logo: {
    fontSize: 70,
    textAlign: "center",
  },

  title: {
    fontSize: 34,
    fontWeight: "bold",
    textAlign: "center",
    color: COLORS.text,
    marginTop: SPACING.sm,
  },

  subtitle: {
    textAlign: "center",
    color: COLORS.subtitle,
    marginTop: SPACING.sm,
    marginBottom: 35,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: SPACING.md,
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
    marginTop: SPACING.xs,
  },

  passwordInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    color: COLORS.text,
  },

  button: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
    ...SHADOW.glow,
  },

  buttonText: {
    color: COLORS.textOnPrimary,
    fontWeight: "bold",
    textAlign: "center",
    fontSize: 18,
  },

  error: {
    color: COLORS.error,
    marginBottom: SPACING.sm,
    marginTop: 3,
  },
});
