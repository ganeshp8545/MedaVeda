import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
// Type-only import: fully erased by the compiler, so this never triggers
// an actual `require("expo-notifications")` at runtime - safe to keep
// unconditional even though the value import below is not.
import type * as ExpoNotifications from "expo-notifications";

// Fully on-device: a daily repeating LOCAL notification scheduled by the
// OS itself (Notifications.scheduleNotificationAsync with a
// calendar-style repeating trigger). This is deliberately NOT a server /
// push notification - once scheduled, it fires at the chosen time every
// day even if the phone has no internet connection and the app is fully
// closed, because Android/iOS themselves own the schedule, not our app.
const STORAGE_KEY = "studyReminder:settings";
const NOTIFICATION_ID_KEY = "studyReminder:notificationId";

export interface StudyReminderSettings {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
}

const DEFAULT_SETTINGS: StudyReminderSettings = {
  enabled: false,
  hour: 19,
  minute: 0,
};

// As of Expo SDK 53, Expo Go on Android throws
// "[runtime not ready]: Error: expo-notifications: Android Push
// notifications... removed from Expo Go" the moment the module
// initializes - NOT when a specific push function is called, but as a
// side effect of the module's own top-level setup code running during
// `require("expo-notifications")`. This happens purely from importing
// the module on Android in Expo Go, even though this file only ever
// uses LOCAL scheduled notifications and never touches push/remote APIs
// at all.
//
// A static `import * as Notifications from "expo-notifications"` is
// evaluated unconditionally the moment this file loads, which is exactly
// what crashed the whole app on launch. The fix is to make that load
// conditional: only `require()` the module (a lazy, in-place call) when
// we're NOT running inside classic Expo Go, so the crashing top-level
// code never executes there at all. Everything in this file that touches
// `Notifications` guards against it being null.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: typeof ExpoNotifications | null = null;
if (!isExpoGo) {
  // @ts-ignore - `require` is a real global provided by Metro at runtime;
  // this is only ever reached on native, never bundled for a context
  // without it. Using require() (not `import`) here is deliberate - see
  // the comment above.
  Notifications = require("expo-notifications");

  // Notifications must be configured to actually show a banner/alert
  // while the app is in the foreground too - by default Expo swallows
  // them silently in that case, which used to make it look "not
  // working" when tested with the app open.
  if (Notifications) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
}

// Lets the Study Reminder screen (and anywhere else) show "requires a
// development build" instead of a toggle that silently does nothing -
// this is a genuine Expo Go platform limitation, not something fixable
// from JS, until the app is run from a development build instead.
export function isStudyReminderSupported(): boolean {
  return !isExpoGo;
}

export async function getStudyReminderSettings(): Promise<StudyReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    console.error("Failed to read study reminder settings:", err);
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(settings: StudyReminderSettings) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

async function requestPermission(): Promise<boolean> {
  if (!Notifications) return false;

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// Cancels whatever was scheduled before, so toggling the time never
// leaves two reminders firing at once.
async function cancelScheduledReminder() {
  if (!Notifications) return;

  const existingId = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (existingId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    } catch {
      // already fired / already cancelled - fine to ignore
    }
    await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
  }
}

// Turns the reminder on (or updates its time) and persists the choice so
// it can be re-applied on the next app launch (Android in particular can
// drop exact alarms across a device reboot).
export async function enableStudyReminder(
  hour: number,
  minute: number
): Promise<{ success: boolean; permissionDenied?: boolean; unsupported?: boolean }> {
  if (!Notifications) {
    return { success: false, unsupported: true };
  }

  const granted = await requestPermission();
  if (!granted) {
    return { success: false, permissionDenied: true };
  }

  await cancelScheduledReminder();

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "📚 Time to study!",
      body: "A few minutes of revision now keeps everything fresh for the exam.",
      sound: true,
    },
    trigger: {
      hour,
      minute,
      repeats: true,
      ...(Platform.OS === "android" ? { channelId: "study-reminders" } : {}),
    } as ExpoNotifications.CalendarTriggerInput,
  });

  await AsyncStorage.setItem(NOTIFICATION_ID_KEY, notificationId);
  await saveSettings({ enabled: true, hour, minute });

  return { success: true };
}

export async function disableStudyReminder() {
  await cancelScheduledReminder();
  const current = await getStudyReminderSettings();
  await saveSettings({ ...current, enabled: false });
}

// Called once on app launch. If the reminder was left "on" from a
// previous session, this re-schedules it - the actual daily trigger is
// owned by the OS and survives app restarts on its own, but re-applying
// it here is a cheap safety net against the rare cases (mainly Android
// after a device reboot) where the OS drops it.
export async function restoreStudyReminderOnLaunch() {
  if (!Notifications) return;

  const settings = await getStudyReminderSettings();
  if (!settings.enabled) return;

  const existingId = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (existingId) {
    const stillScheduled = (
      await Notifications.getAllScheduledNotificationsAsync()
    ).some((n) => n.identifier === existingId);
    if (stillScheduled) return;
  }

  await enableStudyReminder(settings.hour, settings.minute);
}

// Android requires a notification channel to be created before a
// notification can be shown on it (Android 8+).
export async function setupNotificationChannel() {
  if (Platform.OS !== "android" || !Notifications) return;

  await Notifications.setNotificationChannelAsync("study-reminders", {
    name: "Study Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}
