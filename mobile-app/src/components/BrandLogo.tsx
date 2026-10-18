import React from "react";
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  size: number;
  variant?: "mark" | "lockup" | "header";
  maxWidth?: number;
  style?: StyleProp<ViewStyle & ImageStyle>;
  accessibilityLabel?: string;
};

const MARK = require("../../assets/adaptive-icon.png");
const LOCKUP = require("../../assets/icon.png");
const HEADER_LOCKUP = require("../../assets/branding/medveda-header-logo.png");
const HEADER_ASPECT_RATIO = 1200 / 280;

export default function BrandLogo({
  size, variant = "mark", maxWidth, style, accessibilityLabel = "MedVeda logo",
}: Props) {
  if (variant === "header") {
    const width = Math.min(size * HEADER_ASPECT_RATIO, maxWidth ?? Number.POSITIVE_INFINITY);
    return (
      <Image
        source={HEADER_LOCKUP}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={[{ width, height: width / HEADER_ASPECT_RATIO }, style]}
      />
    );
  }

  if (variant === "lockup") {
    return (
      <View
        style={[{ width: size, height: size }, style]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        <Image source={LOCKUP} style={{ width: size, height: size }} resizeMode="contain" />
      </View>
    );
  }

  // The existing adaptive artwork has transparent margins. A modest zoom
  // increases the visible mark while retaining its full edges and aspect.
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[{ width: size, height: size, overflow: "hidden" }, style]}
    >
      <Image
        source={MARK}
        resizeMode="contain"
        style={{ width: size * 1.2, height: size * 1.2, left: -size * 0.1, top: -size * 0.1 }}
      />
    </View>
  );
}
