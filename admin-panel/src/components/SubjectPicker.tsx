import { useEffect, useMemo, useState } from "react";

import CoursePicker from "./CoursePicker";

import type { Course } from "../types/course";
import type { Year } from "../types/year";
import type { Subject } from "../types/subject";

type Props = {
  // When provided, a Course select is shown first and everything below it
  // is limited to that course. Omit it to keep the old Year -> Subject picker.
  courses?: Course[];
  years: Year[];
  subjects: Subject[];
  subjectId: string;
  onChange: (
    subjectId: string,
    subjectTitle: string,
    yearId: string,
    yearTitle: string,
    courseId: string
  ) => void;
  error?: string;
};

const selectClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-100";

// Same idea as ChapterPicker, but stops one level higher - MedVeda 2.0
// content (like Quiz Tests) is scoped to a Subject, not a Chapter.
// Changing a parent resets everything below it.
export default function SubjectPicker({
  courses,
  years,
  subjects,
  subjectId,
  onChange,
  error,
}: Props) {
  const selectedSubject = subjects.find((s) => s.id === subjectId);

  const [courseId, setCourseId] = useState(selectedSubject?.courseId ?? "");
  const [yearId, setYearId] = useState(selectedSubject?.yearId ?? "");

  // Only sync from an existing selection - a reset to "" (parent changed)
  // must not wipe the parent the admin just picked.
  useEffect(() => {
    if (selectedSubject) {
      setCourseId(selectedSubject.courseId ?? "");
      setYearId(selectedSubject.yearId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const yearsInCourse = useMemo(
    () => (courses ? years.filter((y) => y.courseId === courseId) : years),
    [courses, years, courseId]
  );

  const subjectsInYear = useMemo(
    () => subjects.filter((s) => s.yearId === yearId),
    [subjects, yearId]
  );

  return (
    <div className={`mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 ${courses ? "lg:grid-cols-3" : ""}`}>
      {courses && (
        <CoursePicker
          courses={courses}
          value={courseId}
          onChange={(id) => {
            setCourseId(id);
            setYearId("");
            onChange("", "", "", "", id);
          }}
        />
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Year
        </label>
        <select
          value={yearId}
          onChange={(e) => {
            const year = years.find((y) => y.id === e.target.value);
            setYearId(e.target.value);
            onChange("", "", e.target.value, year?.title ?? "", courseId);
          }}
          disabled={!!courses && !courseId}
          className={selectClass}
        >
          <option value="">-- Select --</option>
          {yearsInCourse.map((year) => (
            <option key={year.id} value={year.id}>
              {year.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Subject
        </label>
        <select
          value={subjectId}
          onChange={(e) => {
            const subject = subjects.find((s) => s.id === e.target.value);
            onChange(
              e.target.value,
              subject?.title ?? "",
              subject?.yearId ?? yearId,
              subject?.yearTitle ?? "",
              subject?.courseId ?? courseId
            );
          }}
          disabled={!yearId}
          className={selectClass}
        >
          <option value="">-- Select --</option>
          {subjectsInYear.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.title}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
