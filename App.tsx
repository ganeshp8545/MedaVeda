import React, { useEffect } from "react";
import { Platform } from "react-native";
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
        const token = await registerForPushNotifications(getCurrentUser());

        console.log("Expo Push Token:", token);
      } catch (err) {
        console.error("App initialization error:", err);
      }
    };

    initializeApp();

    return () => {
      stopSyncEngine();
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