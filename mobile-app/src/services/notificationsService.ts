import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "../config/supabase";
import { isCategoryEnabled } from "../utils/notificationPreferences";
import { logDebug } from "../utils/logger";

export type NotificationType =
  | "new_notes"
  | "new_video"
  | "offer"
  | "payment_success"
  | "exam_reminder"
  | "app_update";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type?: NotificationType;
  createdAt?: number;
}

// Reads the "notifications" table (rows with { title, body, active,
// created_at }) if the admin panel has created any. Fails soft - the
// Notifications section on the dashboard should never block the rest of
// the screen from loading.
export async function fetchNotifications(): Promise<AppNotification[]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const all = (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title ?? "Update",
      body: row.body ?? "",
      type: row.type as NotificationType | undefined,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
    }));

    // NOTIFICATIONS SYSTEM - respect per-category mute preferences. A
    // student who turned off "Offers" should never see them here, in
    // the unread count, or the bell badge.
    const enabledFlags = await Promise.all(all.map((item) => isCategoryEnabled(item.type)));
    return all.filter((_, i) => enabledFlags[i]);
  } catch (error) {
    logDebug("fetchNotifications: no notifications available yet", error);
    return [];
  }
}

// Read state is purely local (per-device) - unchanged from the Firebase
// version.
const READ_IDS_KEY = "medveda:notifications:readIds";
// NOTIFICATIONS SYSTEM - archived (swiped away) notifications, also
// local-only. Archived items are permanently hidden from this device's
// Notification Center, same mental model as archiving an email.
const ARCHIVED_IDS_KEY = "medveda:notifications:archivedIds";

async function getArchivedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVED_IDS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function archiveNotification(id: string): Promise<void> {
  const archived = await getArchivedIds();
  archived.add(id);
  await AsyncStorage.setItem(ARCHIVED_IDS_KEY, JSON.stringify([...archived]));
}

async function getReadIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(READ_IDS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch (error) {
    logDebug("getReadIds failed:", error);
    return new Set();
  }
}

export async function fetchNotificationsWithReadState(): Promise<{
  notifications: (AppNotification & { read: boolean })[];
}> {
  const [notifications, readIds, archivedIds] = await Promise.all([
    fetchNotifications(),
    getReadIds(),
    getArchivedIds(),
  ]);

  return {
    notifications: notifications
      .filter((item) => !archivedIds.has(item.id))
      .map((item) => ({
        ...item,
        read: readIds.has(item.id),
      })),
  };
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  const readIds = await getReadIds();
  ids.forEach((id) => readIds.add(id));
  await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...readIds]));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { notifications } = await fetchNotificationsWithReadState();
  return notifications.filter((item) => !item.read).length;
}
