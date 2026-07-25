import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch } from "react-native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/typography";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

import {
  NOTIFICATION_CATEGORIES,
  getNotificationPreferences,
  setNotificationPreference,
} from "../../utils/notificationPreferences";
import { NotificationType } from "../../services/notificationsService";

// NOTIFICATIONS SYSTEM - lets a student mute categories they don't
// want (e.g. turn off "Offers" but keep "Exam Reminders"). Purely
// device-local - see utils/notificationPreferences.ts.
export default function NotificationPreferencesScreen() {
  const [prefs, setPrefs] = useState<Record<NotificationType, boolean> | null>(null);

  useEffect(() => {
    getNotificationPreferences().then(setPrefs);
  }, []);

  async function toggle(type: NotificationType, value: boolean) {
    setPrefs((prev) => (prev ? { ...prev, [type]: value } : prev)); // optimistic
    await setNotificationPreference(type, value);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Notification Preferences</Text>
      <Text style={styles.subtitle}>Choose what you want to hear about</Text>

      {NOTIFICATION_CATEGORIES.map((category) => (
        <View key={category.type} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{category.label}</Text>
            <Text style={styles.rowDescription}>{category.description}</Text>
          </View>
          <Switch
            value={prefs ? prefs[category.type] !== false : true}
            onValueChange={(value) => toggle(category.type, value)}
            trackColor={{ false: COLORS.surfaceMuted, true: COLORS.accent }}
            thumbColor={COLORS.white}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: FONT.title,
    fontWeight: "bold",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginTop: 6,
    marginBottom: SPACING.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  rowText: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  rowTitle: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },
  rowDescription: {
    fontSize: FONT.tiny,
    color: COLORS.subtitle,
    marginTop: 3,
    lineHeight: 16,
  },
});
