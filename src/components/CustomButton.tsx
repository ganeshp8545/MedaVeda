import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
} from "react-native";

import { COLORS } from "../theme/colors";
import { SPACING } from "../theme/spacing";

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function CustomButton({
  title,
  onPress,
  disabled = false,
}: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      activeOpacity={0.8}
    >
      <Text style={styles.text}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLORS.primary,
    height: 55,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.lg,
  },

  buttonDisabled: {
    opacity: 0.4,
  },

  text: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "600",
  },
});