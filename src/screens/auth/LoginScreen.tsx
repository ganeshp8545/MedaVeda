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

import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../config/firebase";
import { createUserProfile, fetchUserProfile } from "../../services/usersService";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

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
      const userCredential = await signInWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      console.log("Login Success");
      console.log(userCredential.user.email);

      // Backfill a profile doc for accounts that predate this feature.
      // Only creates one if it's genuinely missing - never overwrites an
      // existing profile (e.g. a name the student already customized).
      try {
        const existingProfile = await fetchUserProfile(userCredential.user.uid);
        if (!existingProfile) {
          await createUserProfile(userCredential.user.uid, {
            name: userCredential.user.displayName || data.email.split("@")[0],
            email: data.email,
          });
        }
      } catch (profileError) {
        console.log("profile backfill failed:", profileError);
      }

      navigation.replace("Home");

    } catch (error: any) {
      console.log(error.code);
      console.log(error.message);

      Alert.alert("Login Failed", "Invalid email or password");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌿</Text>

      <Text style={styles.title}>AyurPulse</Text>

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
    marginTop: 10,
  },

  subtitle: {
    textAlign: "center",
    color: COLORS.subtitle,
    marginTop: 10,
    marginBottom: 40,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 15,
    backgroundColor: COLORS.card,
    color: COLORS.text,
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
  },

  passwordInput: {
    flex: 1,
    paddingVertical: 15,
    color: COLORS.text,
  },

  error: {
    color: COLORS.error,
    marginTop: 5,
    marginBottom: 10,
  },

  forgot: {
    color: COLORS.accentLight,
    textAlign: "right",
    marginTop: 15,
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
