// OFFLINE MODE - Sync Engine.
//
// Pattern: transactional outbox. Every offline user action (quiz
// submitted, bookmark toggled, reading progress updated) is written
// LOCALLY FIRST (instant UI feedback, works with zero signal), then a
// row is appended to sync_queue. A NetInfo listener drains the queue to
// Supabase whenever connectivity returns, plus a safety-net interval in
// case the listener event is missed (some Android OEMs throttle it).
//
// Duplicate-safety: every queued row carries the client-generated id
// (attempt_id / bookmark id) as part of its payload, and every insert
// on the server side should be an upsert on that id (Supabase
// `.upsert(payload, { onConflict: 'id' })`), so replays from a flaky
// connection never create duplicate rows.
//
// Conflict resolution:
//   - quiz_attempt: never overwritten - each attempt is a new row, so
//     there is nothing to "conflict"; history is naturally append-only.
//   - bookmark: last-write-wins by created_at/deleted flag - acceptable
//     because bookmarks are a single boolean-ish toggle per user+item.
//   - reading_progress: MAX(local.progress, server.progress) is kept -
//     never lets a stale offline session silently regress a student's
//     furthest-read position.
//
// Requires: npx expo install @react-native-community/netinfo

import NetInfo from "@react-native-community/netinfo";
import { getDb } from "../config/database";
import { supabase } from "../config/supabase";
import { SyncEntityType, SyncQueueItem } from "../types/offline";

let syncInProgress = false;
let unsubscribeNetInfo: (() => void) | null = null;
let safetyInterval: ReturnType<typeof setInterval> | null = null;

function rowToQueueItem(row: any): SyncQueueItem {
  return {
    queueId: row.queue_id,
    entityType: row.entity_type,
    operation: row.operation,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    syncedAt: row.synced_at,
  };
}

/** Call this from any repository/service right after a successful local write. */
export function queueForSync(
  entityType: SyncEntityType,
  operation: "upsert" | "delete",
  payload: Record<string, unknown>
): void {
  const db = getDb();
  const queueId = `${entityType}_${payload.id ?? Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.runSync(
    `INSERT INTO sync_queue (queue_id, entity_type, operation, payload, created_at, attempt_count, synced_at)
     VALUES (?,?,?,?,?,0,NULL);`,
    [queueId, entityType, operation, JSON.stringify(payload), Date.now()]
  );
  // Fire-and-forget: try syncing immediately in case we're already online.
  drainQueue();
}

function getPendingItems(): SyncQueueItem[] {
  const db = getDb();
  const rows = db.getAllSync(
    `SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT 50;`
  );
  return rows.map(rowToQueueItem);
}

function markSynced(queueId: string): void {
  const db = getDb();
  db.runSync(`UPDATE sync_queue SET synced_at = ? WHERE queue_id = ?;`, [Date.now(), queueId]);
}

function markFailed(queueId: string, error: string): void {
  const db = getDb();
  db.runSync(
    `UPDATE sync_queue SET attempt_count = attempt_count + 1, last_error = ? WHERE queue_id = ?;`,
    [error, queueId]
  );
}

async function syncOne(item: SyncQueueItem): Promise<void> {
  const table =
    item.entityType === "quiz_attempt"
      ? "quiz_scores"
      : item.entityType === "bookmark"
      ? "bookmarks"
      : item.entityType === "reading_progress"
      ? "reading_progress"
      : "watch_history";

  if (item.entityType === "reading_progress") {
    // Conflict rule: never regress a student's furthest progress.
    const { data: existing } = await supabase
      .from(table)
      .select("progress_percent")
      .eq("content_id", (item.payload as any).content_id)
      .eq("user_id", (item.payload as any).user_id)
      .maybeSingle();

    const serverProgress = existing?.progress_percent ?? 0;
    const localProgress = (item.payload as any).progress_percent ?? 0;
    if (serverProgress > localProgress) {
      markSynced(item.queueId); // server already ahead - nothing to push, just close it out
      return;
    }
  }

  if (item.operation === "delete") {
    const { error } = await supabase.from(table).delete().eq("id", (item.payload as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(table).upsert(item.payload, { onConflict: "id" });
    if (error) throw error;
  }
}

/** Drains as much of the outbox as possible. Safe to call repeatedly/concurrently. */
export async function drainQueue(): Promise<void> {
  if (syncInProgress) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected || !net.isInternetReachable) return;

  syncInProgress = true;
  try {
    const pending = getPendingItems();
    for (const item of pending) {
      try {
        await syncOne(item);
        markSynced(item.queueId);
      } catch (err: any) {
        markFailed(item.queueId, err?.message ?? "Unknown sync error");
        // Give up on a row after 5 tries so one bad payload can't jam the
        // whole queue forever; it stays visible for manual/debug review.
        if (item.attemptCount + 1 >= 5) {
          markSynced(item.queueId);
        }
      }
    }
  } finally {
    syncInProgress = false;
  }
}

export function getPendingSyncCount(): number {
  const db = getDb();
  const row = db.getFirstSync(
    `SELECT COUNT(*) as cnt FROM sync_queue WHERE synced_at IS NULL;`
  ) as any;
  return row?.cnt ?? 0;
}

/** Call once at app startup (after initDatabase). */
export function startSyncEngine(): void {
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      drainQueue();
    }
  });

  // Safety net: some devices throttle background NetInfo events, so also
  // sweep every 2 minutes while the app is foregrounded.
  if (safetyInterval) clearInterval(safetyInterval);
  safetyInterval = setInterval(drainQueue, 2 * 60 * 1000);

  drainQueue(); // attempt immediately in case we launched already online
}

export function stopSyncEngine(): void {
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = null;
  if (safetyInterval) clearInterval(safetyInterval);
  safetyInterval = null;
}
