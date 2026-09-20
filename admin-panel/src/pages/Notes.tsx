import { useMemo, useState } from "react";
import useCourses from "../hooks/useCourses";
import CoursePicker from "../components/CoursePicker";

import useNotes from "../hooks/useNotes";
import useYears from "../hooks/useYears";
import useSubjects from "../hooks/useSubjects";
import useChapters from "../hooks/useChapters";

import NotesHeader from "../components/NotesHeader";
import NotesTable from "../components/NotesTable";
import NoteFormModal from "../components/NoteFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import SearchBar from "../components/SearchBar";

import type { Note, NoteInput } from "../types/note";

export default function Notes() {
  const { courses } = useCourses();
  const [courseFilter, setCourseFilter] = useState("");

  const { notes, loading, error, createNote, editNote, removeNote } =
    useNotes({ courseId: courseFilter || undefined });

  const { years } = useYears();
  const { subjects } = useSubjects();
  const { chapters } = useChapters();

  const [search, setSearch] = useState("");
  const [chapterId, setChapterId] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  const chaptersForFilter = useMemo(
    () => (courseFilter ? chapters.filter((c) => c.courseId === courseFilter) : chapters),
    [chapters, courseFilter]
  );

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const matchesSearch = note.title
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesChapter = !chapterId || note.chapterId === chapterId;

      return matchesSearch && matchesChapter;
    });
  }, [notes, search, chapterId]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(note: Note) {
    setEditing(note);
    setFormOpen(true);
  }

  async function handleSubmit(data: NoteInput) {
    if (editing) {
      await editNote(editing.id, data);
    } else {
      await createNote(data);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await removeNote(deleteTarget.id);
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
      <NotesHeader onAdd={openCreate} />

      {chapters.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Chapter first before adding Notes.
        </p>
      )}

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="w-48">
          <CoursePicker
            courses={courses}
            value={courseFilter}
            onChange={(id) => {
              setCourseFilter(id);
              setChapterId("");
            }}
            label=""
            placeholder="All Courses"
          />
        </div>

        <SearchBar value={search} onChange={setSearch} />

        <select
          value={chapterId}
          onChange={(e) => setChapterId(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="">All Chapters</option>
          {chaptersForFilter.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.title}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {filteredNotes.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center shadow">
          <h2 className="text-xl font-semibold">
            No Notes Found
          </h2>

          <p className="text-gray-500 mt-2">
            Try changing your filters.
          </p>
        </div>
      ) : (
        <NotesTable
          notes={filteredNotes}
          chapters={chapters}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      <NoteFormModal
        open={formOpen}
        courses={courses}
        years={years}
        subjects={subjects}
        chapters={chapters}
        initialData={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Note?"
        message={`"${deleteTarget?.title}" will be permanently deleted. This action cannot be undone.`}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}
