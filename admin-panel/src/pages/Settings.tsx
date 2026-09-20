import { useEffect, useState } from "react";

import useSettings from "../hooks/useSettings";

import Input from "../components/Input";
import Button from "../components/Button";

import { validateUpdateGate } from "../utils/appVersion";

import type { AppSettings } from "../types/settings";

export default function Settings() {
  const { settings, loading, error, saveSettings } = useSettings();

  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  async function handleSave() {
    setSaved(false);
    const problem = validateUpdateGate(form.minAppVersion, form.storeUrl);
    if (problem) {
      setSaveError(problem);
      return;
    }
    try {
      setSaving(true);
      setSaveError(null);
      await saveSettings(form);
      setSaved(true);
    } catch (err) {
      console.error(err);
      setSaveError("Could not save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <h2 className="text-xl">
        Loading...
      </h2>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-500 mt-1">
          General app configuration.
        </p>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {saveError && <p className="text-red-500 mb-4">{saveError}</p>}

      <div className="bg-white rounded-xl shadow p-6">
        <Input
          label="App Name"
          value={form.appName}
          onChange={(e) => setForm({ ...form, appName: e.target.value })}
        />

        <Input
          label="Support Email"
          type="email"
          placeholder="medvedaforu@gmail.com"
          value={form.supportEmail}
          onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
        />

        <Input
          label="Support Phone"
          placeholder="+91 ..."
          value={form.supportPhone}
          onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
        />

        <Input
          label="Terms & Conditions URL"
          placeholder="https://..."
          value={form.termsUrl}
          onChange={(e) => setForm({ ...form, termsUrl: e.target.value })}
        />

        <Input
          label="Privacy Policy URL"
          placeholder="https://..."
          value={form.privacyUrl}
          onChange={(e) => setForm({ ...form, privacyUrl: e.target.value })}
        />

        <Input
          label="Razorpay Key ID"
          placeholder="rzp_live_..."
          value={form.razorpayKeyId}
          onChange={(e) => setForm({ ...form, razorpayKeyId: e.target.value })}
        />

        <h2 className="mt-2 mb-1 text-lg font-semibold">App updates</h2>
        <p className="mb-3 text-sm text-gray-500">
          Students on a build older than the minimum version see a blocking
          "Update required" screen. Set it to the version you have already
          released; these values are public, so never put secrets here.
        </p>

        <Input
          label="Minimum app version"
          placeholder="1.0.0"
          value={form.minAppVersion}
          onChange={(e) => setForm({ ...form, minAppVersion: e.target.value })}
        />

        <Input
          label="Store URL"
          placeholder="https://play.google.com/store/apps/details?id=..."
          value={form.storeUrl}
          onChange={(e) => setForm({ ...form, storeUrl: e.target.value })}
        />

        <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.maintenanceMode}
            onChange={(e) =>
              setForm({ ...form, maintenanceMode: e.target.checked })
            }
          />
          Maintenance Mode (app will show a "down for maintenance" screen to students)
        </label>

        <div className="mt-2 flex items-center gap-3">
          <Button onClick={handleSave} loading={saving}>
            Save Settings
          </Button>

          {saved && (
            <span className="text-sm text-green-700">Saved ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
