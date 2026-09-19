import type { Subject } from "../types/subject";
import type { Year } from "../types/year";

type Props = {
  subjects: Subject[];
  years: Year[];
  onEdit: (subject: Subject) => void;
  onDelete: (subject: Subject) => void;
};

export default function SubjectTable({ subjects, years, onEdit, onDelete }: Props) {
  if (subjects.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No subjects created yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-5 py-3">Order</th>
            <th className="px-5 py-3">Subject</th>
            <th className="px-5 py-3">Year</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {subjects.map((subject) => (
            <tr key={subject.id} className="border-t last:border-b-0">
              <td className="px-5 py-3 text-gray-500">{subject.order}</td>

              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                    style={{ backgroundColor: `${subject.color}22` }}
                  >
                    {subject.icon}
                  </span>
                  <span className="font-medium text-gray-800">
                    {subject.title}
                  </span>
                </div>
              </td>

              <td className="px-5 py-3 text-gray-600">
                {years.find((y) => y.id === subject.yearId)?.title ?? "-"}
              </td>

              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    subject.active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {subject.active ? "Active" : "Inactive"}
                </span>
              </td>

              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onEdit(subject)}
                  className="mr-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(subject)}
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
