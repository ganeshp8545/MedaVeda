import AsyncStorage from "@react-native-async-storage/async-storage";

export const OFFLINE_NOTE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_NOTE_VERIFICATION_PREFIX = "medveda:note-verified:";
const keyFor = (owner: string, noteId: string) => `${OFFLINE_NOTE_VERIFICATION_PREFIX}${owner}:${noteId}`;

export async function recordNoteVerification(owner: string, noteId: string): Promise<void> {
  const now = Date.now();
  await AsyncStorage.setItem(keyFor(owner, noteId), JSON.stringify({ checkedAt: now, lastSeenAt: now }));
  await AsyncStorage.removeItem(`medveda:note-denied:${owner}:${noteId}`);
}

export async function clearNoteVerification(owner: string, noteId: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(owner, noteId));
}

export async function hasRecentNoteVerification(owner: string, noteId: string): Promise<boolean> {
  const key = keyFor(owner, noteId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return false; // Legacy downloads need a successful server check.
    const { checkedAt, lastSeenAt } = JSON.parse(raw);
    const now = Date.now();
    if (!Number.isSafeInteger(checkedAt) || !Number.isSafeInteger(lastSeenAt) ||
        checkedAt <= 0 || lastSeenAt < checkedAt || now < lastSeenAt ||
        now - checkedAt > OFFLINE_NOTE_GRACE_MS) {
      // Persist expiry so moving the clock forward again cannot revive access.
      await AsyncStorage.removeItem(key);
      return false;
    }
    await AsyncStorage.setItem(key, JSON.stringify({ checkedAt, lastSeenAt: now }));
    return true;
  } catch {
    await AsyncStorage.removeItem(key);
    return false;
  }
}
