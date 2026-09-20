// OFFLINE MODE - Core local database (expo-sqlite).
//
// WHY SQLite over AsyncStorage:
//   AsyncStorage is a flat key-value store - fine for a handful of small
//   blobs (session tokens, one JSON index) but wrong for anything with
//   relations, filtering, or growth: e.g. "give me all downloaded items
//   for subject X, sorted by size" becomes an O(n) full JSON parse+scan
//   on every render. SQLite gives us real indexes, transactions (so a
//   crash mid-download can't corrupt the index), and query composition
//   that scales to thousands of rows without a perceptible UI hitch.
//
// WHY NOT MMKV here:
//   MMKV is excellent for tiny hot-path key-value reads (theme prefs,
//   feature flags) but, like AsyncStorage, has no query engine. Since
//   Offline Mode needs relational queries (downloads x sync_queue x
//   content type) and Reasonably large tabular data (quiz attempts,
//   bookmarks), SQLite is the correct tool. MMKV remains a good future
//   choice for the small "settings" surface, not for this feature.
//
// Requires: npx expo install expo-sqlite
//
// One WAL-mode connection is opened once per app session and reused
// everywhere (DownloadManager, SyncEngine, repositories) via getDb().

import * as SQLite from "expo-sqlite";

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync("medveda_offline.db");
    dbInstance.execSync("PRAGMA journal_mode = WAL;");
    dbInstance.execSync("PRAGMA foreign_keys = ON;");
  }
  return dbInstance;
}

/**
 * Runs once at app startup (call from App.tsx before rendering
 * navigation). Idempotent - safe to call on every launch.
 */
export function initDatabase(): void {
  const db = getDb();

  db.execSync(`
    -- Every downloaded asset (PDF note or quiz bundle), one row per item.
    -- 'status' drives the whole DownloadManager state machine.
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,              -- content id (note id / quiz id)
      content_type TEXT NOT NULL,       -- 'note' | 'quiz'
      title TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_title TEXT NOT NULL,
      year_id TEXT NOT NULL,
      year_title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      local_uri TEXT,                   -- null until status = 'completed'
      file_size_bytes INTEGER DEFAULT 0,
      bytes_written INTEGER DEFAULT 0,  -- enables resume + progress restore after app kill
      status TEXT NOT NULL DEFAULT 'queued', -- queued|downloading|paused|completed|failed
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      content_version INTEGER DEFAULT 1,     -- bumped server-side when source content changes
      downloaded_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
    CREATE INDEX IF NOT EXISTS idx_downloads_chapter ON downloads(chapter_id);

    -- Outbox pattern: every offline user action queues here first, then
    -- SyncEngine drains it to Supabase once connectivity returns. This is
    -- what makes quiz attempts / bookmarks / progress work with zero
    -- internet and never lose data.
    CREATE TABLE IF NOT EXISTS sync_queue (
      queue_id TEXT PRIMARY KEY,        -- client-generated UUID (dedupe key)
      entity_type TEXT NOT NULL,        -- 'quiz_attempt' | 'bookmark' | 'reading_progress' | 'watch_history'
      operation TEXT NOT NULL,          -- 'upsert' | 'delete'
      payload TEXT NOT NULL,            -- JSON blob matching the target Supabase table
      created_at INTEGER NOT NULL,
      attempt_count INTEGER DEFAULT 0,
      last_error TEXT,
      synced_at INTEGER                 -- null until confirmed written to server
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(synced_at);

    -- Local mirror of quiz attempts so results screen works offline
    -- immediately; SyncEngine reconciles this with the server copy.
    CREATE TABLE IF NOT EXISTS quiz_attempts_local (
      attempt_id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      answers_json TEXT NOT NULL,
      taken_at INTEGER NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bookmarks_local (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reading_progress_local (
      content_id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      progress_percent REAL NOT NULL,
      last_page INTEGER,
      updated_at INTEGER NOT NULL,
      synced INTEGER DEFAULT 0
    );
  `);

  migrateDownloadsCourseId(db);
}

// initDatabase() only ever CREATEs tables IF NOT EXISTS, so columns added
// later must be migrated in explicitly. Safe to run on every launch.
function migrateDownloadsCourseId(db: SQLite.SQLiteDatabase): void {
  const columns = db.getAllSync(`PRAGMA table_info(downloads);`) as { name: string }[];
  if (columns.some((c) => c.name === "course_id")) return;

  db.execSync(`ALTER TABLE downloads ADD COLUMN course_id TEXT NOT NULL DEFAULT '';`);
  // Every download made before multi-course support was a BAMS one.
  db.execSync(`UPDATE downloads SET course_id = 'bams' WHERE course_id = '';`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_downloads_course ON downloads(course_id);`);
}

/** Wipes every offline table. Used by "Clear All Downloads" + logout. */
export function resetDatabase(): void {
  const db = getDb();
  db.execSync(`
    DELETE FROM downloads;
    DELETE FROM sync_queue;
    DELETE FROM quiz_attempts_local;
    DELETE FROM bookmarks_local;
    DELETE FROM reading_progress_local;
  `);
}
