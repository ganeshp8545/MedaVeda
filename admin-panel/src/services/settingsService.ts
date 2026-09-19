import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { AppSettings } from "../types/settings";

const TABLE = "app_settings";

const defaultSettings: AppSettings = {
  appName: "MedVeda",
  supportEmail: "",
  supportPhone: "",
  maintenanceMode: false,
  termsUrl: "",
  privacyUrl: "",
  razorpayKeyId: "",
};

// app_settings is a single-row table (id = 1), seeded by schema.sql.
export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", 1).single();
  if (error) throw error;
  return { ...defaultSettings, ...toCamelCase<AppSettings>(data) };
}

export async function updateSettings(data: AppSettings) {
  const { error } = await supabase.from(TABLE).update(toSnakeCase(data)).eq("id", 1);
  if (error) throw error;
}
