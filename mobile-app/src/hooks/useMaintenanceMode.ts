import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { checkMaintenanceMode } from "../services/maintenanceService";

export default function useMaintenanceMode() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const alive = useRef(false);
  const running = useRef(false);
  const retry = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setChecking(true);
    try {
      const result = await checkMaintenanceMode();
      if (alive.current) setEnabled(result);
    } finally {
      running.current = false;
      if (alive.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void retry();
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") void retry();
    });
    return () => { alive.current = false; sub.remove(); };
  }, [retry]);

  return { enabled, checking, retry };
}
