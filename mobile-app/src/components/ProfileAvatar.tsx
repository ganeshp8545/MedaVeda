import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { COLORS } from "../theme/colors";
import { SHADOW } from "../theme/shadows";
import { SPACING } from "../theme/spacing";

type Props = {
  name: string;
};

export default function ProfileAvatar({ name }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.letter}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <Text style={styles.name}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 25,
  },

  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOW.glow,
  },

  letter: {
    color: COLORS.textOnPrimary,
    fontSize: 42,
    fontWeight: "bold",
  },

  name: {
    marginTop: SPACING.md,
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.text,
  },
});