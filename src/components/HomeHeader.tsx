import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { auth } from "../config/firebase";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { SHADOW } from "../theme/shadows";
import GradientBackground from "./GradientBackground";

export default function HomeHeader() {
  const navigation = useNavigation<any>();

  const hour = new Date().getHours();

  let greeting = "Good Morning";
  let emoji = "☀️";

  if (hour >= 12 && hour < 17) {
    greeting = "Good Afternoon";
    emoji = "🌤️";
  } else if (hour >= 17) {
    greeting = "Good Evening";
    emoji = "🌙";
  }

  const email = auth.currentUser?.email ?? "";
  const initial = email ? email[0].toUpperCase() : "?";

  // Entrance: header content eases up + fades in on mount.
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  // Signature flourish: a slow, subtle "breathing" glow on the avatar -
  // the one continuous animation on this screen, kept gentle on purpose.
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, translateY, glow]);

  const avatarScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View style={styles.header}>
      <GradientBackground
        colors={[COLORS.primaryDark, COLORS.primary, COLORS.secondary]}
        direction="diagonal"
      />

      <Animated.View
        style={[styles.content, { opacity, transform: [{ translateY }] }]}
      >
        <View style={styles.left}>
          <Text style={styles.brand}>AYURPULSE</Text>

          <Text style={styles.greeting}>
            {greeting} {emoji}
          </Text>

          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Profile")}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.iconButton,
                styles.avatarGlow,
                { transform: [{ scale: avatarScale }] },
              ]}
            >
              <Text style={styles.avatarText}>{initial}</Text>
              <View style={styles.avatarSheen} pointerEvents="none" />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.iconButtonGhost]}
            onPress={() => navigation.navigate("Settings")}
            activeOpacity={0.8}
          >
            <Text style={styles.icon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: COLORS.primaryDark,
  },

  content: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 28,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },

  left: {
    flex: 1,
    paddingRight: SPACING.md,
  },

  brand: {
    fontSize: FONT.heading,
    fontWeight: "700",
    letterSpacing: 2,
    color: COLORS.accentLight,
    marginBottom: 6,
  },

  greeting: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.white,
  },

  email: {
    fontSize: FONT.small,
    color: "rgba(255,255,255,0.65)",
    marginTop: 4,
  },

  actions: {
    flexDirection: "row",
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: SPACING.sm,
  },

  avatarGlow: {
    ...SHADOW.glow,
  },

  // Kept fully inside the circle's bounds (rather than clipped via
  // overflow:hidden) so it never fights with the glow shadow on the
  // same view - overflow:hidden would silently cut the shadow off.
  avatarSheen: {
    position: "absolute",
    top: 5,
    left: 7,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  iconButtonGhost: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },

  icon: {
    fontSize: 18,
  },
});
