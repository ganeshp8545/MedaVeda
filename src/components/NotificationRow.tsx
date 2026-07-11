import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import { FONT } from "../theme/fonts";
import { SPACING } from "../theme/spacing";
import { RADIUS } from "../theme/radius";
import { NotificationType } from "../services/notificationsService";

type Props = {
  title: string;
  body: string;
  type?: NotificationType;
};

const TYPE_ICON: Record<NotificationType, string> = {
  new_notes: "📘",
  new_video: "🎥",
  offer: "🎉",
  payment_success: "✅",
  exam_reminder: "⏰",
  app_update: "🔄",
};

export default function NotificationRow({ title, body, type }: Props) {
  const icon = type ? TYPE_ICON[type] : undefined;

  return (
    <View style={styles.row}>
      {icon ? (
        <Text style={styles.icon}>{icon}</Text>
      ) : (
        <View style={styles.dot} />
      )}
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {!!body && (
          <Text style={styles.body} numberOfLines={2}>
            {body}
          </Text>
        )}
      </View>
    </View>
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
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: FONT.small,
    fontWeight: "700",
    color: COLORS.text,
  },
  body: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 2,
  },
});
