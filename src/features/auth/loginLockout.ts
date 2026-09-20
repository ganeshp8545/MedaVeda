// Client-side login throttling (OWASP Mobile Top 10 - M4 Insufficient
// Anti-automation / brute-force mitigation). This is a deterrent layer on
// the device only; Supabase's own auth backend remains the authoritative
// rate limiter. What this module adds is *immediate, on-device* feedback
// for a student who is genuinely locked out, and it makes that lock
// survive an app restart - simply closing and reopening the app must not
// reset the attempt counter.
//
// Policy (per product spec):
//   - 5 failed attempts -> locked for 5 minutes.
//   - After that lock expires, 3 more failed attempts -> locked for 15
//     minutes (and every lock after that also uses the 15-minute stage).
//   - A successful login clears the counter entirely.
//
// State is keyed per *normalized identifier* (the exact email or E.164
// phone string the attempt was made with), not globally - so someone
// hammering one stranger's account on a shared/family device doesn't
// lock out every other student's account on that same phone.
//
// Storage: expo-secure-store (iOS Keychain / Android Keystore), the same
// mechanism secureSessionStorage.ts uses for the Supabase session itself.
// The counters aren't secret, but they ARE a security control, so they
// get the same protection against casual tampering (e.g. clearing plain
// AsyncStorage on a rooted device to wipe a lockout) as the session
// tokens do.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FIRST_LOCK_THRESHOLD = 5;
const FIRST_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const SECOND_LOCK_THRESHOLD = 3;
const SECOND_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// expo-secure-store has no native module on web (same situation as
// secureSessionStorage.ts) - fall back to AsyncStorage there so
// `expo start --web` keeps working during development.
const isWeb = Platform.OS === "web";

interface LockoutRecord {
  attempts: number;
  lockUntil: number | null;
  // 0 = has not yet gone through its first lockout, so the *next* lock
  // (if triggered) uses the 5-attempt/5-minute stage. 1 = has already
  // been locked at least once, so the next lock uses the
  // 3-attempt/15-minute stage.
  stage: 0 | 1;
}

export interface LockStatus {
  locked: boolean;
  remainingMs: number;
}

function keyFor(identifier: string): string {
  // SecureStore keys are restricted to alphanumeric/./-/_ - identifiers
  // (emails contain "@", phone numbers contain "+") need encoding first.
  const safe = encodeURIComponent(identifier.trim().toLowerCase()).replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  return `login-lockout-${safe}`;
}

async function readRecord(identifier: string): Promise<LockoutRecord | null> {
  const key = keyFor(identifier);
  const raw = isWeb
    ? await AsyncStorage.getItem(key)
    : await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LockoutRecord;
  } catch {
    // Corrupt value - fail open rather than throwing and blocking login.
    return null;
  }
}

async function writeRecord(identifier: string, record: LockoutRecord): Promise<void> {
  const key = keyFor(identifier);
  const raw = JSON.stringify(record);
  if (isWeb) {
    await AsyncStorage.setItem(key, raw);
  } else {
    await SecureStore.setItemAsync(key, raw);
  }
}

async function clearRecord(identifier: string): Promise<void> {
  const key = keyFor(identifier);
  if (isWeb) {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

// Read-only check - call before attempting a login (and whenever the
// identifier field changes) so an already-locked account shows its
// remaining cool-down immediately, including right after an app restart.
// Never mutates stored state.
export async function getLockStatus(identifier: string): Promise<LockStatus> {
  if (!identifier) return { locked: false, remainingMs: 0 };
  const record = await readRecord(identifier);
  if (!record?.lockUntil) return { locked: false, remainingMs: 0 };
  const remainingMs = record.lockUntil - Date.now();
  if (remainingMs <= 0) return { locked: false, remainingMs: 0 };
  return { locked: true, remainingMs };
}

// Call after a failed login attempt (wrong password / unknown account).
// Returns the resulting status so the caller can show "locked for Nm"
// immediately without a second read.
export async function recordFailedAttempt(identifier: string): Promise<LockStatus> {
  const existing = (await readRecord(identifier)) ?? {
    attempts: 0,
    lockUntil: null,
    stage: 0 as const,
  };

  // A previous lock that has already expired is not "still locked" -
  // clear it before counting this new attempt against the next stage.
  if (existing.lockUntil && existing.lockUntil <= Date.now()) {
    existing.lockUntil = null;
  }

  const attempts = existing.attempts + 1;
  const threshold = existing.stage === 0 ? FIRST_LOCK_THRESHOLD : SECOND_LOCK_THRESHOLD;

  if (attempts >= threshold) {
    const duration = existing.stage === 0 ? FIRST_LOCK_DURATION_MS : SECOND_LOCK_DURATION_MS;
    const record: LockoutRecord = { attempts: 0, lockUntil: Date.now() + duration, stage: 1 };
    await writeRecord(identifier, record);
    return { locked: true, remainingMs: duration };
  }

  const record: LockoutRecord = { attempts, lockUntil: null, stage: existing.stage };
  await writeRecord(identifier, record);
  return { locked: false, remainingMs: 0 };
}

// Call after a successful login. Wipes the counter entirely so the
// account starts fresh next time, per spec ("Reset attempts after
// successful login").
export async function clearLoginAttempts(identifier: string): Promise<void> {
  await clearRecord(identifier);
}

export function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
