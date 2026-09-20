import { useMemo, useState } from "react";

import useCourses from "../hooks/useCourses";
import { countYearsInCourse } from "../services/courseService";

import CourseTable from "../components/CourseTable";
import CourseFormModal from "../components/CourseFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import SearchBar from "../components/SearchBar";
import Button from "../components/Button";

import type { Course, CourseInput } from "../types/course";

export default function Courses() {
  const {
    courses,
    loading,
    error,
    createCourse,
    editCourse,
    toggleCourseActive,
    removeCourse,
  } = useCourses();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  // A course that still has years can't be deleted (the DB restricts it) -
  // offer to deactivate it instead.
  const [blocked, setBlocked] = useState<{ course: Course; years: number } | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Course | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredCourses = useMemo(() => {
    const term = search.toLowerCase();
    return courses.filter((course) => {
      const matchesSearch =
        course.name.toLowerCase().includes(term) ||
        course.code.toLowerCase().includes(term);
      const matchesActive =
        !activeFilter || (activeFilter === "active" ? course.active : !course.active);
      return matchesSearch && matchesActive;
    });
  }, [courses, search, activeFilter]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(course: Course) {
    setEditing(course);
    setFormOpen(true);
  }

  async function handleSubmit(data: CourseInput & { id?: string }) {
    if (editing) {
      await editCourse(editing.id, data);
    } else {
      await createCourse(data);
    }
  }

  async function requestDelete(course: Course) {
    setActionError(null);
    try {
      const years = await countYearsInCourse(course.id);
      if (years > 0) setBlocked({ course, years });
      else setDeleteTarget(course);
    } catch (err: any) {
      setActionError(err?.message ?? "Could not check this course. Please try again.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await removeCourse(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteTarget(null);
      setActionError(err?.message ?? "Could not delete this course.");
    } finally {
      setDeleting(false);
    }
  }

  async function runToggle(course: Course) {
    try {
      setSaving(true);
      await toggleCourseActive(course.id, !course.active);
    } catch (err: any) {
      setActionError(err?.message ?? "Could not update this course.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    await runToggle(pendingToggle);
    setPendingToggle(null);
  }

  async function deactivateBlocked() {
    if (!blocked) return;
    await runToggle(blocked.course);
    setBlocked(null);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Courses</h2>
          <p className="text-sm text-gray-500">
            Each course (BAMS, BHMS...) has its own years, subjects and content.
          </p>
        </div>

        <Button onClick={openCreate}>+ New Course</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search courses..." />

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading && <p className="text-gray-400">Loading...</p>}

      {error && <p className="text-red-500">{error}</p>}

      {actionError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {!loading && !error && (
        <CourseTable
          courses={filteredCourses}
          onEdit={openEdit}
          onDelete={requestDelete}
          onToggleActive={(course) =>
            course.active ? setPendingToggle(course) : runToggle(course)
          }
        />
      )}

      <CourseFormModal
        open={formOpen}
        initialData={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Course?"
        message={`"${deleteTarget?.name}" has no years and will be permanently deleted. This action cannot be undone.`}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!blocked}
        title="Can't delete this course"
        message={`"${blocked?.course.name}" still has ${blocked?.years} year${
          blocked?.years === 1 ? "" : "s"
        }. Deleting it would remove students' content, so it is blocked. Deactivate it instead to hide it from students.`}
        confirmLabel={blocked?.course.active ? "Deactivate" : "OK"}
        loadingLabel="Saving..."
        loading={saving}
        onCancel={() => setBlocked(null)}
        onConfirm={() => (blocked?.course.active ? deactivateBlocked() : setBlocked(null))}
      />

      <ConfirmDialog
        open={!!pendingToggle}
        title="Deactivate Course?"
        message={`"${pendingToggle?.name}" and all its years will be hidden from students. Existing purchases are kept.`}
        confirmLabel="Deactivate"
        loadingLabel="Saving..."
        loading={saving}
        onCancel={() => setPendingToggle(null)}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
