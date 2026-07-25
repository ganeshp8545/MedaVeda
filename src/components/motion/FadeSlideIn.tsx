// ANIMATION SYSTEM - FadeSlideIn.
//
// Upgrades the existing StaggerItem.tsx (which uses the legacy RN
// `Animated` API) to Reanimated - functionally the same "fade + rise"
// entrance, but runs on the UI thread so a long FlatList of these never
// drops frames even if JS is busy (e.g. fetching more data while
// scrolling). StaggerItem.tsx can stay for now if other screens still
// import it directly, but new lists should use this.
//
// Respects the OS "Reduce Motion" setting - entrance animation is
// decorative, so it's skipped (content just appears) rather than forced
// on users who've asked their device to minimize motion.
//
// Usage in a FlatList:
//   renderItem={({ item, index }) => (
//     <FadeSlideIn index={index}>
//       <NoteCard ... />
//     </FadeSlideIn>
//   )}

import React, { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { DURATIONS, EASINGS } from "../../theme/motion";

type Props = {
  children: React.ReactNode;
  index?: number; // stagger delay = min(index, cap) * staggerMs
  style?: any;
  staggerMs?: number;
  distance?: number; // px risen from
};

export default function FadeSlideIn({
  children,
  index = 0,
  style,
  staggerMs = 45,
  distance = 14,
}: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(distance);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    // Cap the stagger so item #40 in a long list doesn't wait 2 seconds
    // to appear - beyond ~8 items everything animates together.
    const delay = Math.min(index, 8) * staggerMs;
    opacity.value = withDelay(delay, withTiming(1, { duration: DURATIONS.entrance, easing: EASINGS.standard }));
    translateY.value = withDelay(delay, withTiming(0, { duration: DURATIONS.entrance, easing: EASINGS.standard }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
