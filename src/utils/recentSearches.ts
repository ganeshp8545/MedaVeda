import AsyncStorage from "@react-native-async-storage/async-storage";

// Global Search System - recent search terms. Same local-only, per-device
// model as utils/recentActivity.ts (no backend table, nothing to sync) -
// there's no student-facing reason this needs to survive a reinstall or
// show up on a second device.

const STORAGE_KEY = "medveda:recentSearches";
const MAX_ENTRIES = 12;

export interface RecentSearchEntry {
  query: string;
  searchedAt: number; // epoch ms
}

export async function getRecentSearches(): Promise<RecentSearchEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log("getRecentSearches failed:", error);
    return [];
  }
}

export async function recordSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  // Don't log every keystroke - only worth remembering once it looks
  // like an actual search term, same threshold the subsequence matcher
  // uses to start considering fuzzy hits.
  if (trimmed.length < 2) return;

  try {
    const existing = await getRecentSearches();
    const withoutDuplicate = existing.filter(
      (entry) => entry.query.toLowerCase() !== trimmed.toLowerCase()
    );

    const updated: RecentSearchEntry[] = [
      { query: trimmed, searchedAt: Date.now() },
      ...withoutDuplicate,
    ].slice(0, MAX_ENTRIES);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.log("recordSearch failed:", error);
  }
}

export async function removeRecentSearch(query: string): Promise<void> {
  try {
    const existing = await getRecentSearches();
    const updated = existing.filter((entry) => entry.query !== query);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.log("removeRecentSearch failed:", error);
  }
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.log("clearRecentSearches failed:", error);
  }
}
