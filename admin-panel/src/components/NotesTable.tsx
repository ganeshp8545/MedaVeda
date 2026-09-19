import type { Note } from "../types/note";
import type { Chapter } from "../types/chapter";

type Props = {
  notes: Note[];
  chapters: Chapter[];
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
};

export default function NotesTable({ notes, chapters, onEdit, onDelete }: Props) {
  if (notes.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No notes created yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-green-700 text-white">
          <tr>
            <th className="p-4 text-left">Order</th>
            <th className="p-4 text-left">Title</th>
            <th className="p-4 text-left">Chapter</th>
            <th className="p-4 text-left">Status</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {notes.map((note) => (
            <tr key={note.id} className="border-b hover:bg-gray-50">
              <td className="p-4 text-gray-500">{note.order}</td>

              <td className="p-4">{note.title}</td>

              <td className="p-4">
                {chapters.find((c) => c.id === note.chapterId)?.title ?? "-"}
              </td>

              <td className="p-4">
                {note.active ? "🟢 Active" : "🔴 Inactive"}
              </td>

              <td className="p-4 text-right">
                <button
                  onClick={() => onEdit(note)}
                  className="mr-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(note)}
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
