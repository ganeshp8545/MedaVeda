// ANIMATION SYSTEM - Shimmer.
//
// Same visual result as SkeletonBlock in Skeleton.tsx (a pulsing
// placeholder block) but driven by Reanimated's UI-thread loop instead
// of the JS-thread `Animated` API - matters here specifically because
// skeleton screens often show many of these at once (a whole list of
// loading cards), and a JS-thread animation loop across a dozen
// simultaneous Animated.Value listeners is exactly the kind of thing
// that causes jank on lower-end Android devices.
//
// Skeleton.tsx's SkeletonBlock can stay as-is for now; use this for any
// new skeleton screen.

import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../../theme/colors";
import { RADIUS } from "../../theme/radius";

type Props = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function ShimmerBlock({
  width = "100%",
  height = 16,
  borderRadius = RADIUS.sm,
  style,
}: Props) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withTiming(0.4, { duration: 700 })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: COLORS.surfaceMuted },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Pre-built shimmer for a horizontal card row - drop-in for a loading FlatList. */
export function ShimmerCardRow() {
  return (
    <View style={styles.row}>
      <ShimmerBlock width={64} height={64} borderRadius={RADIUS.md} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <ShimmerBlock width="70%" height={14} style={{ marginBottom: 8 }} />
        <ShimmerBlock width="40%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 10,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
  },
});
