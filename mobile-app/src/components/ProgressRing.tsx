import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";

type Props = {
  percentage: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
};

// Pure-View circular progress ring - deliberately avoids react-native-svg
// so this works without adding a new native dependency. Uses the standard
// "filled disc + two rotating half masks + inner cutout" technique to draw
// a donut ring, and animates from 0 -> percentage on mount.
export default function ProgressRing({
  percentage,
  size = 92,
  strokeWidth = 10,
  color = COLORS.accent,
  trackColor = COLORS.surfaceMuted,
  label,
}: Props) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const anim = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setProgress(value));
    Animated.timing(anim, {
      toValue: clamped,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [clamped, anim]);

  const rightRotation = progress > 50 ? 180 : progress * 3.6;
  const leftRotation = progress > 50 ? (progress - 50) * 3.6 : 0;
  const innerSize = size - strokeWidth * 2;

  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: trackColor },
      ]}
    >
      {/* Right half mask */}
      <View style={[styles.halfMask, { width: size / 2, height: size, left: size / 2 }]}>
        <View
          style={[
            styles.fullCircle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              left: -size / 2,
              backgroundColor: color,
              transform: [{ rotate: `${rightRotation}deg` }],
            },
          ]}
        />
      </View>

      {/* Left half mask - only contributes once progress passes 50% */}
      {progress > 50 && (
        <View style={[styles.halfMask, { width: size / 2, height: size, left: 0 }]}>
          <View
            style={[
              styles.fullCircle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                left: 0,
                backgroundColor: color,
                transform: [{ rotate: `${leftRotation}deg` }],
              },
            ]}
          />
        </View>
      )}

      {/* Inner cutout to turn the filled disc into a ring, and hold the label */}
      <View
        style={[
          styles.center,
          {
            top: strokeWidth,
            left: strokeWidth,
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          },
        ]}
      >
        <Text style={styles.value}>{Math.round(clamped)}%</Text>
        {!!label && <Text style={styles.label}>{label}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    position: "relative",
  },
  halfMask: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
  },
  fullCircle: {
    position: "absolute",
    top: 0,
  },
  center: {
    position: "absolute",
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
  },
  value: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },
  label: {
    fontSize: 9,
    color: COLORS.subtitle,
    marginTop: 1,
  },
});
