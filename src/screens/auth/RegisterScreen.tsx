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

import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../config/firebase";
import { createUserProfile } from "../../services/usersService";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

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
      const userCredential =
        await createUserWithEmailAndPassword(
          auth,
          data.email,
          data.password
        );

      console.log("Registration Success");
      console.log(userCredential.user.email);

      // Best-effort: the auth account is already created at this point,
      // so a Firestore hiccup here shouldn't be reported as a failed
      // registration - it's logged and can be retried (e.g. profile can
      // be created lazily on next login) without blocking the user.
      try {
        await createUserProfile(userCredential.user.uid, {
          name: data.fullName,
          email: data.email,
        });
      } catch (profileError) {
        console.log("createUserProfile failed:", profileError);
      }

      Alert.alert("Success", "Registration Successful");

      navigation.navigate("Login");

    } catch (error: any) {
      console.log(error.code);
      console.log(error.message);

      const message =
        error.code === "auth/email-already-in-use"
          ? "This email is already registered. Please login instead."
          : error.code === "auth/weak-password"
          ? "Password is too weak. Please use at least 6 characters."
          : error.code === "auth/invalid-email"
          ? "Please enter a valid email address."
          : "Registration failed. Please try again.";

      Alert.alert("Registration Failed", message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌿</Text>

      <Text style={styles.title}>AyurPulse</Text>

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
    marginTop: 10,
  },

  subtitle: {
    textAlign: "center",
    color: COLORS.subtitle,
    marginTop: 10,
    marginBottom: 35,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 15,
    marginBottom: 10,
  },

  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 15,
    backgroundColor: COLORS.card,
    marginTop: 5,
  },

  passwordInput: {
    flex: 1,
    paddingVertical: 15,
    color: COLORS.text,
  },

  button: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    marginTop: 20,
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
    marginBottom: 10,
    marginTop: 3,
  },
});
