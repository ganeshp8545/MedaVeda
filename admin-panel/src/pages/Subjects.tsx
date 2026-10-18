import { useMemo, useState } from "react";
import useCourses from "../hooks/useCourses";
import CoursePicker from "../components/CoursePicker";

import useSubjects from "../hooks/useSubjects";
import useYears from "../hooks/useYears";

import SubjectTable from "../components/SubjectTable";
import SubjectFormModal from "../components/SubjectFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import Button from "../components/Button";

import type { Subject, SubjectInput } from "../types/subject";

export default function Subjects() {
  const { courses } = useCourses();
  const [courseFilter, setCourseFilter] = useState("");

  const { subjects, loading, error, createSubject, editSubject, removeSubject } =
    useSubjects({ courseId: courseFilter || undefined });

  const { years, loading: yearsLoading } = useYears();

  const [yearFilter, setYearFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const yearsForFilter = useMemo(
    () => (courseFilter ? years.filter((y) => y.courseId === courseFilter) : years),
    [years, courseFilter]
  );

  const filteredSubjects = useMemo(() => {
    if (!yearFilter) return subjects;
    return subjects.filter((s) => s.yearId === yearFilter);
  }, [subjects, yearFilter]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(subject: Subject) {
    setEditing(subject);
    setFormOpen(true);
  }

  async function handleSubmit(data: SubjectInput) {
    if (editing) {
      await editSubject(editing.id, data);
    } else {
      await createSubject(data);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      await removeSubject(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete subject.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Subjects</h2>
          <p className="text-sm text-gray-500">
            Each Subject belongs to one Year.
          </p>
        </div>

        <Button onClick={openCreate} disabled={yearsLoading || years.length === 0}>
          + New Subject
        </Button>
      </div>

      {years.length === 0 && !yearsLoading && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Year in "Academic Years" first.
        </p>
      )}

      <div className="mb-4 flex gap-3">
        <div className="w-48">
          <CoursePicker
            courses={courses}
            value={courseFilter}
            onChange={(id) => {
              setCourseFilter(id);
              setYearFilter("");
            }}
            label=""
            placeholder="All Courses"
          />
        </div>

        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        >
          <option value="">All Years</option>
          {yearsForFilter.map((year) => (
            <option key={year.id} value={year.id}>
              {year.title}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-gray-400">Loading...</p>}

      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <SubjectTable
          subjects={filteredSubjects}
          years={years}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      <SubjectFormModal
        open={formOpen}
        courses={courses}
        years={years}
        initialData={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      {deleteError && <p className="text-red-500" role="alert">{deleteError}</p>}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Subject?"
        message={`"${deleteTarget?.title}" will be permanently deleted. This action cannot be undone.`}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
