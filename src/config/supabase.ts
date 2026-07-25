// IMPORTANT (one-time Expo/RN setup):
//   npm install @supabase/supabase-js react-native-url-polyfill
// and add this as the FIRST line of your app's entry file (App.tsx / index.js):
//   import "react-native-url-polyfill/auto";
// Supabase's client relies on the URL/URLSearchParams APIs, which aren't
// built into React Native's JS engine (Hermes) without this polyfill -
// skipping it causes "URL is not a constructor" crashes on real devices.

import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
// SECURITY FIX: sessions (access_token + long-lived refresh_token) must
// not sit in plaintext AsyncStorage - see secureSessionStorage.ts for why
// and what packages this requires.
import { secureSessionStorage } from "./secureSessionStorage";

const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env (see .env.example)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// BUG FIX ("app logs the student out on its own"): supabase-js's
// autoRefreshToken relies on a JS setInterval timer, which React Native
// pauses/throttles while the app is backgrounded or the device is
// asleep. If the app stays backgrounded past the access token's ~1 hour
// lifetime, the timer never fires the refresh - so when the student
// reopens the app, the access token is expired and every API call
// starts failing with an auth error, which looks exactly like being
// logged out even though the session/refresh_token was never actually
// invalidated or cleared.
//
// Fix (this is Supabase's own documented pattern for React Native): tell
// the client to actively refresh right when the app comes to the
// foreground, and pause the timer while backgrounded (no point burning
// battery refreshing a token nobody's using).
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
