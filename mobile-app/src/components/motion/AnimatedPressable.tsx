// ANIMATION SYSTEM - AnimatedPressable.
//
// Drop-in replacement for TouchableOpacity that adds a physical
// press-down scale (via Reanimated, runs on the UI thread so it never
// stutters even while JS is busy fetching data). Use this for every
// primary tap target - buttons, cards, list rows - so the whole app
// shares one consistent "tactile" feel instead of each screen inventing
// its own opacity fade.
//
// Usage:
//   <AnimatedPressable onPress={...}>
//     <View style={styles.card}>...</View>
//   </AnimatedPressable>

import React from "react";
import { GestureResponderEvent, ViewStyle, StyleProp, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { PRESS_SCALE, SPRINGS } from "../../theme/motion";

type Props = {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number; // override PRESS_SCALE for rare cases (e.g. subtler feedback on large hero cards)
  hitSlop?: number;
};

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

export default function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  disabled = false,
  style,
  scaleTo = PRESS_SCALE,
  hitSlop,
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableBase
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, SPRINGS.press);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRINGS.press);
      }}
      style={[style, animatedStyle, disabled && { opacity: 0.5 }]}
    >
      {children}
    </AnimatedPressableBase>
  );
}
