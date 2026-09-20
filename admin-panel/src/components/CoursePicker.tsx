import type { Course } from "../types/course";

type Props = {
  courses: Course[];
  value: string;
  onChange: (courseId: string) => void;
  error?: string;
  label?: string;
  // Text of the empty option. Filters pass "All courses"; forms keep the
  // default so an unchosen course is obvious.
  placeholder?: string;
  disabled?: boolean;
};

const selectClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-100";

// Top of the Course -> Year -> Subject -> Chapter cascade. Renders no outer
// margin so it fits inside the pickers' grids as well as standalone
// (wrap it in a `mb-4` div in a form).
export default function CoursePicker({
  courses,
  value,
  onChange,
  error,
  label = "Course",
  placeholder = "-- Select --",
  disabled,
}: Props) {
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={selectClass}
      >
        <option value="">{placeholder}</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
            {course.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
