import AsyncStorage from "@react-native-async-storage/async-storage";

// Lightweight local (on-device) activity log used purely to power the
// "Continue Learning" and "Recently Viewed" dashboard sections. This is
// intentionally NOT stored in Firestore - it's per-device, no backend
// changes needed, and costs nothing to read/write.
//
// NOTE: requires `@react-native-async-storage/async-storage`.
// If it isn't installed yet, run:
//   npx expo install @react-native-async-storage/async-storage

const STORAGE_KEY = "medveda:recentChapters";
const MAX_ENTRIES = 10;

export interface RecentChapterEntry {
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;
  viewedAt: number; // epoch ms
}

export async function recordChapterView(
  entry: Omit<RecentChapterEntry, "viewedAt">
): Promise<void> {
  try {
    const existing = await getRecentChapters();
    const withoutDuplicate = existing.filter(
      (item) => item.chapterId !== entry.chapterId
    );

    const updated: RecentChapterEntry[] = [
      { ...entry, viewedAt: Date.now() },
      ...withoutDuplicate,
    ].slice(0, MAX_ENTRIES);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    // Non-critical - never let activity tracking break navigation.
    console.log("recordChapterView failed:", error);
  }
}

export async function getRecentChapters(): Promise<RecentChapterEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log("getRecentChapters failed:", error);
    return [];
  }
}

// Most recent entry, used for the single "Continue Learning" hero card.
export async function getLastViewedChapter(): Promise<RecentChapterEntry | null> {
  const list = await getRecentChapters();
  return list[0] ?? null;
}
