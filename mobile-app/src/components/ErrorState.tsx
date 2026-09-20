import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { COLORS } from "../theme/colors";
import { SPACING } from "../theme/spacing";

type Props = {
  message: string;
  onRetry?: () => void;
};

export default function ErrorState({
  message,
  onRetry,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>
        ⚠️
      </Text>

      <Text style={styles.message}>
        {message}
      </Text>

      {onRetry && (
        <TouchableOpacity
          style={styles.button}
          onPress={onRetry}
        >
          <Text style={styles.buttonText}>
            Try Again
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 70,
    alignItems: "center",
  },

  icon: {
    fontSize: 55,
  },

  message: {
    marginTop: SPACING.md,
    fontSize: 18,
    color: COLORS.text,
    textAlign: "center",
  },

  button: {
    marginTop: 25,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 10,
  },

  buttonText: {
    color: COLORS.white,
    fontWeight: "bold",
  },
});