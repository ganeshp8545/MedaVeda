// Encrypted session storage adapter for the Supabase client.
//
// WHY THIS FILE EXISTS (security fix):
//   The previous config used @react-native-async-storage/async-storage
//   directly as the Supabase `auth.storage`. AsyncStorage is UNENCRYPTED
//   on both platforms:
//     - Android: a plain SQLite DB / files under the app's sandbox,
//       trivially readable on a rooted device or from an adb backup.
//     - iOS: a plain plist/db file, readable from an unencrypted device
//       backup.
//   Supabase's session object contains the access_token (JWT) AND the
//   refresh_token. The refresh_token in particular is long-lived - anyone
//   who copies it off the device can mint fresh sessions indefinitely,
//   even after the user changes their password's session elsewhere.
//
// FIX: encrypt the session blob with a random AES key before it ever
// touches AsyncStorage, and keep ONLY the AES key in expo-secure-store
// (iOS Keychain / Android Keystore - hardware-backed on most devices).
// This is the pattern Supabase's own React Native/Expo guide recommends,
// because SecureStore alone has a ~2KB per-value limit and a Supabase
// session (JWT + refresh_token + user metadata) can exceed that.
//
// REQUIRED PACKAGES (add these - they are not yet in package.json):
//   npx expo install expo-secure-store react-native-get-random-values
//   npm install aes-js
//
// USAGE: in config/supabase.ts, replace
//   import AsyncStorage from "@react-native-async-storage/async-storage";
//   ...
//   auth: { storage: AsyncStorage, ... }
// with
//   import { secureSessionStorage } from "./secureSessionStorage";
//   ...
//   auth: { storage: secureSessionStorage, ... }

import "react-native-get-random-values";
import * as aesjs from "aes-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// expo-secure-store is backed by the iOS Keychain / Android Keystore -
// neither exists in a browser, so the native module simply isn't there
// when this app runs on web (Expo Go "w", or `expo start --web`). That's
// fine: the actual shipped product here is the Android/iOS app (per the
// Play Store readiness requirements), web is just a dev-time convenience
// - so on web we fall back to plain AsyncStorage (same as before this
// fix) instead of crashing. Every native build still gets the full
// SecureStore + AES encryption below.
const isWeb = Platform.OS === "web";

// SecureStore keys must be alphanumeric/./-/_ only - Supabase storage keys
// already satisfy that (e.g. "sb-<project-ref>-auth-token"), but we prefix
// defensively in case that ever changes.
function keyFor(key: string) {
  return `secure-${key}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function encrypt(key: string, value: string): Promise<string> {
  const encryptionKey = crypto.getRandomValues(new Uint8Array(32)); // 256-bit
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

  // The AES key itself lives ONLY in the OS keystore/keychain, never in
  // AsyncStorage - this is what makes the AsyncStorage blob useless on
  // its own.
  await SecureStore.setItemAsync(keyFor(key), aesjs.utils.hex.fromBytes(encryptionKey));

  return aesjs.utils.hex.fromBytes(encryptedBytes);
}

async function decrypt(key: string, value: string): Promise<string | null> {
  const encryptionKeyHex = await SecureStore.getItemAsync(keyFor(key));
  if (!encryptionKeyHex) return null; // key missing -> can't decrypt, treat as "no session"

  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(encryptionKeyHex),
    new aesjs.Counter(1)
  );
  const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
  return aesjs.utils.utf8.fromBytes(decryptedBytes);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return AsyncStorage.getItem(key);

    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await decrypt(key, encrypted);
    } catch {
      // Corrupt/unreadable value (e.g. keystore was cleared) - fail closed
      // by dropping it, rather than throwing and breaking app startup.
      await AsyncStorage.removeItem(key);
      await SecureStore.deleteItemAsync(keyFor(key));
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      await AsyncStorage.setItem(key, value);
      return;
    }

    const encrypted = await encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    if (!isWeb) {
      await SecureStore.deleteItemAsync(keyFor(key));
    }
  },
};
