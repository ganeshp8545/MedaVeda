import { useMemo, useState } from "react";

import useVideos from "../hooks/useVideos";
import useYears from "../hooks/useYears";
import useSubjects from "../hooks/useSubjects";

import VideosHeader from "../components/VideosHeader";
import VideosTable from "../components/VideosTable";
import VideoFormModal from "../components/VideoFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import SearchBar from "../components/SearchBar";

import type { Video, VideoInput } from "../types/video";

export default function Videos() {
  const { videos, loading, error, createVideo, editVideo, removeVideo } =
    useVideos();

  const { years } = useYears();
  const { subjects } = useSubjects();

  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const matchesSearch = video.title
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesSubject = !subjectId || video.subjectId === subjectId;

      return matchesSearch && matchesSubject;
    });
  }, [videos, search, subjectId]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(video: Video) {
    setEditing(video);
    setFormOpen(true);
  }

  async function handleSubmit(data: VideoInput) {
    if (editing) {
      await editVideo(editing.id, data);
    } else {
      await createVideo(data);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await removeVideo(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <h2 className="text-xl">
        Loading...
      </h2>
    );
  }

  return (
    <>
      <VideosHeader onAdd={openCreate} />

      {subjects.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Subject first before adding Videos.
        </p>
      )}

      <div className="flex flex-wrap gap-4 mb-6">
        <SearchBar value={search} onChange={setSearch} />

        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="">All Subjects</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.title}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {filteredVideos.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center shadow">
          <h2 className="text-xl font-semibold">
            No Videos Found
          </h2>

          <p className="text-gray-500 mt-2">
            Try changing your filters.
          </p>
        </div>
      ) : (
        <VideosTable
          videos={filteredVideos}
          subjects={subjects}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      <VideoFormModal
        open={formOpen}
        years={years}
        subjects={subjects}
        initialData={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Video?"
        message={`"${deleteTarget?.title}" will be permanently deleted. This action cannot be undone.`}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}
