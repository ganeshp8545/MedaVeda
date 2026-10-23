// Supabase doesn't expose a synchronous "auth.currentUser" like Firebase
// did. This tiny module recreates that convenience: it keeps an in-memory
// copy of the current user, kept fresh by Supabase's own auth listener,
// so screens that used to read `auth.currentUser` directly can just call
// `getCurrentUser()` instead with no other changes to their logic.
import type { User } from "@supabase/supabase-js";
import { supabase } from "../config/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerForPushNotifications, unregisterCurrentDeviceToken } from "./pushNotifications";
import { logDebug } from "../utils/logger";

let currentUser: User | null = null;

// Paid notes are saved on the device for offline reading. They belong to whoever downloaded
// them: they are wiped on every sign-out (Logout, blocked, session ended, account deletion),
// and also when a DIFFERENT account signs in on a device that still has another account's
// files (e.g. after a reinstall-less session loss), so a second student on a shared phone
// can never open the first student's purchases.
const OFFLINE_OWNER_KEY = "medveda:offline-owner";

async function purgeOfflineContent(): Promise<boolean> {
  try {
    // Loaded lazily: downloadManager pulls in course state, which imports this module.
    const { clearAllDownloads } = await import("../utils/downloadManager");
    await clearAllDownloads();
    return true;
  } catch (err) {
    logDebug("purgeOfflineContent failed:", err);
    return false;
  }
}

async function claimOfflineStorage(user: User): Promise<void> {
  try {
    const owner = await AsyncStorage.getItem(OFFLINE_OWNER_KEY);
    if (owner && owner !== user.id && !await purgeOfflineContent()) return;
    if (owner !== user.id) await AsyncStorage.setItem(OFFLINE_OWNER_KEY, user.id);
  } catch {
    // storage unavailable: nothing to protect or claim
  }
}

/**
 * The one way the app signs a student out: stops pushes to this device for them, ends the
 * session, then deletes the offline copies of paid content.
 */
export async function performSignOut(): Promise<void> {
  try {
    await unregisterCurrentDeviceToken(); // needs the session, so before signOut
  } catch {
    // never block a logout on push cleanup
  }
  currentUser = null;
  await supabase.auth.signOut();
  if (await purgeOfflineContent())
    await AsyncStorage.removeItem(OFFLINE_OWNER_KEY).catch(() => {});
}

// BUG FIX: registerForPushNotifications() existed in pushNotifications.ts
// but was never actually called from anywhere in the app, so no device
// ever saved an Expo Push Token into the `push_tokens` table - hence the
// admin panel always showing "Notification sent to 0 device(s)". This
// module is the single place that already tracks every transition into
// a signed-in state (both "already logged in at app startup" via
// getSession() below, and "just logged in" via onAuthStateChange), so
// it's the correct place to trigger registration exactly once per user
// per app session. registerForPushNotifications() itself upserts on the
// unique `expo_push_token` column, so this is also safe against
// duplicate token rows even if called again later.
let pushRegisteredForUserId: string | null = null;
function maybeRegisterForPush(user: User | null): void {
  if (!user || pushRegisteredForUserId === user.id) return;
  pushRegisteredForUserId = user.id;
  registerForPushNotifications(user);
}

// BUG FIX: the admin panel has a "Block User" toggle (profiles.blocked)
// but nothing in the mobile app ever read that column - an admin
// blocking a problematic/abusive account did literally nothing, the
// student could keep browsing, downloading, and purchasing normally.
// This listener runs on every login and session restore; a blocked
// account is signed out immediately and every screen listening via
// onBlockedSignOut() gets a chance to show why.
type BlockedListener = () => void;
const blockedListeners = new Set<BlockedListener>();
export function onBlockedSignOut(fn: BlockedListener): () => void {
  blockedListeners.add(fn);
  return () => blockedListeners.delete(fn);
}

async function enforceNotBlocked(user: User): Promise<void> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("blocked")
    .eq("id", user.id)
    .maybeSingle();

  // Fail open on a network/lookup error - a transient failure here
  // should not lock a legitimate student out of the app. A genuinely
  // blocked user will be caught again on their next session refresh.
  if (error || !profile?.blocked) return;

  await performSignOut();
  blockedListeners.forEach((fn) => fn());
}

supabase.auth
  .getSession()
  .then(({ data }) => {
    currentUser = data.session?.user ?? null;
    if (currentUser) {
      claimOfflineStorage(currentUser);
      enforceNotBlocked(currentUser).catch(() => {});
    }
    maybeRegisterForPush(currentUser);
  })
  .catch((err) => logDebug("getSession failed:", err));

supabase.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user ?? null;
  if (event === "SIGNED_OUT") purgeOfflineContent();
  if (currentUser) {
    claimOfflineStorage(currentUser);
    enforceNotBlocked(currentUser).catch(() => {});
  }
  maybeRegisterForPush(currentUser);
});

export function getCurrentUser(): User | null {
  return currentUser;
}

// Firebase's User had `.displayName`; Supabase stores that in
// `user_metadata.name` (set at signup - see RegisterScreen). This helper
// reads it the same way `.displayName` used to be read.
export function getCurrentUserDisplayName(): string | undefined {
  return currentUser?.user_metadata?.name;
}