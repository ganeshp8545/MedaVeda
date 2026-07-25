import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";

import { COLORS } from "../theme/colors";
import { RADIUS } from "../theme/radius";
import { SPACING } from "../theme/spacing";

type Props = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

// A single shimmering block. Compose several of these to build a
// skeleton layout that mirrors the real content's shape.
export function SkeletonBlock({
  width = "100%",
  height = 16,
  borderRadius = RADIUS.sm,
  style,
}: Props) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: COLORS.surfaceMuted,
          opacity,
        },
        style,
      ]}
    />
  );
}

// Pre-built skeleton for a horizontal card row (used by most dashboard
// sections while their data is loading).
export function SkeletonCardRow({ count = 2 }: { count?: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <SkeletonBlock width={44} height={44} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBlock width="80%" height={14} style={{ marginBottom: 8 }} />
            <SkeletonBlock width="50%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Pre-built skeleton for a horizontal scroll strip (grids, chips, etc).
export function SkeletonStrip({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.stripRow}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock
          key={i}
          width={130}
          height={90}
          borderRadius={RADIUS.lg}
          style={{ marginRight: 12 }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: SPACING.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: 12,
  },
  stripRow: {
    flexDirection: "row",
    marginBottom: SPACING.lg,
  },
});
