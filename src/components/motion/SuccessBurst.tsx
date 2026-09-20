// ANIMATION SYSTEM - SuccessBurst.
//
// A celebratory checkmark-pop + outward particle burst, built entirely
// from Reanimated + Views (no react-native-svg, no Lottie asset
// required) so it works immediately without adding a new native
// dependency or design asset. If/when the project adds real Lottie
// animation files (e.g. from LottieFiles), swap the <View> circle below
// for a <LottieView> with the same trigger prop - everything else
// (timing, usage) stays identical.
//
// Usage: mount it once on the result/success screen with `play` toggled
// true - e.g. QuizScreen's pass state, PaymentSuccessScreen, an
// achievement unlock toast.
//
//   <SuccessBurst play={passed} />

import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../../theme/colors";
import { DURATIONS } from "../../theme/motion";

const PARTICLE_COLORS = [COLORS.success, COLORS.accent, "#FFD166", "#EF476F", "#06D6A0"];
const PARTICLE_COUNT = 8;

function Particle({ angle, play, color }: { angle: number; play: boolean; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!play) return;
    progress.value = 0;
    progress.value = withDelay(
      120,
      withTiming(1, { duration: DURATIONS.celebration, easing: Easing.out(Easing.cubic) })
    );
  }, [play]);

  const distance = 70;
  const rad = (angle * Math.PI) / 180;

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(rad) * distance * progress.value },
      { translateY: Math.sin(rad) * distance * progress.value },
      { scale: 1 - progress.value * 0.5 },
    ],
  }));

  return <Animated.View style={[styles.particle, { backgroundColor: color }, style]} />;
}

export default function SuccessBurst({ play }: { play: boolean }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    if (!play) return;
    scale.value = 0;
    scale.value = withSequence(
      withTiming(1.15, { duration: 260, easing: Easing.out(Easing.back(1.6)) }),
      withTiming(1, { duration: 140, easing: Easing.inOut(Easing.ease) })
    );
  }, [play]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.container, { pointerEvents: "none" }]}>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle
          key={i}
          angle={(360 / PARTICLE_COUNT) * i}
          play={play}
          color={PARTICLE_COLORS[i % PARTICLE_COLORS.length]}
        />
      ))}
      <Animated.View style={[styles.circle, circleStyle]}>
        <Animated.Text style={styles.check}>✓</Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
  },
  particle: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
