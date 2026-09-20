import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";

import * as downloadManager from "../utils/downloadManager";
import { getCourseYear } from "../services/courseState";
import { DownloadItem, DownloadRequest, StorageStats } from "../types/offline";

/**
 * OFFLINE MODE - replaces the old notes-only useDownloads. Backs onto
 * SQLite via downloadManager, supports notes + quizzes, and exposes
 * pause/resume/retry/cancel for a real download-manager UX.
 */
export default function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StorageStats>({
    totalBytes: 0,
    noteBytes: 0,
    quizBytes: 0,
    totalItems: 0,
    completedItems: 0,
    failedItems: 0,
  });

  const refresh = useCallback(() => {
    try {
      setDownloads(downloadManager.getAllDownloads(getCourseYear().courseId));
      setStats(downloadManager.getStorageStats());
    } catch (err) {
      console.error("Failed to load downloads:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Live progress: any download event anywhere in the app refreshes
    // this list, so DownloadsScreen and a note card's inline progress
    // ring stay perfectly in sync without polling.
    const unsubscribe = downloadManager.subscribeToDownloadEvents(() => refresh());
    return unsubscribe;
  }, [refresh]);

  async function start(request: DownloadRequest) {
    try {
      await downloadManager.enqueueDownload(request);
    } catch (err: any) {
      Alert.alert("Download Failed", err?.message || "Could not download this item.");
    }
  }

  async function saveQuiz(params: {
    id: string;
    title: string;
    subjectId: string;
    subjectTitle: string;
    yearId: string;
    yearTitle: string;
    quizData: unknown;
  }) {
    try {
      await downloadManager.saveQuizForOffline(params);
    } catch (err: any) {
      Alert.alert("Download Failed", err?.message || "Could not save this quiz for offline use.");
    }
  }

  async function pause(id: string) {
    await downloadManager.pauseDownload(id);
  }

  async function resume(id: string) {
    await downloadManager.resumeDownload(id);
  }

  async function retry(id: string) {
    await downloadManager.retryDownload(id);
  }

  async function cancel(id: string) {
    await downloadManager.cancelDownload(id);
    refresh();
  }

  async function remove(id: string) {
    await downloadManager.removeDownload(id);
    refresh();
  }

  async function clearAll() {
    await downloadManager.clearAllDownloads();
    refresh();
  }

  function getItem(id: string): DownloadItem | null {
    return downloads.find((d) => d.id === id) ?? null;
  }

  function isDownloaded(id: string): boolean {
    return getItem(id)?.status === "completed";
  }

  return {
    downloads,
    stats,
    loading,
    start,
    saveQuiz,
    pause,
    resume,
    retry,
    cancel,
    remove,
    clearAll,
    getItem,
    isDownloaded,
    refresh,
  };
}
