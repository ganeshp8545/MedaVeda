import type { Year } from "../types/year";

type Props = {
  years: Year[];
  onEdit: (year: Year) => void;
  onDelete: (year: Year) => void;
};

export default function YearTable({ years, onEdit, onDelete }: Props) {
  if (years.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No years created yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-5 py-3">Order</th>
            <th className="px-5 py-3">Year</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {years.map((year) => (
            <tr key={year.id} className="border-t last:border-b-0">
              <td className="px-5 py-3 text-gray-500">{year.order}</td>

              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                    style={{ backgroundColor: `${year.color}22` }}
                  >
                    {year.icon}
                  </span>
                  <span className="font-medium text-gray-800">
                    {year.title}
                  </span>
                </div>
              </td>

              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    year.active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {year.active ? "Active" : "Inactive"}
                </span>
              </td>

              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onEdit(year)}
                  className="mr-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(year)}
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
