import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
} from "react-native";

import { COLORS } from "../theme/colors";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  isCorrect?: boolean;
  isWrong?: boolean;
};

export default function OptionCard({
  title,
  onPress,
  disabled = false,
  isCorrect = false,
  isWrong = false,
}: Props) {

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

  return (

  <TouchableOpacity
  activeOpacity={0.85}
  style={[styles.card, { backgroundColor, borderColor }]}
  onPress={onPress}
  disabled={disabled}
  >
      <Text
        style={[
          styles.text,
          (isCorrect || isWrong) && {
            color: COLORS.textOnPrimary,
          },
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: RADIUS.md,
    marginBottom: 15,
    borderWidth: 1,
    ...SHADOW.card,
  },

  text: {
    fontSize: 17,
    color: COLORS.text,
    fontWeight: "600",
  },
});
