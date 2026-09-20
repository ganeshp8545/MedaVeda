import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { buildGradientBands } from "../utils/gradient";

type Props = {
  colors: string[];
  direction?: "vertical" | "diagonal";
  style?: any;
};

// Fills its parent (parent must be position:relative, i.e. any normal
// View) with a smooth multi-stop gradient made of thin stacked bands -
// no native gradient module required.
//
// Important: for "diagonal", the skew/rotation is applied ONCE to the
// whole oversized band-stack as a single unit, never per-band. Skewing
// each band individually leaves visible seams/steps between them
// (each thin rectangle shears on its own, so edges no longer line up) -
// that's what caused the "black lines" artifact. Rotating the stack as
// one contiguous surface avoids that entirely.
export default function GradientBackground({ colors, direction = "vertical", style }: Props) {
  // Slightly higher band count + a 1px overlap on each band avoids any
  // hairline gaps between adjacent bands on some renderers.
  const bands = useMemo(() => buildGradientBands(colors, 32), [colors]);

  const stack = (
    <View style={styles.stack}>
      {bands.map((color, i) => (
        <View key={i} style={[styles.band, { backgroundColor: color }]} />
      ))}
    </View>
  );

  if (direction !== "diagonal") {
    return (
      <View style={[StyleSheet.absoluteFill, style, { pointerEvents: "none" }]}>
        {stack}
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip, style, { pointerEvents: "none" }]}>
      <View style={styles.oversized}>{stack}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  // Oversized + rotated as a single block so the rotation never has to
  // cut across a seam between bands - the whole gradient rotates as one
  // continuous image, and the outer clip crops it back to the header's
  // actual rectangle.
  oversized: {
    position: "absolute",
    top: "-25%",
    left: "-15%",
    width: "130%",
    height: "150%",
    transform: [{ rotate: "-4deg" }],
  },
  stack: {
    flex: 1,
    flexDirection: "column",
  },
  band: {
    flex: 1,
    width: "100%",
    marginBottom: -1,
  },
});
