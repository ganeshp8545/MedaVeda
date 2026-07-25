import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../theme/colors";
import { FONT, FONT_WEIGHT } from "../theme/typography";
import { EASINGS } from "../theme/motion";

type Props = {
  days: number;
};

// A little "pop" the moment the streak count is known - subtle enough
// not to feel gimmicky on every screen load, but enough to make the
// number feel alive rather than static text.
export default function StreakBadge({ days }: Props) {
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (days <= 0) return;
    scale.value = withSequence(
      withTiming(1.12, { duration: 160, easing: EASINGS.standard }),
      withTiming(1, { duration: 140, easing: EASINGS.inOut })
    );
  }, [days]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (days <= 0) return null;

  return (
    <Animated.View style={[styles.badge, animatedStyle]}>
      <Text style={styles.flame}>🔥</Text>
      <Text style={styles.count}>{days}</Text>
      <Text style={styles.label}>{days === 1 ? "day" : "days"}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(226,112,61,0.16)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  flame: {
    fontSize: 13,
    marginRight: 4,
  },
  count: {
    fontSize: FONT.small,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLORS.accentLight,
    marginRight: 3,
  },
  label: {
    fontSize: FONT.tiny,
    color: COLORS.accentLight,
    fontWeight: FONT_WEIGHT.medium as any,
  },
});
