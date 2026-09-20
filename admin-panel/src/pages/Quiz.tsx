import { useMemo, useState } from "react";
import useCourses from "../hooks/useCourses";
import CoursePicker from "../components/CoursePicker";

import useQuiz from "../hooks/useQuiz";
import useYears from "../hooks/useYears";
import useSubjects from "../hooks/useSubjects";

import QuizHeader from "../components/QuizHeader";
import QuizTable from "../components/QuizTable";
import QuizFormModal from "../components/QuizFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import SearchBar from "../components/SearchBar";

import type { QuizTest, QuizTestInput } from "../types/quiz";

export default function Quiz() {
  const { courses } = useCourses();
  const [courseFilter, setCourseFilter] = useState("");

  const { tests, loading, error, createTest, editTest, removeTest } = useQuiz({ courseId: courseFilter || undefined });

  const { years } = useYears();
  const { subjects } = useSubjects();

  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QuizTest | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<QuizTest | null>(null);
  const [deleting, setDeleting] = useState(false);

  const subjectsForFilter = useMemo(
    () => (courseFilter ? subjects.filter((s) => s.courseId === courseFilter) : subjects),
    [subjects, courseFilter]
  );

  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const matchesSearch = t.title
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesSubject = !subjectId || t.subjectId === subjectId;

      return matchesSearch && matchesSubject;
    });
  }, [tests, search, subjectId]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(test: QuizTest) {
    setEditing(test);
    setFormOpen(true);
  }

  async function handleSubmit(data: QuizTestInput) {
    if (editing) {
      await editTest(editing.id, data);
    } else {
      await createTest(data);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await removeTest(deleteTarget.id);
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
      <QuizHeader onAdd={openCreate} />

      {subjects.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Subject first before adding a Quiz Test.
        </p>
      )}

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="w-48">
          <CoursePicker
            courses={courses}
            value={courseFilter}
            onChange={(id) => {
              setCourseFilter(id);
              setSubjectId("");
            }}
            label=""
            placeholder="All Courses"
          />
        </div>

        <SearchBar value={search} onChange={setSearch} />

        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="">All Subjects</option>
          {subjectsForFilter.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.title}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {filteredTests.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center shadow">
          <h2 className="text-xl font-semibold">
            No Tests Found
          </h2>

          <p className="text-gray-500 mt-2">
            Try changing your filters.
          </p>
        </div>
      ) : (
        <QuizTable
          tests={filteredTests}
          subjects={subjects}
          years={years}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      <QuizFormModal
        open={formOpen}
        courses={courses}
        years={years}
        subjects={subjects}
        initialData={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Quiz Test?"
        message="This test and all of its questions will be permanently deleted. This action cannot be undone."
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}
