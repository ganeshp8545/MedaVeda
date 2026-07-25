import React, { useEffect } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../theme/colors";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";
import { SPACING } from "../theme/spacing";
import { DURATIONS, EASINGS } from "../theme/motion";
import AnimatedPressable from "./motion/AnimatedPressable";

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  isCorrect?: boolean;
  isWrong?: boolean;
};

// ANIMATION SYSTEM: press feedback via AnimatedPressable, plus a quick
// "reveal pulse" the instant an answer resolves to correct/wrong -
// small enough to not feel gimmicky, but enough to draw the eye to the
// right answer without a jarring color-only snap.
export default function OptionCard({
  title,
  onPress,
  disabled = false,
  isCorrect = false,
  isWrong = false,
}: Props) {
  const revealScale = useSharedValue(1);

  let backgroundColor: string = COLORS.card;
  let borderColor: string = COLORS.border;

  if (isCorrect) {
    backgroundColor = COLORS.success;
    borderColor = COLORS.success;
  }
  if (isWrong) {
    backgroundColor = COLORS.error;
    borderColor = COLORS.error;
  }

  useEffect(() => {
    if (isCorrect || isWrong) {
      revealScale.value = withSequence(
        withTiming(1.03, { duration: 120, easing: EASINGS.standard }),
        withTiming(1, { duration: DURATIONS.micro, easing: EASINGS.inOut })
      );
    }
  }, [isCorrect, isWrong]);

  const revealStyle = useAnimatedStyle(() => ({
    transform: [{ scale: revealScale.value }],
  }));

  return (
    <AnimatedPressable onPress={onPress} disabled={disabled}>
      <Animated.View style={[styles.card, { backgroundColor, borderColor }, revealStyle]}>
        <Text
          style={[
            styles.text,
            (isCorrect || isWrong) && { color: COLORS.textOnPrimary },
          ]}
        >
          {title}
        </Text>
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    ...SHADOW.card,
  },
  text: {
    fontSize: 17,
    color: COLORS.text,
    fontWeight: "600",
  },
});
