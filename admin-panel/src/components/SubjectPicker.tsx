import { useEffect, useMemo, useState } from "react";

import type { Year } from "../types/year";
import type { Subject } from "../types/subject";

type Props = {
  years: Year[];
  subjects: Subject[];
  subjectId: string;
  onChange: (
    subjectId: string,
    subjectTitle: string,
    yearId: string,
    yearTitle: string
  ) => void;
  error?: string;
};

// Same idea as ChapterPicker, but stops one level higher - MedVeda 2.0
// content (like Quiz Tests) is scoped to a Subject, not a Chapter.
export default function SubjectPicker({
  years,
  subjects,
  subjectId,
  onChange,
  error,
}: Props) {
  const selectedSubject = subjects.find((s) => s.id === subjectId);

  const [yearId, setYearId] = useState(selectedSubject?.yearId ?? "");

  useEffect(() => {
    setYearId(selectedSubject?.yearId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const subjectsInYear = useMemo(
    () => subjects.filter((s) => s.yearId === yearId),
    [subjects, yearId]
  );

  return (
    <div className="mb-4 grid grid-cols-2 gap-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Year
        </label>
        <select
          value={yearId}
          onChange={(e) => {
            const year = years.find((y) => y.id === e.target.value);
            setYearId(e.target.value);
            onChange("", "", e.target.value, year?.title ?? "");
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
            const subject = subjects.find((s) => s.id === e.target.value);
            onChange(
              e.target.value,
              subject?.title ?? "",
              subject?.yearId ?? yearId,
              subject?.yearTitle ?? ""
            );
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
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
