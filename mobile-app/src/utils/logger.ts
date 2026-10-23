import { Sentry } from "../config/sentry";

// SECURITY FIX: plain console.log/console.error calls run in production
// builds too (RN/Hermes does not strip them), and their output is
// reachable via `adb logcat` on Android and can be picked up by any
// crash/analytics SDK that hooks the console. Several screens were
// logging user emails and raw auth error messages this way.
//
// Use logDebug for anything that should only exist during development.
// Use logError for real error telemetry - it never prints PII, only a
// short label plus the error's `message` (never the whole error object,
// which can carry request payloads/tokens on some SDKs).
export function logDebug(...args: unknown[]): void {
  if (__DEV__) {
    console.log(...args);
  }
}

export function logError(label: string, error?: unknown): void {
  const message = error instanceof Error ? error.message : undefined;
  if (__DEV__) {
    console.error(label, message ?? error);
  }
  // Wired up to Sentry - deliberately does NOT send the raw `error` object,
  // only a fresh Error built from `label` + `message`, so nothing attached
  // to the original error (request payloads, tokens, etc. some SDKs carry)
  // ever leaves the device. This keeps the exact same PII policy as above,
  // just visible on the Sentry dashboard instead of nowhere.
  Sentry.captureException(new Error(`${label}${message ? `: ${message}` : ""}`));
}