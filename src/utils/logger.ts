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
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

export function logError(label: string, error?: unknown): void {
  const message = error instanceof Error ? error.message : undefined;
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(label, message ?? error);
  }
  // Wire this up to your crash/telemetry provider (Sentry, etc.) here if
  // you have one - keep it to `label` + `message`, never the raw error
  // object or request/response payloads.
}
