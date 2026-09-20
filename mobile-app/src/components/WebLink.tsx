import React from "react";
import { Alert, Linking, StyleProp, Text, TextStyle, TouchableOpacity } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { logError } from "../utils/logger";

type Props = {
  label: string;
  url: string;
  style?: StyleProp<TextStyle>;
};

// Tappable text that opens a web page (or mailto:/tel: link) outside the app.
export default function WebLink({ label, url, style }: Props) {
  const open = async () => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      logError("Failed to open link", error);
      Alert.alert("Error", "Could not open the link.");
    }
  };

  return (
    <TouchableOpacity onPress={open} accessibilityRole="link" style={{ paddingVertical: SPACING.xs }}>
      <Text style={[{ fontSize: FONT.body, color: COLORS.accentLight, textDecorationLine: "underline" }, style]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
