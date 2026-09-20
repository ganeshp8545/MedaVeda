import type { Course } from "../types/course";

type Props = {
  courses: Course[];
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  onToggleActive: (course: Course) => void;
};

export default function CourseTable({ courses, onEdit, onDelete, onToggleActive }: Props) {
  if (courses.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No courses found.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-5 py-3">Order</th>
            <th className="px-5 py-3">Course</th>
            <th className="px-5 py-3">Code</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {courses.map((course) => (
            <tr key={course.id} className="border-t last:border-b-0">
              <td className="px-5 py-3 text-gray-500">{course.displayOrder}</td>

              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-lg">
                    {course.icon || "🎓"}
                  </span>
                  <div>
                    <div className="font-medium text-gray-800">{course.name}</div>
                    {course.description && (
                      <div className="text-xs text-gray-500">{course.description}</div>
                    )}
                  </div>
                </div>
              </td>

              <td className="px-5 py-3 font-mono text-xs text-gray-600">{course.code}</td>

              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    course.active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {course.active ? "Active" : "Inactive"}
                </span>
              </td>

              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onEdit(course)}
                  className="mr-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onToggleActive(course)}
                  className="mr-3 text-sm font-medium text-amber-600 hover:underline"
                >
                  {course.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => onDelete(course)}
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
