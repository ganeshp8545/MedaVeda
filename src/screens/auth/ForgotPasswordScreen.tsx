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
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import { forgotPasswordSchema } from "../../validation/forgotPasswordSchema";

import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../config/firebase";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: any) => {
    if (sending) return;

    setSending(true);

    try {
      await sendPasswordResetEmail(auth, data.email);
      setSentEmail(data.email);
      setSent(true);
    } catch (error: any) {
      console.log(error.code);
      console.log(error.message);

      // Firebase's "user-not-found" reveals whether an email is
      // registered, which is an account-enumeration risk. Show the same
      // success state for that case as for a real send, and only surface
      // genuinely actionable errors (bad email format, rate limiting,
      // network issues) to the user.
      if (error.code === "auth/user-not-found") {
        setSentEmail(data.email);
        setSent(true);
        return;
      }

      if (error.code === "auth/invalid-email") {
        Alert.alert("Invalid Email", "Please enter a valid email address.");
      } else if (error.code === "auth/too-many-requests") {
        Alert.alert(
          "Too Many Attempts",
          "You've requested this too many times. Please wait a while before trying again."
        );
      } else if (error.code === "auth/network-request-failed") {
        Alert.alert(
          "Network Error",
          "Could not reach the server. Check your internet connection and try again."
        );
      } else {
        Alert.alert(
          "Something Went Wrong",
          "Could not send the reset link. Please try again."
        );
      }
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <Ionicons
          name="mail-open-outline"
          size={70}
          color={COLORS.accent}
          style={styles.successIcon}
        />

        <Text style={styles.title}>Check Your Email</Text>

        <Text style={styles.subtitle}>
          If an account exists for {sentEmail}, we've sent a password reset
          link to it. Follow the link to set a new password.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.buttonText}>Back to Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setSent(false);
          }}
        >
          <Text style={styles.resend}>
            Didn't get it? Try a different email
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={COLORS.text} />
      </TouchableOpacity>

      <Text style={styles.logo}>🔑</Text>

      <Text style={styles.title}>Forgot Password?</Text>

      <Text style={styles.subtitle}>
        Enter the email linked to your account and we'll send you a link to
        reset your password.
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
            editable={!sending}
          />
        )}
      />

      {errors.email && (
        <Text style={styles.error}>{errors.email.message}</Text>
      )}

      {/* Send Reset Link */}

      <TouchableOpacity
        style={[styles.button, sending && styles.buttonDisabled]}
        onPress={handleSubmit(onSubmit)}
        disabled={sending}
      >
        {sending ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <Text style={styles.buttonText}>Send Reset Link</Text>
        )}
      </TouchableOpacity>

      {/* Back to Login */}

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.register}>Remembered your password? Login</Text>
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

  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    padding: 6,
  },

  logo: {
    fontSize: 60,
    textAlign: "center",
  },

  successIcon: {
    alignSelf: "center",
    marginBottom: 10,
  },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.text,
    textAlign: "center",
    marginTop: 10,
  },

  subtitle: {
    textAlign: "center",
    color: COLORS.subtitle,
    marginTop: 10,
    marginBottom: 30,
    lineHeight: 20,
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

  error: {
    color: COLORS.error,
    marginTop: 5,
    marginBottom: 10,
  },

  button: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    marginTop: 10,
    ...SHADOW.glow,
  },

  buttonDisabled: {
    opacity: 0.7,
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

  resend: {
    marginTop: 20,
    textAlign: "center",
    color: COLORS.accentLight,
    fontSize: 15,
  },
});
