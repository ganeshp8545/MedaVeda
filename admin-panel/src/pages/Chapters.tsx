import { useMemo, useState } from "react";

import useChapters from "../hooks/useChapters";
import useYears from "../hooks/useYears";
import useSubjects from "../hooks/useSubjects";

import ChapterTable from "../components/ChapterTable";
import ChapterFormModal from "../components/ChapterFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import Button from "../components/Button";

import type { Chapter, ChapterInput } from "../types/chapter";

export default function Chapters() {
  const {
    chapters,
    loading,
    error,
    createChapter,
    editChapter,
    removeChapter,
  } = useChapters();

  const { years, loading: yearsLoading } = useYears();
  const { subjects, loading: subjectsLoading } = useSubjects();

  const [yearFilter, setYearFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Chapter | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [deleting, setDeleting] = useState(false);

  const subjectsInYearFilter = useMemo(
    () => (yearFilter ? subjects.filter((s) => s.yearId === yearFilter) : subjects),
    [subjects, yearFilter]
  );

  const filteredChapters = useMemo(() => {
    return chapters.filter((c) => {
      if (yearFilter && c.yearId !== yearFilter) return false;
      if (subjectFilter && c.subjectId !== subjectFilter) return false;
      return true;
    });
  }, [chapters, yearFilter, subjectFilter]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(chapter: Chapter) {
    setEditing(chapter);
    setFormOpen(true);
  }

  async function handleSubmit(data: ChapterInput) {
    if (editing) {
      await editChapter(editing.id, data);
    } else {
      await createChapter(data);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await removeChapter(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const canCreate = !yearsLoading && !subjectsLoading && years.length > 0 && subjects.length > 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Chapters</h2>
          <p className="text-sm text-gray-500">
            Each Chapter belongs to one Subject. Notes and Videos are
            added inside a Chapter.
          </p>
        </div>

        <Button onClick={openCreate} disabled={!canCreate}>
          + New Chapter
        </Button>
      </div>

      {!yearsLoading && years.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Year first.
        </p>
      )}

      {!subjectsLoading && years.length > 0 && subjects.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Subject first.
        </p>
      )}

      <div className="mb-4 flex gap-3">
        <select
          value={yearFilter}
          onChange={(e) => {
            setYearFilter(e.target.value);
            setSubjectFilter("");
          }}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        >
          <option value="">All Years</option>
          {years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.title}
            </option>
          ))}
        </select>

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        >
          <option value="">All Subjects</option>
          {subjectsInYearFilter.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.title}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-gray-400">Loading...</p>}

      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <ChapterTable
          chapters={filteredChapters}
          subjects={subjects}
          years={years}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      <ChapterFormModal
        open={formOpen}
        years={years}
        subjects={subjects}
        initialData={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Chapter?"
        message={`"${deleteTarget?.title}" and its notes/videos links will be affected. This action cannot be undone.`}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
