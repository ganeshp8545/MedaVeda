import type { Video } from "../types/video";
import type { Subject } from "../types/subject";

type Props = {
  videos: Video[];
  subjects: Subject[];
  onEdit: (video: Video) => void;
  onDelete: (video: Video) => void;
};

export default function VideosTable({ videos, subjects, onEdit, onDelete }: Props) {
  if (videos.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No videos created yet.
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
            <th className="p-4 text-left">Subject</th>
            <th className="p-4 text-left">Status</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {videos.map((video) => (
            <tr key={video.id} className="border-b hover:bg-gray-50">
              <td className="p-4 text-gray-500">{video.order}</td>

              <td className="p-4">{video.title}</td>

              <td className="p-4">
                {subjects.find((s) => s.id === video.subjectId)?.title ?? "-"}
              </td>

              <td className="p-4">
                {video.active ? "🟢 Active" : "🔴 Inactive"}
              </td>

              <td className="p-4 text-right">
                <button
                  onClick={() => onEdit(video)}
                  className="mr-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(video)}
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
