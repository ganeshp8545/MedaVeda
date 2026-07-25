import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";

import {
  getStudyReminderSettings,
  enableStudyReminder,
  disableStudyReminder,
  isStudyReminderSupported,
} from "../../services/studyReminderService";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";
import { SHADOW } from "../../theme/shadows";

function formatTime(hour: number, minute: number) {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = minute.toString().padStart(2, "0");
  return `${displayHour}:${displayMinute} ${period}`;
}

export default function StudyReminderScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(19);
  const [minute, setMinute] = useState(0);

  const [showPicker, setShowPicker] = useState(false);
  const supported = isStudyReminderSupported();

  useEffect(() => {
    getStudyReminderSettings()
      .then((settings) => {
        setEnabled(settings.enabled);
        setHour(settings.hour);
        setMinute(settings.minute);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(value: boolean) {
    if (!supported) {
      Alert.alert(
        "Not Available in Expo Go",
        "As of Expo SDK 53, notifications require a development build - this can't run inside the Expo Go app. Ask whoever built this app for a development build to test this feature."
      );
      return;
    }

    setSaving(true);

    if (value) {
      const result = await enableStudyReminder(hour, minute);

      if (!result.success && result.permissionDenied) {
        Alert.alert(
          "Notifications Disabled",
          "Please allow notifications for MedVeda in your phone's Settings to receive the daily study reminder.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        setSaving(false);
        return;
      }

      setEnabled(true);
    } else {
      await disableStudyReminder();
      setEnabled(false);
    }

    setSaving(false);
  }

  async function handleTimeChange(event: any, selectedDate?: Date) {
    setShowPicker(Platform.OS === "ios");

    if (!selectedDate) return;

    const newHour = selectedDate.getHours();
    const newMinute = selectedDate.getMinutes();

    setHour(newHour);
    setMinute(newMinute);

    // If the reminder is already on, re-schedule it immediately at the
    // new time rather than waiting for a separate "Save" step.
    if (enabled) {
      setSaving(true);
      await enableStudyReminder(newHour, newMinute);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  const pickerValue = new Date();
  pickerValue.setHours(hour, minute, 0, 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⏰ Study Reminder</Text>
      <Text style={styles.subtitle}>
        A daily notification to keep your revision on track - this works
        entirely on your device, so it still arrives even if your phone is
        offline.
      </Text>

      {!supported && (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            ⚠️ Not available in Expo Go. As of SDK 53, notifications need a
            development build to run - this will work once the app is
            installed that way instead.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Daily Reminder</Text>
            <Text style={styles.rowSubtitle}>
              {enabled ? "On" : "Off"}
            </Text>
          </View>

          {saving ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              disabled={!supported}
              trackColor={{ false: COLORS.border, true: COLORS.accent }}
              thumbColor={COLORS.white}
            />
          )}
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => setShowPicker(true)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Reminder Time</Text>
            <Text style={styles.rowSubtitle}>Tap to change</Text>
          </View>

          <View style={styles.timeBadge}>
            <Text style={styles.timeBadgeText}>{formatTime(hour, minute)}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <DateTimePicker
          value={pickerValue}
          mode="time"
          is24Hour={false}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleTimeChange}
        />
      )}

      {Platform.OS === "ios" && showPicker && (
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => setShowPicker(false)}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    paddingTop: 60,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
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
    marginBottom: SPACING.xl,
    lineHeight: 21,
  },
  noticeBox: {
    backgroundColor: `${COLORS.warning}22`,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: -SPACING.lg,
    marginBottom: SPACING.lg,
  },
  noticeText: {
    fontSize: FONT.small,
    color: COLORS.text,
    lineHeight: 19,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    ...SHADOW.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.lg,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  rowTitle: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: COLORS.text,
  },
  rowSubtitle: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    marginTop: 2,
  },
  timeBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timeBadgeText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: FONT.small,
  },
  doneButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  doneButtonText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: FONT.body,
  },
});
