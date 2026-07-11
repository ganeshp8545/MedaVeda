import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

type Props = {
  chapterTitle: string;
  subjectTitle: string;
  yearTitle: string;
  onPress: () => void;
};

// "Hero transition" style card: starts slightly scaled-down and
// transparent, then eases into full size/opacity - draws the eye to
// the single most relevant action on the dashboard.
export default function ContinueLearningCard({
  chapterTitle,
  subjectTitle,
  yearTitle,
  onPress,
}: Props) {
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.card}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>▶️</Text>
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.eyebrow}>CONTINUE LEARNING</Text>
          <Text style={styles.title} numberOfLines={1}>
            {chapterTitle}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {yearTitle} · {subjectTitle}
          </Text>
        </View>

        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOW.glow,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.14)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  icon: {
    fontSize: 20,
  },
  textBlock: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: COLORS.accentLight,
    marginBottom: 2,
  },
  title: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.white,
  },
  subtitle: {
    fontSize: FONT.tiny,
    color: "rgba(255,255,255,0.65)",
    marginTop: 2,
  },
  chevron: {
    fontSize: 26,
    fontWeight: "300",
    color: COLORS.accentLight,
    marginLeft: SPACING.sm,
  },
});
