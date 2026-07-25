import { supabase } from "../config/supabase";
import { getCurrentUser } from "./authState";

export type AnalyticsEventName =
  | "screen_view"
  | "chapter_view"
  | "note_view"
  | "video_view"
  | "quiz_attempt"
  | "order_created"
  | "purchase_unlocked"
  | "search";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  params?: Record<string, string | number | boolean | undefined>;
}

// Fire-and-forget by design - analytics must never block or break the
// screen that triggered it (same philosophy as utils/localCache.ts's
// "best effort" writes). Callers should NOT await this in a way that
// gates UI; it resolves quickly either way.
export async function logEvent({ name, params }: AnalyticsEvent): Promise<void> {
  try {
    const { error } = await supabase.from("analytics_events").insert({
      name,
      params: params ?? {},
      user_id: getCurrentUser()?.id ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.log(`analyticsService.logEvent(${name}) failed:`, error);
  }
}

export function logScreenView(screenName: string) {
  return logEvent({ name: "screen_view", params: { screenName } });
}

export function logChapterView(params: {
  chapterId: string;
  subjectId: string;
  yearId: string;
}) {
  return logEvent({ name: "chapter_view", params });
}

export function logNoteView(params: { chapterId: string; unlocked: boolean }) {
  return logEvent({ name: "note_view", params });
}

export function logVideoView(params: { videoId: string; subjectId: string }) {
  return logEvent({ name: "video_view", params });
}

export function logQuizAttempt(params: { testId: string; subjectId: string; score?: number }) {
  return logEvent({ name: "quiz_attempt", params });
}

export function logOrderCreated(params: {
  orderId: string;
  productId: string;
  scope: string;
  amount: number;
}) {
  return logEvent({ name: "order_created", params });
}

export function logPurchaseUnlocked(params: { productId?: string; scope: string }) {
  return logEvent({ name: "purchase_unlocked", params });
}

export function logSearch(term: string) {
  return logEvent({ name: "search", params: { term } });
}
