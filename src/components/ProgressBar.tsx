import React from "react";
import { View, StyleSheet } from "react-native";

import { COLORS } from "../theme/colors";

type Props = {
  progress: number;
};

export default function ProgressBar({ progress }: Props) {
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.progress,
          {
            width: `${progress}%`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 10,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 25,
  },

  progress: {
    height: "100%",
    backgroundColor: COLORS.accent,
  },
});
