import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Platform, Text, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AppNavigator from "./src/navigation/AppNavigator";
import UpdateRequiredScreen from "./src/screens/update/UpdateRequiredScreen";
import MaintenanceScreen from "./src/screens/maintenance/MaintenanceScreen";
import useMaintenanceMode from "./src/hooks/useMaintenanceMode";
import useForceUpdate from "./src/hooks/useForceUpdate";

import { initDatabase } from "./src/config/database";
import { recoverInterruptedDownloads, removeLegacyOfflineQuizzes } from "./src/utils/downloadManager";

import {
  startSyncEngine,
  stopSyncEngine,
} from "./src/services/syncEngine";

import { registerForPushNotifications } from "./src/services/pushNotifications";
import { getCurrentUser } from "./src/services/authState";
import { supabase } from "./src/config/supabase";
import { restorePlayPurchases } from "./src/services/playBillingService";
import { paymentProvider } from "./src/config/paymentProvider";
import { logError } from "./src/utils/logger";

export default function App() {
  // Force-update gate: checked on launch and on every resume; fails open.
  const update = useForceUpdate();
  const maintenance = useMaintenanceMode();
  const [ready, setReady] = useState(Platform.OS === "web");
  const [startupError, setStartupError] = useState(false);

  const initializeApp = useCallback(async () => {
    setStartupError(false);
    try {
      initDatabase();
      await removeLegacyOfflineQuizzes();
      recoverInterruptedDownloads();
      startSyncEngine();
      setReady(true);

      // Push registration is optional and must not block a successful cleanup.
      void registerForPushNotifications(getCurrentUser()).catch((err) => {
        logError("Push registration failed", err);
      });
    } catch (err) {
      logError("App initialization failed", err);
      setStartupError(true);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    void initializeApp();

    return () => {
      stopSyncEngine();
    };
  }, [initializeApp]);

  useEffect(() => {
    if (Platform.OS !== "android" || paymentProvider !== "play") return;
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
      <StatusBar style="light" />
      {!ready ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#100C0A", padding: 24 }}>
          {startupError ? (
            <>
              <Text style={{ color: "white", textAlign: "center", marginBottom: 20 }}>Could not prepare offline content. Please try again.</Text>
              <TouchableOpacity onPress={() => void initializeApp()} accessibilityRole="button">
                <Text style={{ color: "white" }}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : <ActivityIndicator size="large" color="white" />}
        </View>
      ) : maintenance.enabled !== false ? (
        <MaintenanceScreen checking={maintenance.checking} retry={maintenance.retry} />
      ) : update?.required ? (
        <UpdateRequiredScreen storeUrl={update.storeUrl} />
      ) : (
        <AppNavigator />
      )}
    </SafeAreaProvider>
  );
}
