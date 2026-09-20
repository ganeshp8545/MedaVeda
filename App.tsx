import React, { useEffect } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./src/navigation/AppNavigator";
import UpdateRequiredScreen from "./src/screens/update/UpdateRequiredScreen";
import useForceUpdate from "./src/hooks/useForceUpdate";
import { initDatabase } from "./src/config/database";
import { recoverInterruptedDownloads } from "./src/utils/downloadManager";
import { startSyncEngine, stopSyncEngine } from "./src/services/syncEngine";



export default function App() {
  // Force-update gate: checked on launch and on every resume; fails open.
  const update = useForceUpdate();

  // OFFLINE MODE bootstrap - native only. expo-sqlite's web build needs
  // SharedArrayBuffer (cross-origin-isolation headers the Expo web dev
  // server doesn't set by default), so we skip it on web - this is a
  // mobile-first app, web is just a dev preview, and Offline Mode has no
  // meaning in a browser tab anyway.
  useEffect(() => {
    if (Platform.OS === "web") return;

    initDatabase();
    recoverInterruptedDownloads();
    startSyncEngine();

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
