import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from "react-native";

import { COLORS } from "../theme/colors";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";
import { SPACING } from "../theme/spacing";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Elevated "floating card" look used on the Home screen. Visual only -
   * default behavior for every other screen is unchanged. */
  floating?: boolean;
  editable?: boolean;
  /** Global Search System - focuses the input the instant the screen
   * mounts, so typing can start with zero extra taps. Off by default so
   * every other existing call site (Home, Chapters, Store...) is unaffected. */
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  /** Shows a small × to clear the field once there's text - optional so
   * screens that don't pass it keep the plain look they already have. */
  onClear?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function SearchBar({
  value,
  onChangeText,
  placeholder = "Search...",
  floating = false,
  editable = true,
  autoFocus = false,
  onSubmitEditing,
  onClear,
  style,
}: Props) {
  return (
    <View style={[styles.container, floating && styles.containerFloating, style]}>
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
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        style={styles.input}
      />

      {!!onClear && value.length > 0 && (
        <TouchableOpacity
          onPress={onClear}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Text style={styles.clearIcon}>✕</Text>
        </TouchableOpacity>
      )}
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
    marginBottom: SPACING.lg,
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
    marginRight: SPACING.sm,
  },

  iconWrapFloating: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: `${COLORS.accent}1F`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.sm,
  },

  icon: {
    fontSize: 16,
  },

  clearIcon: {
    fontSize: 14,
    color: COLORS.subtitle,
    marginLeft: SPACING.sm,
    paddingLeft: 2,
  },

  input: {
    flex: 1,
    height: 54,
    fontSize: 15,
    color: COLORS.text,
  },
});
