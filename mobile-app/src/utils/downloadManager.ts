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

import { getDb, OFFLINE_DB_SUPPORTED } from "../config/database";
import {
  DownloadItem,
  DownloadRequest,
  StorageStats,
} from "../types/offline";
import { getSecureNoteUrl, NoteAccessError } from "../services/secureNotesService";
import { getCurrentUser } from "../services/authState";

import { recordNoteVerification, clearNoteVerification, OFFLINE_NOTE_VERIFICATION_PREFIX } from "../services/offlineNoteVerification";

const ROOT_DIR = `${FileSystem.documentDirectory}medveda/`;
const RESUME_STATE_PREFIX = "medveda:resume:"; // AsyncStorage key per in-flight download
const QUIZ_CLEANUP_KEY = "medveda:answer-free-quiz-downloads:v1";

// Active resumable handles, kept in memory only while the JS context is
// alive - lets pause()/cancel() act on a live download instantly.
const activeResumables = new Map<string, FileSystem.DownloadResumable>();
// Invalidating an operation happens before awaiting cancellation: native completion
// callbacks must not recreate another account's rows after logout or removal.
const operations = new Map<string, symbol>();
const pausedOperations = new Set<symbol>();
let clearing: Promise<void> | null = null;
let storageGeneration = 0;
let fileSequence = 0;

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
  if (!OFFLINE_DB_SUPPORTED) return [];
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
  if (!OFFLINE_DB_SUPPORTED) return null;
  const db = getDb();
  const row = db.getFirstSync(`SELECT * FROM downloads WHERE id = ?;`, [id]);
  return row ? rowToItem(row as any) : null;
}

function upsertRow(item: Partial<DownloadItem> & { id: string }): void {
  if (!OFFLINE_DB_SUPPORTED) return;
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
        retry_count = ?, error_message = ?, downloaded_at = ?, updated_at = ?,
        source_url = ?, content_version = ?
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
        merged.sourceUrl,
        merged.contentVersion,
        item.id,
      ]
    );
  }

  const fresh = getDownload(item.id);
  if (fresh) emit(fresh);
}

/** Every note transfer obtains a fresh URL through the entitlement-checking backend. */
export async function enqueueDownload(request: DownloadRequest): Promise<void> {
  await transferDownload(request);
}

async function transferDownload(request: DownloadRequest, saved?: FileSystem.DownloadPauseState): Promise<void> {
  if (!OFFLINE_DB_SUPPORTED || clearing || operations.has(request.id)) return;
  const operation = Symbol(request.id);
  const generation = storageGeneration;
  const owner = getCurrentUser()?.id;
  operations.set(request.id, operation);
  const current = () => operations.get(request.id) === operation &&
    storageGeneration === generation && getCurrentUser()?.id === owner;
  const dir = dirFor(request.contentType);
  const fileUri = saved?.fileUri ?? `${dir}${request.id}-${Date.now()}-${++fileSequence}.${request.contentType === "note" ? "pdf" : "json"}`;
  let resumable: FileSystem.DownloadResumable | undefined;
  try {
    if (!owner) throw new Error("Sign in again to download this note.");
    const sourceUrl = request.contentType === "note" ? await getSecureNoteUrl(request.id) : request.sourceUrl;
    if (!current()) return;
    if (request.contentType === "note") await recordNoteVerification(owner, request.id);
    if (!current()) return;
    await ensureDir(dir);
    if (!current()) return;
    const existing = getDownload(request.id);
    upsertRow({ ...request, sourceUrl, status: "downloading", errorMessage: null,
      retryCount: existing?.status === "failed" ? existing.retryCount + 1 : 0 });
    resumable = new FileSystem.DownloadResumable(sourceUrl, fileUri, saved?.options ?? {}, (progress) => {
      if (!current() || progress.totalBytesExpectedToWrite <= 0) return;
      upsertRow({ id: request.id, bytesWritten: progress.totalBytesWritten,
        fileSizeBytes: progress.totalBytesExpectedToWrite, status: "downloading" });
    }, saved?.resumeData);
    activeResumables.set(request.id, resumable);
    const result = await (saved ? resumable.resumeAsync() : resumable.downloadAsync());
    if (!current()) return;
    if (!result || result.status < 200 || result.status >= 300)
      throw new Error("Download did not complete. Please retry.");
    const info = await FileSystem.getInfoAsync(result.uri);
    if (!info.exists || !info.size) throw new Error("Downloaded file is empty. Please retry.");
    if (request.contentType === "note") {
      const headers = Object.fromEntries(Object.entries(result.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
      const expected = Number(headers["content-length"]);
      if (result.status !== 200 || (!headers["content-encoding"] && expected > 0 && info.size !== expected))
        throw new Error("Downloaded PDF is incomplete. Please retry.");
      // A storage error page must never become a completed PDF. Full native PDF
      // decoding still happens in the viewer; this rejects empty/HTML responses.
      const header = await FileSystem.readAsStringAsync(result.uri, {
        encoding: FileSystem.EncodingType.Base64, position: 0, length: 5,
      });
      if (header !== "JVBERi0=") throw new Error("Downloaded file is not a PDF. Please retry.");
    }
    if (!current()) return;
    await AsyncStorage.removeItem(RESUME_STATE_PREFIX + request.id);
    if (!current()) return;
    upsertRow({ id: request.id, localUri: result.uri, fileSizeBytes: info.size,
      bytesWritten: info.size, status: "completed", downloadedAt: Date.now(), errorMessage: null });
    if (existing?.localUri && existing.localUri !== result.uri)
      await FileSystem.deleteAsync(existing.localUri, { idempotent: true });
  } catch (error) {
    if (current() && owner && request.contentType === "note" && error instanceof NoteAccessError &&
        (error.status === 401 || error.status === 403)) {
      await AsyncStorage.setItem(`medveda:note-denied:${owner}:${request.id}`, "1");
      await clearNoteVerification(owner, request.id);
      if (current()) await cancelDownload(request.id);
      return;
    }
    // Native/network exceptions can include a signed URL. Store a safe message.
    if (current()) upsertRow({ ...request, status: "failed",
      errorMessage: "Download unavailable. Check your connection and access, then retry." });
  } finally {
    const completed = getDownload(request.id)?.localUri === fileUri;
    const paused = pausedOperations.delete(operation) && generation === storageGeneration && getCurrentUser()?.id === owner;
    if (!completed && !paused) await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    if (operations.get(request.id) === operation) operations.delete(request.id);
    if (activeResumables.get(request.id) === resumable) activeResumables.delete(request.id);
  }
}

export async function pauseDownload(id: string): Promise<void> {
  const resumable = activeResumables.get(id);
  if (!resumable) return;
  const generation = storageGeneration;
  const owner = getCurrentUser()?.id;
  const operation = operations.get(id);
  if (operation) pausedOperations.add(operation);
  operations.delete(id);
  activeResumables.delete(id);
  upsertRow({ id, status: "paused" });
  try {
    const saved = await resumable.pauseAsync();
    if (generation !== storageGeneration || getCurrentUser()?.id !== owner) return;
    await AsyncStorage.setItem(RESUME_STATE_PREFIX + id, JSON.stringify(saved));
  } catch {
    // Resume can safely restart if the native platform cannot preserve partial data.
  }
}

export async function resumeDownload(id: string): Promise<void> {
  const existing = getDownload(id);
  if (!existing) return;
  const generation = storageGeneration;
  const raw = await AsyncStorage.getItem(RESUME_STATE_PREFIX + id);
  if (generation !== storageGeneration) return;
  let saved: FileSystem.DownloadPauseState | undefined;
  try { saved = raw ? JSON.parse(raw) : undefined; } catch { /* restart corrupt state */ }
  // Expo resumeData binds to its original request. Without a server ETag/version
  // validator, stitching bytes from a refreshed signed URL can corrupt the PDF.
  // Notes restart with a fresh authorized URL; other identical requests can resume.
  if (existing.contentType === "note" || saved?.url !== existing.sourceUrl ||
      !saved?.fileUri?.startsWith(dirFor(existing.contentType))) {
    if (saved?.fileUri?.startsWith(dirFor(existing.contentType)))
      await FileSystem.deleteAsync(saved.fileUri, { idempotent: true });
    saved = undefined;
    await AsyncStorage.removeItem(RESUME_STATE_PREFIX + id);
  }
  if (generation !== storageGeneration) return;
  await transferDownload(existing, saved);
}

export async function retryDownload(id: string): Promise<void> {
  await resumeDownload(id);
}

/** Cancels + fully removes a download (queued, downloading, or paused). */
export async function cancelDownload(id: string): Promise<void> {
  operations.delete(id);
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
  if (!OFFLINE_DB_SUPPORTED) return;
  operations.delete(id);
  const owner = getCurrentUser()?.id;
  if (owner) await clearNoteVerification(owner, id);
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
  if (!OFFLINE_DB_SUPPORTED) return;
  if (clearing) return clearing;
  storageGeneration++;
  operations.clear();
  pausedOperations.clear();
  const transfers = [...activeResumables.values()];
  activeResumables.clear();
  clearing = (async () => {
    await Promise.allSettled(transfers.map((transfer) => transfer.cancelAsync()));
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(RESUME_STATE_PREFIX) || key.startsWith(OFFLINE_NOTE_VERIFICATION_PREFIX)));
    await FileSystem.deleteAsync(ROOT_DIR, { idempotent: true });
    getDb().runSync(`DELETE FROM downloads;`);
  })();
  try { await clearing; } finally { clearing = null; }
}

/**
 * Called once at app startup: any row stuck in 'downloading' means the
 * app was killed mid-transfer. We can't trust an in-memory resumable
 * handle exists anymore, so mark them 'paused' and let the user resume
 * (which safely re-downloads if no resumable state was persisted).
 */
export function recoverInterruptedDownloads(): void {
  if (!OFFLINE_DB_SUPPORTED) return;
  const db = getDb();
  db.runSync(`UPDATE downloads SET status = 'paused' WHERE status = 'downloading';`);
}

/** Remove legacy quiz JSON, including orphan files, before any screen can open it. */
export async function removeLegacyOfflineQuizzes(): Promise<void> {
  if (!OFFLINE_DB_SUPPORTED) return;
  if (await AsyncStorage.getItem(QUIZ_CLEANUP_KEY) === "1") return;

  // The old writer stored answer keys in this directory. Delete the whole
  // quiz directory so files without SQLite rows and all account/course copies
  // are covered. Notes live in a separate directory and remain untouched.
  await FileSystem.deleteAsync(dirFor("quiz"), { idempotent: true });
  getDb().runSync(`DELETE FROM downloads WHERE content_type = 'quiz';`);
  await AsyncStorage.setItem(QUIZ_CLEANUP_KEY, "1");
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
 * playable questions (without answer keys) are in memory by the time
 * the user taps Download - TestListScreen fetched it to render the
 * list. So there's nothing to fetch over HTTP; we just persist that
 * JSON to disk and record it as completed immediately. Kept in
 * downloadManager (not a separate module) so it shares the same
 * downloads table / storage stats / DownloadsScreen UI as Notes.
 */
function publicQuizData(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const quiz = value as Record<string, unknown>;
  if (!Array.isArray(quiz.questions)) return { ...quiz, questions: [] };
  return {
    ...quiz,
    questions: quiz.questions.map((entry: unknown) => {
      const question = entry && typeof entry === "object"
        ? entry as Record<string, unknown> : {};
      return {
        question: typeof question.question === "string" ? question.question : "",
        options: Array.isArray(question.options)
          ? question.options.filter((option): option is string => typeof option === "string") : [],
      };
    }),
  };
}

export async function saveQuizForOffline(params: {
  id: string;
  title: string;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;
  quizData: unknown; // the full QuizTest object (with questions[])
}): Promise<void> {
  if (!OFFLINE_DB_SUPPORTED) return;
  if (clearing) return;
  const generation = storageGeneration;
  const owner = getCurrentUser()?.id;
  const dir = dirFor("quiz");
  await ensureDir(dir);
  if (!owner || generation !== storageGeneration || getCurrentUser()?.id !== owner) return;

  const fileUri = `${dir}${params.id}.json`;
  const json = JSON.stringify(publicQuizData(params.quizData));
  await FileSystem.writeAsStringAsync(fileUri, json);

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  const size = fileInfo.exists ? (fileInfo.size ?? json.length) : json.length;
  if (generation !== storageGeneration || getCurrentUser()?.id !== owner) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    return;
  }

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
  const safe = publicQuizData(JSON.parse(raw)) as T;
  // Scrub an older download when opened; never reintroduce a legacy answer key.
  const clean = JSON.stringify(safe);
  if (clean !== raw) {
    try {
      await FileSystem.writeAsStringAsync(localUri, clean);
    } catch {
      // Never open a legacy file while its answer-bearing copy remains on disk.
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      throw new Error("This offline quiz needs to be downloaded again.");
    }
  }
  return safe;
}

export function isDownloaded(id: string): boolean {
  return getDownload(id)?.status === "completed";
}
