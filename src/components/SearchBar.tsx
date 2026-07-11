import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
} from "react-native";

import { COLORS } from "../theme/colors";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Elevated "floating card" look used on the Home screen. Visual only -
   * default behavior for every other screen is unchanged. */
  floating?: boolean;
  editable?: boolean;
};

export default function SearchBar({
  value,
  onChangeText,
  placeholder = "Search...",
  floating = false,
  editable = true,
}: Props) {
  return (
    <View style={[styles.container, floating && styles.containerFloating]}>
      <View style={[styles.iconWrap, floating && styles.iconWrapFloating]}>
        <Text style={styles.icon}>🔍</Text>
      </View>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.subtitle}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        editable={editable}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    ...SHADOW.raised,
  },

  containerFloating: {
    borderColor: `${COLORS.accent}33`,
    ...SHADOW.raised,
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 10,
  },

  iconWrap: {
    marginRight: 10,
  },

  iconWrapFloating: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: `${COLORS.accent}1F`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  icon: {
    fontSize: 16,
  },

  input: {
    flex: 1,
    height: 54,
    fontSize: 15,
    color: COLORS.text,
  },
});
