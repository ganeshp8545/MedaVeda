import AsyncStorage from "@react-native-async-storage/async-storage";

// SRS Part 5, section 7 - Offline Strategy:
// "Enable Firestore offline persistence. Cache: Years, Subjects, Chapters."
//
// The Firestore Web/JS SDK (used here via `firebase/firestore`) does not
// support IndexedDb-based persistence on React Native - there's no
// IndexedDB on-device, so `persistentLocalCache()` silently falls back to
// memory-only and offers no real offline benefit
// (see firebase-js-sdk issues #436 and #7947). Getting genuine offline
// persistence would mean switching to the native `@react-native-firebase`
// SDK, which is a much bigger change than a source-only patch.
//
// This is a lightweight stand-in that satisfies the same goal for the
// catalog data called out in the SRS (years/subjects/chapters): every read
// through this helper is cached to AsyncStorage, and callers fall back to
// that cache when the live Firestore read fails (e.g. no network) so the
// user's already-seen catalog still renders offline. Purchases/PDF access
// are intentionally NOT cached here - the SRS explicitly says to refresh
// premium access after reconnecting, and the purchase screens already
// re-fetch live on every focus (see usePurchases / useFocusEffect usage).

const NAMESPACE = "ayurpulse:cache:";

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(NAMESPACE + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.log(`readCache(${key}) failed:`, error);
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(NAMESPACE + key, JSON.stringify(value));
  } catch (error) {
    // Caching is a best-effort optimization - never let a write failure
    // (e.g. storage full) break the screen that's showing live data.
    console.log(`writeCache(${key}) failed:`, error);
  }
}

// Fetches with a "network first, cached fallback" strategy: always tries
// the live Firestore read first (so users online always see fresh data),
// caches a successful result, and only falls back to the last cached
// value if the network read fails. Re-throws if there's no cache either,
// so existing .catch() error handling in screens keeps working unchanged.
export async function fetchWithCacheFallback<T>(
  key: string,
  fetchLive: () => Promise<T>
): Promise<T> {
  try {
    const fresh = await fetchLive();
    writeCache(key, fresh); // fire-and-forget, doesn't block the return
    return fresh;
  } catch (error) {
    const cached = await readCache<T>(key);
    if (cached !== null) {
      console.log(`fetchWithCacheFallback(${key}): offline, using cached copy`);
      return cached;
    }
    throw error;
  }
}
