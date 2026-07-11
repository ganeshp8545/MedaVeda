import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { SHADOW } from "../theme/shadows";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Uses the error color for the confirm button - for destructive actions like Logout/Delete. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Themed replacement for the OS-native Alert.alert() confirmation prompts,
// so destructive actions (logout, delete, etc.) match the app's premium
// dark-surface / rounded-card design system instead of looking like a
// plain system dialog.
export default function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Swallow taps on the card itself so they don't dismiss the dialog */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>

          {!!message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                destructive ? styles.destructiveButton : styles.confirmButton,
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },

  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    ...SHADOW.raised,
  },

  title: {
    fontSize: FONT.subHeading,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },

  message: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginBottom: SPACING.lg,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  button: {
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RADIUS.md,
    marginLeft: SPACING.sm,
  },

  cancelButton: {
    backgroundColor: COLORS.surfaceMuted,
  },

  confirmButton: {
    backgroundColor: COLORS.accent,
  },

  destructiveButton: {
    backgroundColor: COLORS.error,
  },

  cancelText: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: FONT.body,
  },

  confirmText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: FONT.body,
  },
});
