import { useEffect, useMemo, useState } from "react";

import type { Year } from "../types/year";
import type { Subject } from "../types/subject";
import type { Chapter } from "../types/chapter";

type Props = {
  years: Year[];
  subjects: Subject[];
  chapters: Chapter[];
  chapterId: string;
  onChange: (chapterId: string, chapterTitle: string) => void;
  error?: string;
};

export default function ChapterPicker({
  years,
  subjects,
  chapters,
  chapterId,
  onChange,
  error,
}: Props) {
  // Pre-select Year/Subject dropdowns based on the currently chosen chapter
  // (important when editing an existing Note/Video item).
  const selectedChapter = chapters.find((c) => c.id === chapterId);

  const [yearId, setYearId] = useState(selectedChapter?.yearId ?? "");
  const [subjectId, setSubjectId] = useState(selectedChapter?.subjectId ?? "");

  useEffect(() => {
    setYearId(selectedChapter?.yearId ?? "");
    setSubjectId(selectedChapter?.subjectId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const subjectsInYear = useMemo(
    () => subjects.filter((s) => s.yearId === yearId),
    [subjects, yearId]
  );

  const chaptersInSubject = useMemo(
    () => chapters.filter((c) => c.subjectId === subjectId),
    [chapters, subjectId]
  );

  return (
    <div className="mb-4 grid grid-cols-3 gap-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Year
        </label>
        <select
          value={yearId}
          onChange={(e) => {
            setYearId(e.target.value);
            setSubjectId("");
            onChange("", "");
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        >
          <option value="">-- Select --</option>
          {years.map((year) => (
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
            onChange("", "");
          }}
          disabled={!yearId}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-100"
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
            onChange(e.target.value, chapter?.title ?? "");
          }}
          disabled={!subjectId}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-100"
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
