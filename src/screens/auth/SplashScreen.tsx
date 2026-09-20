import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { COLORS } from "../../theme/colors";
import { SPACING } from "../../theme/spacing";
import { supabase } from "../../config/supabase";
import { resolvePostLoginRoute } from "../../services/courseState";

// BUG FIX ("app logs the student out on its own"): this screen used to
// navigate straight to "Login" after a fixed 2s delay, no matter what -
// it never once checked whether a session was already saved on the
// device. That meant a student who never tapped Logout still landed on
// the Login screen every single time they reopened the app (killed the
// app, restarted their phone, etc.), which looks and feels exactly like
// being logged out even though their session/refresh_token was still
// valid and sitting in secure storage the whole time.
//
// Fix: actually check for a persisted session (getSession() reads it
// from secureSessionStorage and transparently refreshes it if it's
// stale but the refresh_token is still valid) and route based on that -
// only send them to Login if there's genuinely no valid session.
export default function SplashScreen({ navigation }: any) {
  useEffect(() => {
    let isMounted = true;

    async function decideDestination() {
      const minSplashTime = new Promise((resolve) => setTimeout(resolve, 1200));
      const [{ data }] = await Promise.all([supabase.auth.getSession(), minSplashTime]);

      if (!isMounted) return;
      if (!data.session) {
        navigation.replace("Login");
        return;
      }

      // Post-login gate: a student with no course/year yet picks them first.
      const route = await resolvePostLoginRoute();
      if (!isMounted) return;
      navigation.replace(route);
    }

    decideDestination();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌿</Text>

      <Text style={styles.title}>MedVeda</Text>

      <Text style={styles.subtitle}>
        Learn Ayurveda{"\n"}Anytime, Anywhere
      </Text>

      <ActivityIndicator
        size="large"
        color={COLORS.accent}
        style={{ marginTop: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },

  logo: {
    fontSize: 70,
  },

  title: {
    fontSize: 34,
    fontWeight: "bold",
    color: COLORS.text,
    marginTop: SPACING.md,
  },

  subtitle: {
    fontSize: 18,
    color: COLORS.subtitle,
    marginTop: SPACING.sm,
    textAlign: "center",
  },
});
