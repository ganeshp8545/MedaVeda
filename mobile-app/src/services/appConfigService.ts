import * as Application from "expo-application";

import { supabase } from "../config/supabase";
import { compareVersions, parseVersion } from "../utils/version";

// Force-update gate. Reads min_app_version / store_url from the publicly
// readable app_config table (see supabase/migrations/20260920130000_app_config.sql).
//
// Fails OPEN: any fetch/parse problem means "not required", so an outage or a
// bad config value can never lock students out.

export const DEFAULT_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.ayurpulse.app";

export type UpdateStatus = {
  required: boolean;
  storeUrl: string;
};

const OPEN: UpdateStatus = { required: false, storeUrl: DEFAULT_STORE_URL };

// A successful check is reused for this long (launch + immediate resume, or
// several resumes in a row, hit the network once). Failures are not cached, so
// the next resume retries.
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

let cached: { at: number; status: UpdateStatus } | null = null;
let inFlight: Promise<UpdateStatus> | null = null;

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("app_config fetch timed out")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function fetchStatus(): Promise<{ status: UpdateStatus; cacheable: boolean }> {
  // Installed binary's version (Android versionName / iOS CFBundleShortVersionString).
  // Unlike Constants.expoConfig.version this cannot be changed by an OTA manifest.
  // null on web.
  const installed = Application.nativeApplicationVersion;
  if (!parseVersion(installed)) return { status: OPEN, cacheable: false };

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("app_config")
        .select("key, value")
        .in("key", ["min_app_version", "store_url"]),
      FETCH_TIMEOUT_MS
    );
    if (error || !data) return { status: OPEN, cacheable: false };

    const map = new Map<string, string>(data.map((r: any) => [r.key, r.value]));
    const rawUrl = map.get("store_url")?.trim();
    const storeUrl = rawUrl && /^https:\/\//.test(rawUrl) ? rawUrl : DEFAULT_STORE_URL;

    const cmp = compareVersions(installed, map.get("min_app_version"));
    // cmp === null: missing/malformed min_app_version -> fail open.
    return { status: { required: cmp === -1, storeUrl }, cacheable: true };
  } catch (err) {
    console.warn("Update check failed (continuing):", err);
    return { status: OPEN, cacheable: false };
  }
}

export function checkForRequiredUpdate(): Promise<UpdateStatus> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return Promise.resolve(cached.status);
  }
  if (inFlight) return inFlight;

  inFlight = fetchStatus()
    .then(({ status, cacheable }) => {
      if (cacheable) cached = { at: Date.now(), status };
      return status;
    })
    .catch(() => OPEN)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
