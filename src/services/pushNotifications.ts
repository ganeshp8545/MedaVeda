// NOTIFICATIONS SYSTEM - push token registration.
//
// Gets this device's Expo push token and saves it against the signed-in
// user in Supabase, so a backend process (the send-push-notification
// Edge Function, or the admin panel once it has a broadcast composer)
// can reach this device even when the app is fully closed - the one
// thing the existing pull-based "notifications" table + local study
// reminder can't do.
//
// Same Expo Go guard as studyReminderService.ts: expo-notifications'
// Android push APIs are unavailable in Expo Go (SDK 53+), so this
// entire flow is skipped there and only runs in a real dev/production
// build. Safe to call unconditionally from App.tsx.

import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type * as ExpoNotifications from "expo-notifications";

import { supabase } from "../config/supabase";
import type { User } from "@supabase/supabase-js";

// Push is unsupported in Expo Go (SDK 53+) and on web (no vapidPublicKey).
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Platform.OS === "web";

let Notifications: typeof ExpoNotifications | null = null;
if (!isExpoGo) {
  // @ts-ignore - see studyReminderService.ts for why require() (not
  // `import`) is used here.
  Notifications = require("expo-notifications");
}

/**
 * Requests permission, gets this device's Expo push token, and upserts
 * it to the `push_tokens` table. Call once at app startup (after the
 * user is signed in) - safe to call on every launch, it's an upsert.
 */
export async function registerForPushNotifications(user: User | null): Promise<string | null> {
  if (isExpoGo || !Notifications) {
    console.log("Push notifications unavailable in Expo Go/web - skipping registration.");
    return null;
  }

  if (!user) return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission denied.");
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;

    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" }
    );
    if (error) throw error;

    return token;
  } catch (err) {
    console.error("Failed to register for push notifications:", err);
    return null;
  }
}

/** Call on logout so a shared/reset device stops receiving this user's pushes. */
export async function unregisterCurrentDeviceToken(): Promise<void> {
  if (isExpoGo || !Notifications) return;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    await supabase.from("push_tokens").delete().eq("expo_push_token", tokenResponse.data);
  } catch (err) {
    console.error("Failed to unregister push token:", err);
  }
}

/**
 * Sets up a listener for taps on a push notification (including one
 * that launched the app from a killed state) and deep-links into the
 * relevant screen based on the notification's `data` payload.
 * Call once from App.tsx with the navigation ref.
 */
export function setupNotificationResponseListener(
  navigate: (screen: string, params?: Record<string, unknown>) => void
): () => void {
  if (isExpoGo || !Notifications) return () => {};

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    if (!data?.screen) return;
    navigate(data.screen as string, data.params as Record<string, unknown> | undefined);
  });

  return () => subscription.remove();
}
