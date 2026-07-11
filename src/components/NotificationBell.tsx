import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "../theme/colors";

type Props = {
  count: number;
  onPress: () => void;
};

export default function NotificationBell({ count, onPress }: Props) {
  const bounce = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (count > 0) {
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1.3, duration: 150, useNativeDriver: true }),
        Animated.spring(bounce, { toValue: 1, friction: 3, tension: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [count, bounce]);

  return (
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.icon}>🔔</Text>
      {count > 0 && (
        <Animated.View style={[styles.dot, { transform: [{ scale: bounce }] }]}>
          <Text style={styles.dotText}>{count > 9 ? "9+" : count}</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    fontSize: 18,
  },
  dot: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: COLORS.error,
    justifyContent: "center",
    alignItems: "center",
  },
  dotText: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.white,
  },
});
