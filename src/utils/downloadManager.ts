// OFFLINE MODE - Download Manager.
//
// Replaces utils/downloadsManager.ts (AsyncStorage/notes-only). This is
// content-type agnostic (notes today, quizzes today, easy to add videos
// later) and backed by SQLite so:
//   - progress survives app restarts (bytes_written persisted)
//   - pause/resume works using expo-file-system's resumable download
//     "savable" state, persisted so a resume works even after the app
//     was killed mid-download, not just backgrounded
//   - retry/cancel/failed-recovery are first-class states, not bolted on
//
// Folder layout on device:
//   documentDirectory/medveda/notes/<id>.pdf
//   documentDirectory/medveda/quizzes/<id>.json
// Kept in dedicated subfolders (not the app's root doc dir) so
// "Clear All" / storage stats / cleanup never risk touching unrelated
// app files, and so future content types just add another subfolder.

// NOTE: since Expo SDK 54, the default `expo-file-system` export is the
// new File/Directory/Paths class-based API, which does NOT have
// documentDirectory, DownloadResumable, or downloadAsync. Those all
// still exist, just moved to the "/legacy" subpath - importing from
// there keeps this resumable-download code working unchanged on SDK 54+.
// Also note: legacy getInfoAsync no longer takes a { size: true } option
// - size is now always included in the returned FileInfo for file://
// URIs, so we just call getInfoAsync(uri) and read .size off the result.
import { getCourseYear } from "../services/courseState";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getDb } from "../config/database";
import {
  DownloadItem,
  DownloadRequest,
  DownloadStatus,
  StorageStats,
} from "../types/offline";

const ROOT_DIR = `${FileSystem.documentDirectory}medveda/`;
const RESUME_STATE_PREFIX = "medveda:resume:"; // AsyncStorage key per in-flight download

// Active resumable handles, kept in memory only while the JS context is
// alive - lets pause()/cancel() act on a live download instantly.
const activeResumables = new Map<string, FileSystem.DownloadResumable>();

// Listener registry so multiple screens (NotesScreen card + DownloadsScreen
// dashboard) can all react to progress/status changes for the same id
// without polling.
type Listener = (item: DownloadItem) => void;
const listeners = new Set<Listener>();
function emit(item: DownloadItem) {
  listeners.forEach((fn) => fn(item));
}
export function subscribeToDownloadEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function dirFor(contentType: DownloadItem["contentType"]): string {
  return `${ROOT_DIR}${contentType === "note" ? "notes" : "quizzes"}/`;
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

function rowToItem(row: any): DownloadItem {
  return {
    id: row.id,
    contentType: row.content_type,
    title: row.title,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    subjectId: row.subject_id,
    subjectTitle: row.subject_title,
    yearId: row.year_id,
    yearTitle: row.year_title,
    courseId: row.course_id ?? "",
    sourceUrl: row.source_url,
    localUri: row.local_uri,
    fileSizeBytes: row.file_size_bytes ?? 0,
    bytesWritten: row.bytes_written ?? 0,
    status: row.status,
    retryCount: row.retry_count ?? 0,
    errorMessage: row.error_message,
    contentVersion: row.content_version ?? 1,
    downloadedAt: row.downloaded_at,
    updatedAt: row.updated_at,
  };
}

// courseId (when given) hides items downloaded under another course. Files
// are never deleted by a course switch - they just stop being listed.
// Rows with an unknown course ('') are always shown.
export function getAllDownloads(courseId?: string): DownloadItem[] {
  const db = getDb();
  const rows = courseId
    ? db.getAllSync(
        `SELECT * FROM downloads WHERE course_id = ? OR course_id = '' ORDER BY updated_at DESC;`,
        [courseId]
      )
    : db.getAllSync(`SELECT * FROM downloads ORDER BY updated_at DESC;`);
  return rows.map(rowToItem);
}

export function getDownload(id: string): DownloadItem | null {
  const db = getDb();
  const row = db.getFirstSync(`SELECT * FROM downloads WHERE id = ?;`, [id]);
  return row ? rowToItem(row as any) : null;
}

function upsertRow(item: Partial<DownloadItem> & { id: string }): void {
  const db = getDb();
  const existing = getDownload(item.id);
  const now = Date.now();

  if (!existing) {
    db.runSync(
      `INSERT INTO downloads
        (id, content_type, title, chapter_id, chapter_title, subject_id, subject_title,
         year_id, year_title, source_url, local_uri, file_size_bytes, bytes_written,
         status, retry_count, error_message, content_version, downloaded_at, updated_at,
         course_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
      [
        item.id,
        item.contentType ?? "note",
        item.title ?? "",
        item.chapterId ?? "",
        item.chapterTitle ?? "",
        item.subjectId ?? "",
        item.subjectTitle ?? "",
        item.yearId ?? "",
        item.yearTitle ?? "",
        item.sourceUrl ?? "",
        item.localUri ?? null,
        item.fileSizeBytes ?? 0,
        item.bytesWritten ?? 0,
        item.status ?? "queued",
        item.retryCount ?? 0,
        item.errorMessage ?? null,
        item.contentVersion ?? 1,
        item.downloadedAt ?? null,
        now,
        item.courseId ?? getCourseYear().courseId ?? "",
      ]
    );
  } else {
    const merged = { ...existing, ...item, updatedAt: now };
    db.runSync(
      `UPDATE downloads SET
        local_uri = ?, file_size_bytes = ?, bytes_written = ?, status = ?,
        retry_count = ?, error_message = ?, downloaded_at = ?, updated_at = ?
       WHERE id = ?;`,
      [
        merged.localUri ?? null,
        merged.fileSizeBytes ?? 0,
        merged.bytesWritten ?? 0,
        merged.status ?? existing.status,
        merged.retryCount ?? 0,
        merged.errorMessage ?? null,
        merged.downloadedAt ?? null,
        now,
        item.id,
      ]
    );
  }

  const fresh = getDownload(item.id);
  if (fresh) emit(fresh);
}

/** Kicks off (or resumes) a download. Safe to call again on a 'failed' item - acts as retry. */
export async function enqueueDownload(request: DownloadRequest): Promise<void> {
  const dir = dirFor(request.contentType);
  await ensureDir(dir);

  const existing = getDownload(request.id);
  const isRetry = existing?.status === "failed";

  upsertRow({
    id: request.id,
    contentType: request.contentType,
    title: request.title,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    subjectId: request.subjectId,
    subjectTitle: request.subjectTitle,
    yearId: request.yearId,
    yearTitle: request.yearTitle,
    sourceUrl: request.sourceUrl,
    contentVersion: request.contentVersion ?? 1,
    status: "downloading",
    retryCount: isRetry ? (existing!.retryCount + 1) : 0,
    errorMessage: null,
  });

  const ext = request.contentType === "note" ? "pdf" : "json";
  const fileUri = `${dir}${request.id}.${ext}`;

  try {
    const resumable = new FileSystem.DownloadResumable(
      request.sourceUrl,
      fileUri,
      {},
      (progress) => {
        if (progress.totalBytesExpectedToWrite <= 0) return;
        upsertRow({
          id: request.id,
          bytesWritten: progress.totalBytesWritten,
          fileSizeBytes: progress.totalBytesExpectedToWrite,
          status: "downloading",
        });
      }
    );
    activeResumables.set(request.id, resumable);

    const result = await resumable.downloadAsync();
    activeResumables.delete(request.id);
    await AsyncStorage.removeItem(RESUME_STATE_PREFIX + request.id);

    if (!result) throw new Error("Download did not complete - please retry.");

    const fileInfo = await FileSystem.getInfoAsync(result.uri);

    upsertRow({
      id: request.id,
      localUri: result.uri,
      fileSizeBytes: fileInfo.exists ? (fileInfo.size ?? 0) : 0,
      bytesWritten: fileInfo.exists ? (fileInfo.size ?? 0) : 0,
      status: "completed",
      downloadedAt: Date.now(),
      errorMessage: null,
    });
  } catch (err: any) {
    // Distinguish a user-initiated pause (we throw a sentinel below) from
    // a real failure so pausing never shows a scary error state.
    if (err?.message === "PAUSED_BY_USER") {
      upsertRow({ id: request.id, status: "paused" });
      return;
    }
    upsertRow({
      id: request.id,
      status: "failed",
      errorMessage: err?.message ?? "Download failed. Check your connection and retry.",
    });
  }
}

/** Pauses an in-flight download; state is persisted so it can resume even after app restart. */
export async function pauseDownload(id: string): Promise<void> {
  const resumable = activeResumables.get(id);
  if (!resumable) return;
  const savable = await resumable.pauseAsync();
  await AsyncStorage.setItem(RESUME_STATE_PREFIX + id, JSON.stringify(savable));
  activeResumables.delete(id);
  upsertRow({ id, status: "paused" });
}

/** Resumes a paused download - works whether or not the app was killed since pausing. */
export async function resumeDownload(id: string): Promise<void> {
  const existing = getDownload(id);
  if (!existing) return;

  const savedRaw = await AsyncStorage.getItem(RESUME_STATE_PREFIX + id);

  let saved: any = null;
  if (savedRaw) {
    try {
      saved = JSON.parse(savedRaw);
    } catch {
      // Corrupted resume-state JSON (e.g. app was killed mid-write) -
      // treat exactly like "no resumable state" below rather than
      // throwing and leaving the Resume button permanently broken.
      console.log(`Resume state for download ${id} is corrupt JSON - restarting instead`);
      await AsyncStorage.removeItem(RESUME_STATE_PREFIX + id);
    }
  }

  if (!saved) {
    // No resumable state (e.g. app was killed and memory handle lost, or
    // it was corrupted above) - simplest correct recovery is to restart
    // the download cleanly.
    await enqueueDownload({
      id: existing.id,
      contentType: existing.contentType,
      title: existing.title,
      sourceUrl: existing.sourceUrl,
      chapterId: existing.chapterId,
      chapterTitle: existing.chapterTitle,
      subjectId: existing.subjectId,
      subjectTitle: existing.subjectTitle,
      yearId: existing.yearId,
      yearTitle: existing.yearTitle,
      contentVersion: existing.contentVersion,
    });
    return;
  }

  upsertRow({ id, status: "downloading" });

  const resumable = new FileSystem.DownloadResumable(
    saved.url,
    saved.fileUri,
    saved.options,
    (progress) => {
      if (progress.totalBytesExpectedToWrite <= 0) return;
      upsertRow({
        id,
        bytesWritten: progress.totalBytesWritten,
        fileSizeBytes: progress.totalBytesExpectedToWrite,
        status: "downloading",
      });
    },
    saved.resumeData
  );
  activeResumables.set(id, resumable);

  try {
    const result = await resumable.resumeAsync();
    activeResumables.delete(id);
    await AsyncStorage.removeItem(RESUME_STATE_PREFIX + id);
    if (!result) throw new Error("Resume failed - please retry.");

    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    upsertRow({
      id,
      localUri: result.uri,
      fileSizeBytes: fileInfo.exists ? (fileInfo.size ?? 0) : 0,
      bytesWritten: fileInfo.exists ? (fileInfo.size ?? 0) : 0,
      status: "completed",
      downloadedAt: Date.now(),
    });
  } catch (err: any) {
    upsertRow({ id, status: "failed", errorMessage: err?.message ?? "Resume failed." });
  }
}

/** Retries a failed download from scratch. */
export async function retryDownload(id: string): Promise<void> {
  const existing = getDownload(id);
  if (!existing) return;
  await enqueueDownload({
    id: existing.id,
    contentType: existing.contentType,
    title: existing.title,
    sourceUrl: existing.sourceUrl,
    chapterId: existing.chapterId,
    chapterTitle: existing.chapterTitle,
    subjectId: existing.subjectId,
    subjectTitle: existing.subjectTitle,
    yearId: existing.yearId,
    yearTitle: existing.yearTitle,
    contentVersion: existing.contentVersion,
  });
}

/** Cancels + fully removes a download (queued, downloading, or paused). */
export async function cancelDownload(id: string): Promise<void> {
  const resumable = activeResumables.get(id);
  if (resumable) {
    try {
      await resumable.cancelAsync();
    } catch {
      /* best-effort */
    }
    activeResumables.delete(id);
  }
  await AsyncStorage.removeItem(RESUME_STATE_PREFIX + id);
  await removeDownload(id);
}

/** Deletes a completed download's file + row (used by the trash icon in DownloadsScreen). */
export async function removeDownload(id: string): Promise<void> {
  const existing = getDownload(id);
  if (existing?.localUri) {
    await FileSystem.deleteAsync(existing.localUri, { idempotent: true });
  }
  const db = getDb();
  db.runSync(`DELETE FROM downloads WHERE id = ?;`, [id]);
  emit({
    ...(existing as DownloadItem),
    status: "queued",
    localUri: null,
  } as DownloadItem); // signal removal; UI filters by re-querying getAllDownloads()
}

export async function clearAllDownloads(): Promise<void> {
  await FileSystem.deleteAsync(ROOT_DIR, { idempotent: true });
  const db = getDb();
  db.runSync(`DELETE FROM downloads;`);
}

/**
 * Called once at app startup: any row stuck in 'downloading' means the
 * app was killed mid-transfer. We can't trust an in-memory resumable
 * handle exists anymore, so mark them 'paused' and let the user resume
 * (which safely re-downloads if no resumable state was persisted).
 */
export function recoverInterruptedDownloads(): void {
  const db = getDb();
  db.runSync(`UPDATE downloads SET status = 'paused' WHERE status = 'downloading';`);
}

/** Content-version check: call after fetching fresh metadata from Supabase to flag stale downloads. */
export function markStaleIfVersionChanged(id: string, serverVersion: number): boolean {
  const existing = getDownload(id);
  if (!existing || existing.contentVersion >= serverVersion) return false;
  const db = getDb();
  db.runSync(`UPDATE downloads SET status = 'failed', error_message = 'Updated on server - redownload for latest version', content_version = ? WHERE id = ?;`, [serverVersion, id]);
  return true;
}

export function getStorageStats(): StorageStats {
  const items = getAllDownloads();
  const stats: StorageStats = {
    totalBytes: 0,
    noteBytes: 0,
    quizBytes: 0,
    totalItems: items.length,
    completedItems: 0,
    failedItems: 0,
  };
  for (const item of items) {
    if (item.status === "completed") {
      stats.totalBytes += item.fileSizeBytes;
      stats.completedItems += 1;
      if (item.contentType === "note") stats.noteBytes += item.fileSizeBytes;
      else stats.quizBytes += item.fileSizeBytes;
    }
    if (item.status === "failed") stats.failedItems += 1;
  }
  return stats;
}

/**
 * Quiz-specific "download": unlike Notes (a remote PDF URL), a QuizTest's
 * full data (including all questions) is already in memory by the time
 * the user taps Download - TestListScreen fetched it to render the
 * list. So there's nothing to fetch over HTTP; we just persist that
 * JSON to disk and record it as completed immediately. Kept in
 * downloadManager (not a separate module) so it shares the same
 * downloads table / storage stats / DownloadsScreen UI as Notes.
 */
export async function saveQuizForOffline(params: {
  id: string;
  title: string;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;
  quizData: unknown; // the full QuizTest object (with questions[])
}): Promise<void> {
  const dir = dirFor("quiz");
  await ensureDir(dir);

  const fileUri = `${dir}${params.id}.json`;
  const json = JSON.stringify(params.quizData);
  await FileSystem.writeAsStringAsync(fileUri, json);

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  const size = fileInfo.exists ? (fileInfo.size ?? json.length) : json.length;

  upsertRow({
    id: params.id,
    contentType: "quiz",
    title: params.title,
    chapterId: "", // quizzes are subject-scoped, not chapter-scoped
    chapterTitle: "",
    subjectId: params.subjectId,
    subjectTitle: params.subjectTitle,
    yearId: params.yearId,
    yearTitle: params.yearTitle,
    sourceUrl: "", // no remote URL - content was saved directly
    localUri: fileUri,
    fileSizeBytes: size,
    bytesWritten: size,
    status: "completed",
    downloadedAt: Date.now(),
    errorMessage: null,
  });
}

/** Reads a downloaded quiz's JSON back into a usable object (QuizTest shape). */
export async function loadOfflineQuiz<T = unknown>(localUri: string): Promise<T> {
  const raw = await FileSystem.readAsStringAsync(localUri);
  return JSON.parse(raw) as T;
}

export function isDownloaded(id: string): boolean {
  return getDownload(id)?.status === "completed";
}