import { useState } from "react";

import useCourses from "../hooks/useCourses";
import CoursePicker from "../components/CoursePicker";

import useYears from "../hooks/useYears";

import YearTable from "../components/YearTable";
import YearFormModal from "../components/YearFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import Button from "../components/Button";

import type { Year, YearInput } from "../types/year";

export default function Years() {
  const { courses } = useCourses();
  const [courseFilter, setCourseFilter] = useState("");

  const { years, loading, error, createYear, editYear, removeYear } =
    useYears({ courseId: courseFilter || undefined });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Year | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Year | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(year: Year) {
    setEditing(year);
    setFormOpen(true);
  }

  async function handleSubmit(data: YearInput) {
    if (editing) {
      await editYear(editing.id, data);
    } else {
      await createYear(data);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      await removeYear(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete year.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            Academic Years
          </h2>
          <p className="text-sm text-gray-500">
            Manage the academic years students can browse.
          </p>
        </div>

        <Button onClick={openCreate}>+ New Year</Button>
      </div>

      <div className="mb-4 flex gap-3">
        <div className="w-48">
          <CoursePicker
            courses={courses}
            value={courseFilter}
            onChange={setCourseFilter}
            label=""
            placeholder="All Courses"
          />
        </div>
      </div>

      {loading && <p className="text-gray-400">Loading...</p>}

      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <YearTable
          years={years}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      <YearFormModal
        open={formOpen}
        courses={courses}
        initialData={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      {deleteError && <p className="text-red-500" role="alert">{deleteError}</p>}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Year?"
        message={`"${deleteTarget?.title}" will be permanently deleted. This action cannot be undone.`}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
