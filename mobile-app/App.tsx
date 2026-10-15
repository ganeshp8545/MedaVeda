import React, { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AppNavigator from "./src/navigation/AppNavigator";
import UpdateRequiredScreen from "./src/screens/update/UpdateRequiredScreen";
import useForceUpdate from "./src/hooks/useForceUpdate";

import { initDatabase } from "./src/config/database";
import { recoverInterruptedDownloads } from "./src/utils/downloadManager";

import {
  startSyncEngine,
  stopSyncEngine,
} from "./src/services/syncEngine";

import { registerForPushNotifications } from "./src/services/pushNotifications";
import { getCurrentUser } from "./src/services/authState";
import { supabase } from "./src/config/supabase";
import { restorePlayPurchases } from "./src/services/playBillingService";
import { logError } from "./src/utils/logger";

export default function App() {
  // Force-update gate: checked on launch and on every resume; fails open.
  const update = useForceUpdate();

  useEffect(() => {
    if (Platform.OS === "web") return;

    const initializeApp = async () => {
      try {
        await initDatabase();
        await recoverInterruptedDownloads();
        startSyncEngine();

        // Register this device for push notifications
        await registerForPushNotifications(getCurrentUser());
      } catch (err) {
        logError("App initialization failed", err);
      }
    };

    initializeApp();

    return () => {
      stopSyncEngine();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    // Play can complete a pending purchase after this screen or process is
    // gone. Restore unconsumed purchases on login, launch and app resume.
    const restore = () => { void restorePlayPurchases().catch(() => {}); };
    restore();
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") restore();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") restore();
    });
    return () => {
      auth.subscription.unsubscribe();
      app.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {update?.required ? (
        <UpdateRequiredScreen storeUrl={update.storeUrl} />
      ) : (
        <AppNavigator />
      )}
    </SafeAreaProvider>
  );
}
