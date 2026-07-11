import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { COLORS } from "../../theme/colors";

export default function SplashScreen({ navigation }: any) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace("Login");
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌿</Text>

      <Text style={styles.title}>AyurPulse</Text>

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
    padding: 20,
  },

  logo: {
    fontSize: 70,
  },

  title: {
    fontSize: 34,
    fontWeight: "bold",
    color: COLORS.text,
    marginTop: 15,
  },

  subtitle: {
    fontSize: 18,
    color: COLORS.subtitle,
    marginTop: 10,
    textAlign: "center",
  },
});
