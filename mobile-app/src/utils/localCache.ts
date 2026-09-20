import AsyncStorage from "@react-native-async-storage/async-storage";

// This is a lightweight offline cache: every read through this helper is
// cached to AsyncStorage, and callers fall back to that cache when the
// live Supabase read fails (e.g. no network) so the user's already-seen
// catalog (years/subjects/chapters) still renders offline. Purchases/PDF
// access are intentionally NOT cached here - premium access should
// refresh after reconnecting, and the purchase screens already re-fetch
// live on every focus (see usePurchases / useFocusEffect usage).

const NAMESPACE = "medveda:cache:";

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
// the live Supabase read first (so users online always see fresh data),
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

// Drops every cached catalog list (years/subjects/chapters/search index).
// Called when the student changes course so nothing from the old course can
// be served as an "offline" fallback.
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(NAMESPACE));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch (error) {
    console.log("clearCache failed:", error);
  }
}
