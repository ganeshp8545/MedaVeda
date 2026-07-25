// DESIGN SYSTEM / dashboard feature - Study Streak.
//
// Tracks consecutive days the student has opened the app, the way
// Duolingo/Spotify Wrapped-style streaks work. Purely device-local (same
// pattern as utils/recentActivity.ts) - no Supabase table needed, so
// there's zero backend work to ship this.
//
// Logic: call recordActivityToday() once per app session (HomeScreen
// mount is the natural place). If today is already recorded, no-op. If
// yesterday was the last active day, streak continues (+1). Any bigger
// gap resets to 1.

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "medveda:streak";

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null; // "YYYY-MM-DD"
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function readStreak(): Promise<StreakData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
    return JSON.parse(raw) as StreakData;
  } catch {
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
  }
}

async function writeStreak(data: StreakData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Call once per session. Returns the up-to-date streak after recording today's activity. */
export async function recordActivityToday(): Promise<StreakData> {
  const existing = await readStreak();
  const today = todayKey();

  if (existing.lastActiveDate === today) {
    return existing; // already recorded today - no-op
  }

  const continuedStreak = existing.lastActiveDate === yesterdayKey();
  const currentStreak = continuedStreak ? existing.currentStreak + 1 : 1;
  const longestStreak = Math.max(existing.longestStreak, currentStreak);

  const updated: StreakData = { currentStreak, longestStreak, lastActiveDate: today };
  await writeStreak(updated);
  return updated;
}

export async function getStreak(): Promise<StreakData> {
  return readStreak();
}
