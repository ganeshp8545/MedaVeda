// NOTIFICATIONS SYSTEM - per-category preferences.
//
// Device-local (AsyncStorage) - a student turning off "Offers" affects
// only their device, no server round-trip needed. notificationsService's
// fetchNotifications filters against this before returning results, so
// muted categories never show up in the bell badge or Notification
// Center at all.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotificationType } from "../services/notificationsService";

const STORAGE_KEY = "medveda:notifications:preferences";

export const NOTIFICATION_CATEGORIES: { type: NotificationType; label: string; description: string }[] = [
  { type: "new_notes", label: "New Notes", description: "When new PDF notes are added to a chapter you study" },
  { type: "new_video", label: "New Videos", description: "When new video lectures are added" },
  { type: "offer", label: "Offers & Discounts", description: "Sales, bundle offers, limited-time discounts" },
  { type: "payment_success", label: "Payment Updates", description: "Purchase confirmations and receipts" },
  { type: "exam_reminder", label: "Exam Reminders", description: "Upcoming exam and revision reminders" },
  { type: "app_update", label: "App Updates", description: "New features and announcements" },
];

type Preferences = Record<NotificationType, boolean>;

const DEFAULT_PREFERENCES: Preferences = {
  new_notes: true,
  new_video: true,
  offer: true,
  payment_success: true, // kept on by default - a purchase confirmation is not spam
  exam_reminder: true,
  app_update: true,
};

export async function getNotificationPreferences(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function setNotificationPreference(
  type: NotificationType,
  enabled: boolean
): Promise<Preferences> {
  const current = await getNotificationPreferences();
  const updated = { ...current, [type]: enabled };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function isCategoryEnabled(type?: NotificationType): Promise<boolean> {
  if (!type) return true; // untyped notifications (no category) always show
  const prefs = await getNotificationPreferences();
  return prefs[type] !== false;
}
