// OFFLINE MODE - shared types across DownloadManager, SyncEngine, UI.

export type DownloadContentType = "note" | "quiz";

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed";

export interface DownloadItem {
  id: string;
  contentType: DownloadContentType;
  title: string;
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;
  sourceUrl: string;
  localUri: string | null;
  fileSizeBytes: number;
  bytesWritten: number;
  status: DownloadStatus;
  retryCount: number;
  errorMessage: string | null;
  contentVersion: number;
  downloadedAt: number | null;
  updatedAt: number;
}

export interface DownloadRequest {
  id: string;
  contentType: DownloadContentType;
  title: string;
  sourceUrl: string;
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;
  contentVersion?: number;
}

export type SyncEntityType =
  | "quiz_attempt"
  | "bookmark"
  | "reading_progress"
  | "watch_history";

export interface SyncQueueItem {
  queueId: string;
  entityType: SyncEntityType;
  operation: "upsert" | "delete";
  payload: Record<string, unknown>;
  createdAt: number;
  attemptCount: number;
  lastError: string | null;
  syncedAt: number | null;
}

export interface StorageStats {
  totalBytes: number;
  noteBytes: number;
  quizBytes: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
}
