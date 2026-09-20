import React, { useEffect, useState } from "react";
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

import { loginSchema } from "../../validation/loginSchema";

import { createUserProfile, fetchUserProfile } from "../../services/usersService";
import { logDebug } from "../../utils/logger";
import { parseAuthIdentifier } from "../../features/auth/identity";
import { signInWithIdentifier } from "../../features/auth/authService";
import {
  clearLoginAttempts,
  formatRemainingTime,
  getLockStatus,
  recordFailedAttempt,
  type LockStatus,
} from "../../features/auth/loginLockout";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";
import { SPACING } from "../../theme/spacing";
import { resolvePostLoginRoute } from "../../services/courseState";

type FormData = { identifier: string; password: string };

const NOT_LOCKED: LockStatus = { locked: false, remainingMs: 0 };

export default function LoginScreen() {
  const navigation = useNavigation<any>();

  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lockStatus, setLockStatus] = useState<LockStatus>(NOT_LOCKED);
  // Set on EVERY failed sign-in attempt (any cause, email or mobile) so the
  // neutral hint below never reveals whether an account exists.
  const [loginFailed, setLoginFailed] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: yupResolver(loginSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  const identifierValue = watch("identifier");

  // Re-check the lockout state (from SecureStore) whenever the identifier
  // changes, so switching between two accounts on a shared device - or
  // reopening the app while an account is still locked - reflects the
  // correct, persisted status immediately. Debounced so this isn't a
  // storage read on every keystroke.
  useEffect(() => {
    let cancelled = false;
    const parsed = parseAuthIdentifier((identifierValue ?? "").trim());
    if (!parsed) {
      setLockStatus(NOT_LOCKED);
      return;
    }
    const timer = setTimeout(async () => {
      const status = await getLockStatus(parsed.value);
      if (!cancelled) setLockStatus(status);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [identifierValue]);

  // Live countdown while locked, so "locked for 4m 59s" ticks down on
  // screen without the user needing to retry to find out it's expired.
  useEffect(() => {
    if (!lockStatus.locked) return;
    const interval = setInterval(() => {
      setLockStatus((prev) => {
        if (!prev.locked) return prev;
        const remainingMs = prev.remainingMs - 1000;
        return remainingMs <= 0 ? NOT_LOCKED : { locked: true, remainingMs };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockStatus.locked]);

  const onLogin = async (data: FormData) => {
    // Guard against double-submits (double-tap, slow network + repeat
    // tap) in addition to the button's own `disabled` state.
    if (loading) return;
    setLoginFailed(false);

    const identifier = data.identifier.trim();
    const parsedIdentifier = parseAuthIdentifier(identifier);
    if (!parsedIdentifier) {
      setLoginFailed(true);
      Alert.alert("Login Failed", "Enter a valid email or mobile number");
      return;
    }
    const lockKey = parsedIdentifier.value;

    // Re-verify against persisted state right before attempting the
    // request - closes the gap where the debounced check above hasn't
    // run yet but the account is already locked.
    const freshLock = await getLockStatus(lockKey);
    if (freshLock.locked) {
      setLockStatus(freshLock);
      setLoginFailed(true);
      Alert.alert(
        "Account Temporarily Locked",
        `Too many failed attempts. Please try again in ${formatRemainingTime(freshLock.remainingMs)}.`
      );
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error } = await signInWithIdentifier(parsedIdentifier, data.password);
      const user = authData?.user;

      if (error || !user) {
        const status = await recordFailedAttempt(lockKey);
        setLockStatus(status);
        logDebug("Login rejected");
        setLoginFailed(true);
        if (status.locked) {
          Alert.alert(
            "Account Temporarily Locked",
            `Too many failed attempts. Please try again in ${formatRemainingTime(status.remainingMs)}.`
          );
        } else {
          Alert.alert("Login Failed", "Invalid email/mobile number or password");
        }
        return;
      }

      await clearLoginAttempts(lockKey);
      setLockStatus(NOT_LOCKED);
      logDebug("Login success");

      // Backfill a profile row for accounts that predate this feature.
      // Normally the DB trigger (see schema.sql) already creates one on
      // signup - this only kicks in for older/edge-case accounts. Never
      // overwrites an existing profile (e.g. a name the student already
      // customized).
      try {
        const existingProfile = await fetchUserProfile(user.id);
        if (!existingProfile) {
          await createUserProfile(user.id, {
            name: user.user_metadata?.name || user.email?.split("@")[0] || "Student",
            email: user.email || "",
          });
        }
      } catch (profileError) {
        logDebug("profile backfill failed:", profileError);
      }

      navigation.replace(await resolvePostLoginRoute());
    } catch (error: any) {
      // Unexpected/network errors are distinct from wrong credentials -
      // don't count them against the lockout counter, and don't imply
      // anything about whether the identifier or password was correct.
      logDebug("Login error", error);
      setLoginFailed(true);
      Alert.alert("Something Went Wrong", "Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockStatus.locked;
  const isButtonDisabled = loading || isLocked;

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌿</Text>

      <Text style={styles.title}>MedVeda</Text>

      <Text style={styles.subtitle}>
        Learn Ayurveda Anytime, Anywhere
      </Text>

      {/* Email or mobile number */}

      <Controller
        control={control}
        name="identifier"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            placeholder="Email or mobile number"
            placeholderTextColor={COLORS.subtitle}
            style={styles.input}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
        )}
      />

      {errors.identifier && (
        <Text style={styles.error}>
          {errors.identifier.message}
        </Text>
      )}

      {/* Password */}

      <View style={styles.passwordContainer}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              placeholder="Password"
              placeholderTextColor={COLORS.subtitle}
              style={styles.passwordInput}
              secureTextEntry={hidePassword}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              editable={!loading}
            />
          )}
        />

        <TouchableOpacity
          onPress={() => setHidePassword(!hidePassword)}
          disabled={loading}
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

      {loginFailed && (
        <Text style={styles.loginHint}>
          Phone number not linked yet? Log in with your email.
        </Text>
      )}

      {/* Lockout notice */}

      {isLocked && (
        <Text style={styles.lockedNotice}>
          Too many failed attempts. Try again in {formatRemainingTime(lockStatus.remainingMs)}.
        </Text>
      )}

      {/* Forgot Password */}

      <TouchableOpacity
        onPress={() => navigation.navigate("ForgotPassword")}
        disabled={loading}
      >
        <Text style={styles.forgot}>
          Forgot Password?
        </Text>
      </TouchableOpacity>

      {/* Login Button */}

      <TouchableOpacity
        style={[styles.button, isButtonDisabled && styles.buttonDisabled]}
        onPress={handleSubmit(onLogin)}
        disabled={isButtonDisabled}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <Text style={styles.buttonText}>
            {isLocked ? `Locked (${formatRemainingTime(lockStatus.remainingMs)})` : "Login"}
          </Text>
        )}
      </TouchableOpacity>

      {/* Register */}

      <TouchableOpacity
        onPress={() => navigation.navigate("Register")}
        disabled={loading}
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

  loginHint: {
    color: COLORS.subtitle,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },

  lockedNotice: {
    color: COLORS.error,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    textAlign: "center",
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

  buttonDisabled: {
    opacity: 0.6,
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
