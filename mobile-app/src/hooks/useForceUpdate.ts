import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import { checkForRequiredUpdate, UpdateStatus } from "../services/appConfigService";

// Runs the update check on mount (launch) and whenever the app returns to the
// foreground. Renders nothing itself; the caller swaps in UpdateRequiredScreen
// when `required` is true. Never blocks the app while the check is pending.
export default function useForceUpdate(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let alive = true;
    const run = () => {
      checkForRequiredUpdate().then((s) => {
        if (alive) setStatus(s);
      });
    };

    run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return status;
}
