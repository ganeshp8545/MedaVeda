import { useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import {
  addVideo,
  deleteVideo,
  getVideos,
  updateVideo,
} from "../services/videoService";

import type { Video, VideoInput } from "../types/video";

export default function useVideos(filters: ContentFilters = {}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadVideos();
  }, [filters.courseId, filters.yearId]);

  async function loadVideos() {
    try {
      setLoading(true);
      const data = await getVideos(filters);
      setVideos(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load videos. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function createVideo(data: VideoInput) {
    await addVideo(data);
    await refreshAfterMutation();
  }

  async function editVideo(id: string, data: VideoInput) {
    await updateVideo(id, data);
    await refreshAfterMutation();
  }

  async function removeVideo(id: string) {
    await deleteVideo(id);
    await refreshAfterMutation();
  }

  async function refreshAfterMutation() {
    try {
      const data = await getVideos(filters);
      setVideos(data);
      setError(null);
    } catch {
      setError("The video change succeeded, but the list could not refresh. Reload this page before retrying.");
    }
  }

  return {
    videos,
    loading,
    error,
    reload: refreshAfterMutation,
    createVideo,
    editVideo,
    removeVideo,
  };
}
