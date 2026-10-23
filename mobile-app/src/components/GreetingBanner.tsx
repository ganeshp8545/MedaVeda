import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";

type Props = {
  name: string;
};

export default function GreetingBanner({ name }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

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

  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.greeting}>
        {greeting}, {name} {emoji}
      </Text>
      <Text style={styles.subtitle}>Let's continue your Ayurveda journey</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.lg,
  },
  greeting: {
    fontSize: FONT.heading,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginTop: 2,
  },
});
