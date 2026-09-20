// MAJOR[.MINOR[.PATCH]], digits only. Must match the app_config check
// constraint and the mobile app's parser (mobile-app/src/utils/version.ts).
const VERSION_RE = /^\d+(\.\d+){0,2}$/;

export function isValidAppVersion(v: string): boolean {
  return VERSION_RE.test(v.trim());
}

export function isValidStoreUrl(v: string): boolean {
  try {
    return new URL(v.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

// Returns an error message, or null when both fields are acceptable.
export function validateUpdateGate(minAppVersion: string, storeUrl: string): string | null {
  if (!isValidAppVersion(minAppVersion)) {
    return "Minimum app version must look like 1.2.3 (digits and dots only, up to three parts).";
  }
  if (!isValidStoreUrl(storeUrl)) {
    return "Store URL must be a valid https:// link.";
  }
  return null;
}
