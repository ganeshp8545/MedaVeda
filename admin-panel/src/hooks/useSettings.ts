import { useEffect, useState } from "react";

import { getSettings, updateSettings } from "../services/settingsService";
import type { AppSettings } from "../types/settings";

const emptySettings: AppSettings = {
  appName: "",
  supportEmail: "",
  supportPhone: "",
  maintenanceMode: false,
  termsUrl: "",
  privacyUrl: "",
  razorpayKeyId: "",
  minAppVersion: "",
  storeUrl: "",
};

export default function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await getSettings();
      setSettings(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load settings. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(data: AppSettings) {
    await updateSettings(data);
    setSettings(data);
  }

  return { settings, loading, error, reload: load, saveSettings };
}
