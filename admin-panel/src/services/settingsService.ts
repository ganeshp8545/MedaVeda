import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import { validateUpdateGate } from "../utils/appVersion";
import type { AppSettings } from "../types/settings";

const TABLE = "app_settings";
const CONFIG_TABLE = "app_config";

const defaultSettings: AppSettings = {
  appName: "MedVeda",
  supportEmail: "",
  supportPhone: "",
  maintenanceMode: false,
  termsUrl: "",
  privacyUrl: "",
  razorpayKeyId: "",
  minAppVersion: "",
  storeUrl: "",
};

// app_settings is a single-row table (id = 1), seeded by schema.sql.
// min_app_version / store_url live in the key/value app_config table, which
// the mobile app reads anonymously (force-update gate).
export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", 1).single();
  if (error) throw error;

  const { data: cfg, error: cfgError } = await supabase
    .from(CONFIG_TABLE)
    .select("key, value")
    .in("key", ["min_app_version", "store_url"]);
  if (cfgError) throw cfgError;
  const map = new Map<string, string>((cfg ?? []).map((r: any) => [r.key, r.value]));

  return {
    ...defaultSettings,
    ...toCamelCase<AppSettings>(data),
    minAppVersion: map.get("min_app_version") ?? "",
    storeUrl: map.get("store_url") ?? "",
  };
}

export class PartialSettingsSaveError extends Error {
  constructor() {
    super("App update settings were saved, but general settings (including Maintenance Mode) could not be confirmed. Reload settings before retrying.");
    this.name = "PartialSettingsSaveError";
  }
}

export async function updateSettings(data: AppSettings) {
  const { minAppVersion, storeUrl, ...rest } = data;

  // Validate before writing anything: a bad min version could lock students out.
  const problem = validateUpdateGate(minAppVersion, storeUrl);
  if (problem) throw new Error(problem);

  const { error: cfgError } = await supabase.from(CONFIG_TABLE).upsert(
    [
      { key: "min_app_version", value: minAppVersion.trim() },
      { key: "store_url", value: storeUrl.trim() },
    ],
    { onConflict: "key" }
  );
  if (cfgError) throw cfgError;

  try {
    const { data: saved, error } = await supabase.from(TABLE)
      .update(toSnakeCase(rest)).eq("id", 1).select("id").single();
    if (error || !saved) throw new PartialSettingsSaveError();
  } catch {
    throw new PartialSettingsSaveError();
  }
}
