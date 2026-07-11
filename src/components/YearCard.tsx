import React, { useRef } from "react";
import {
  TouchableWithoutFeedback,
  Animated,
  Text,
  StyleSheet,
  View,
} from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";
import { mixColor } from "../utils/gradient";

type Props = {
  title: string;
  icon: string;
  color: string;
  onPress: () => void;
};

export default function YearCard({
  title,
  icon,
  color,
  onPress,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, friction: 6, tension: 140 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }).start();
  };

  const iconGlow = mixColor(color, "#FFFFFF", 0.25);

  return (
    <TouchableWithoutFeedback onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <View style={[styles.iconBadge, { backgroundColor: `${color}1F`, borderColor: `${color}3D` }]}>
          <View style={[styles.iconGlowDot, { backgroundColor: iconGlow }]} />
          <Text style={styles.icon}>{icon}</Text>
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Tap to explore subjects</Text>
        </View>

        <Text style={[styles.chevron, { color }]}>›</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
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
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },

  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
    overflow: "hidden",
  },

  iconGlowDot: {
    position: "absolute",
    top: -14,
    left: -10,
    width: 30,
    height: 30,
    borderRadius: 15,
    opacity: 0.35,
  },

  icon: {
    fontSize: 24,
  },

  textBlock: {
    flex: 1,
  },

  title: {
    fontSize: FONT.subHeading,
    fontWeight: "700",
    color: COLORS.text,
  },

  subtitle: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 2,
  },

  chevron: {
    fontSize: 28,
    fontWeight: "300",
    marginLeft: SPACING.sm,
  },
});
