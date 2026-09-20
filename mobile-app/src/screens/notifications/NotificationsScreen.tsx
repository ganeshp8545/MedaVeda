import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";

import { useFocusEffect, useNavigation } from "@react-navigation/native";

import NotificationRow from "../../components/NotificationRow";
import EmptyState from "../../components/EmptyState";
import ErrorState from "../../components/ErrorState";

import {
  fetchNotificationsWithReadState,
  markAllNotificationsRead,
  archiveNotification,
  AppNotification,
} from "../../services/notificationsService";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/typography";
import { SPACING } from "../../theme/spacing";

// Roadmap change 9 - Notification Center: a single screen for every
// broadcast notification (New Notes, App Updates, Offers, Payment
// Success, Exam Reminders), replacing the need to hunt across the app
// for what's new. Reached by tapping the NotificationBell in HomeHeader.
//
// NOTIFICATIONS SYSTEM additions: swipe left on any row to archive it
// permanently, and a gear icon to reach per-category mute preferences.
export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<(AppNotification & { read: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchNotificationsWithReadState()
      .then(async ({ notifications: items }) => {
        setNotifications(items);
        if (items.some((item) => !item.read)) {
          await markAllNotificationsRead(items.map((item) => item.id));
          setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
        }
      })
      .catch((err) => {
        console.error("Failed to load notifications:", err);
        setError("Could not load notifications. Please try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleArchive(id: string) {
    // Optimistic - archive locally instantly, persist in the background.
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    await archiveNotification(id);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>New Notes, Videos, Offers & Reminders</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => navigation.navigate("NotificationPreferences")}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} style={styles.loader} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: SPACING.xl }}
          renderItem={({ item }) => (
            <NotificationRow
              title={item.title}
              body={item.body}
              type={item.type}
              read={item.read}
              onArchive={() => handleArchive(item.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState title="🔔 No notifications yet. New Notes, Offers, and Reminders will show up here." />
          }
        />
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.lg,
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
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingsIcon: {
    fontSize: 17,
  },
  loader: {
    marginTop: 40,
  },
});
