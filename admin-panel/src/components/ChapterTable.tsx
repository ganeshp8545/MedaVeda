import type { Chapter } from "../types/chapter";
import type { Subject } from "../types/subject";
import type { Year } from "../types/year";

type Props = {
  chapters: Chapter[];
  subjects: Subject[];
  years: Year[];
  onEdit: (chapter: Chapter) => void;
  onDelete: (chapter: Chapter) => void;
};

export default function ChapterTable({ chapters, subjects, years, onEdit, onDelete }: Props) {
  if (chapters.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No chapters created yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-5 py-3">Order</th>
            <th className="px-5 py-3">Chapter</th>
            <th className="px-5 py-3">Subject</th>
            <th className="px-5 py-3">Year</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {chapters.map((chapter) => (
            <tr key={chapter.id} className="border-t last:border-b-0">
              <td className="px-5 py-3 text-gray-500">{chapter.order}</td>

              <td className="px-5 py-3 font-medium text-gray-800">
                {chapter.title}
              </td>

              <td className="px-5 py-3 text-gray-600">
                {subjects.find((s) => s.id === chapter.subjectId)?.title ?? "-"}
              </td>

              <td className="px-5 py-3 text-gray-600">
                {years.find((y) => y.id === chapter.yearId)?.title ?? "-"}
              </td>

              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    chapter.active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {chapter.active ? "Active" : "Inactive"}
                </span>
              </td>

              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onEdit(chapter)}
                  className="mr-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(chapter)}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
