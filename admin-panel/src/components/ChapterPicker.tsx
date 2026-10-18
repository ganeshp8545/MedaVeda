import { useEffect, useMemo, useState } from "react";

import CoursePicker from "./CoursePicker";

import type { Course } from "../types/course";
import type { Year } from "../types/year";
import type { Subject } from "../types/subject";
import type { Chapter } from "../types/chapter";

type Props = {
  // When provided, a Course select is shown first and everything below it
  // is limited to that course. Omit it to keep the old Year -> Subject ->
  // Chapter picker.
  courses?: Course[];
  years: Year[];
  subjects: Subject[];
  chapters: Chapter[];
  chapterId: string;
  onChange: (
    chapterId: string,
    chapterTitle: string,
    yearId: string,
    courseId: string
  ) => void;
  error?: string;
};

const selectClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-100";

// Changing a parent resets everything below it. The chapter callback always
// reports the year/course the admin is currently on, so a form can keep them
// even before a chapter is chosen.
export default function ChapterPicker({
  courses,
  years,
  subjects,
  chapters,
  chapterId,
  onChange,
  error,
}: Props) {
  // Pre-select the dropdowns based on the currently chosen chapter
  // (important when editing an existing Note item).
  const selectedChapter = chapters.find((c) => c.id === chapterId);

  const [courseId, setCourseId] = useState(selectedChapter?.courseId ?? "");
  const [yearId, setYearId] = useState(selectedChapter?.yearId ?? "");
  const [subjectId, setSubjectId] = useState(selectedChapter?.subjectId ?? "");

  useEffect(() => {
    if (selectedChapter) {
      setCourseId(selectedChapter.courseId ?? "");
      setYearId(selectedChapter.yearId);
      setSubjectId(selectedChapter.subjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const yearsInCourse = useMemo(
    () => (courses ? years.filter((y) => y.courseId === courseId) : years),
    [courses, years, courseId]
  );

  const subjectsInYear = useMemo(
    () => subjects.filter((s) => s.yearId === yearId),
    [subjects, yearId]
  );

  const chaptersInSubject = useMemo(
    () => chapters.filter((c) => c.subjectId === subjectId),
    [chapters, subjectId]
  );

  return (
    <div className={`mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 ${courses ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {courses && (
        <CoursePicker
          courses={courses}
          value={courseId}
          onChange={(id) => {
            setCourseId(id);
            setYearId("");
            setSubjectId("");
            onChange("", "", "", id);
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
            setYearId(e.target.value);
            setSubjectId("");
            onChange("", "", e.target.value, courseId);
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
            setSubjectId(e.target.value);
            onChange("", "", yearId, courseId);
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
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Chapter
        </label>
        <select
          value={chapterId}
          onChange={(e) => {
            const chapter = chapters.find((c) => c.id === e.target.value);
            onChange(
              e.target.value,
              chapter?.title ?? "",
              chapter?.yearId ?? yearId,
              chapter?.courseId ?? courseId
            );
          }}
          disabled={!subjectId}
          className={selectClass}
        >
          <option value="">-- Select --</option>
          {chaptersInSubject.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.title}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
