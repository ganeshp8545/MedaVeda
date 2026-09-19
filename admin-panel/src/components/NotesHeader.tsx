type Props = {
  onAdd: () => void;
};

export default function NotesHeader({ onAdd }: Props) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-3xl font-bold">
          Notes
        </h1>

        <p className="text-gray-500">
          Manage all MedVeda Notes
        </p>
      </div>

      <button
        onClick={onAdd}
        className="bg-green-700 hover:bg-green-800 text-white px-5 py-2 rounded-lg"
      >
        + Add Note
      </button>
    </div>
  );
}