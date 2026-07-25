import React from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/typography";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { NotificationType } from "../services/notificationsService";

type Props = {
  title: string;
  body: string;
  type?: NotificationType;
  read?: boolean;
  onArchive?: () => void;
};

const TYPE_ICON: Record<NotificationType, string> = {
  new_notes: "📘",
  new_video: "🎥",
  offer: "🎉",
  payment_success: "✅",
  exam_reminder: "⏰",
  app_update: "🔄",
};

// NOTIFICATIONS SYSTEM - swipe left to archive (permanently hides it
// from this device's Notification Center - see archiveNotification in
// notificationsService.ts). Swipeable is react-native-gesture-handler's
// built-in component - no extra dependency beyond what the Animation
// System package already installed.
export default function NotificationRow({ title, body, type, read = false, onArchive }: Props) {
  const icon = type ? TYPE_ICON[type] : undefined;

  const content = (
    <View style={[styles.row, read && styles.rowRead]}>
      {icon ? (
        <Text style={styles.icon}>{icon}</Text>
      ) : (
        <View style={[styles.dot, read && styles.dotRead]} />
      )}
      <View style={styles.textBlock}>
        <Text style={[styles.title, read && styles.titleRead]}>{title}</Text>
        {!!body && (
          <Text style={styles.body} numberOfLines={2}>
            {body}
          </Text>
        )}
      </View>
    </View>
  );

  if (!onArchive) return content;

  return (
    <Swipeable
      renderRightActions={() => (
        <TouchableOpacity style={styles.archiveAction} onPress={onArchive} activeOpacity={0.8}>
          <Text style={styles.archiveIcon}>🗄️</Text>
          <Text style={styles.archiveLabel}>Archive</Text>
        </TouchableOpacity>
      )}
      onSwipeableOpen={onArchive}
      overshootRight={false}
    >
      {content}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowRead: {
    opacity: 0.6,
  },
  icon: {
    fontSize: 16,
    marginTop: 2,
    marginRight: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginTop: 6,
    marginRight: SPACING.sm,
  },
  dotRead: {
    backgroundColor: COLORS.border,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.text,
  },
  titleRead: {
    fontWeight: "500",
    color: COLORS.subtitle,
  },
  body: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 2,
  },
  archiveAction: {
    backgroundColor: COLORS.error,
    justifyContent: "center",
    alignItems: "center",
    width: 84,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  archiveIcon: {
    fontSize: 18,
  },
  archiveLabel: {
    fontSize: FONT.tiny,
    color: COLORS.white,
    fontWeight: "700",
    marginTop: 2,
  },
});
