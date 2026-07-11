import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";
import ProgressRing from "./ProgressRing";

type Props = {
  name: string;
  email: string;
  progressPercentage: number;
  purchasedCount: number;
  onPress?: () => void;
};

export default function StudentProfileCard({
  name,
  email,
  progressPercentage,
  purchasedCount,
  onPress,
}: Props) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  const initial = name ? name.charAt(0).toUpperCase() : "?";

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={onPress ? 0.85 : 1}
        onPress={onPress}
        style={styles.card}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
          <View style={styles.avatarSheen} pointerEvents="none" />
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>

          <View style={styles.divider} />

          <View style={styles.badgeRow}>
            <Text style={styles.badgeText}>
              📦 {purchasedCount} {purchasedCount === 1 ? "package" : "packages"} owned
            </Text>
          </View>
        </View>

        <ProgressRing percentage={progressPercentage} size={72} strokeWidth={7} label="progress" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOW.card,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
    ...SHADOW.glow,
  },

  // Kept inside the circle's bounds rather than relying on
  // overflow:hidden, which would otherwise clip the glow shadow above.
  avatarSheen: {
    position: "absolute",
    top: 6,
    left: 9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 8,
    marginBottom: 6,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textOnPrimary,
  },
  info: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  name: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },
  email: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 2,
  },
  badgeRow: {
    marginTop: 0,
  },
  badgeText: {
    fontSize: FONT.tiny,
    color: COLORS.accentLight,
    fontWeight: "600",
  },
});
