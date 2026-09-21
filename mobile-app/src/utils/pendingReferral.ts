import AsyncStorage from "@react-native-async-storage/async-storage";
import { logDebug } from "./logger";

// A referral code typed on the Register screen can't be applied yet: with
// email confirmation there is no session until the student verifies and logs
// in. It's kept on the device until then, tagged with the sign-up email so a
// different account logging in on the same phone never claims it.
const STORAGE_KEY = "medveda:pendingReferral";

export interface PendingReferral {
  code: string;
  email: string; // lower-cased sign-up email
}

export async function savePendingReferral(code: string, email: string): Promise<void> {
  try {
    const value: PendingReferral = { code, email: email.trim().toLowerCase() };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    logDebug("savePendingReferral failed:", error);
  }
}

export async function getPendingReferral(): Promise<PendingReferral | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.code && parsed?.email ? (parsed as PendingReferral) : null;
  } catch (error) {
    logDebug("getPendingReferral failed:", error);
    return null;
  }
}

export async function clearPendingReferral(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    logDebug("clearPendingReferral failed:", error);
  }
}
