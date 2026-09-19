import type { QuizTest } from "../types/quiz";
import type { Subject } from "../types/subject";
import type { Year } from "../types/year";

type Props = {
  tests: QuizTest[];
  subjects: Subject[];
  years: Year[];
  onEdit: (test: QuizTest) => void;
  onDelete: (test: QuizTest) => void;
};

export default function QuizTable({ tests, subjects, years, onEdit, onDelete }: Props) {
  if (tests.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No quiz tests created yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-green-700 text-white">
          <tr>
            <th className="p-4 text-left">Order</th>
            <th className="p-4 text-left">Test Title</th>
            <th className="p-4 text-left">Subject</th>
            <th className="p-4 text-left">Year</th>
            <th className="p-4 text-left">Questions</th>
            <th className="p-4 text-left">Status</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {tests.map((t) => (
            <tr key={t.id} className="border-b hover:bg-gray-50">
              <td className="p-4 text-gray-500">{t.order}</td>

              <td className="p-4 max-w-md truncate">{t.title}</td>

              <td className="p-4">{subjects.find((s) => s.id === t.subjectId)?.title ?? "-"}</td>

              <td className="p-4">{years.find((y) => y.id === t.yearId)?.title ?? "-"}</td>

              <td className="p-4 text-gray-500">{t.questions?.length ?? 0}</td>

              <td className="p-4">
                {t.active ? "🟢 Active" : "🔴 Inactive"}
              </td>

              <td className="p-4 text-right">
                <button
                  onClick={() => onEdit(t)}
                  className="mr-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(t)}
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
