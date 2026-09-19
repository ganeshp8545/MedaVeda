type Props = {
  onAdd: () => void;
};

export default function ProductHeader({
  onAdd,
}: Props) {
  return (
    <div className="flex items-center justify-between mb-6">

      <div>
        <h1 className="text-3xl font-bold">
          Products
        </h1>

        <p className="text-gray-500 mt-1">
          Manage all products available in the Store.
        </p>
      </div>

      <button
        onClick={onAdd}
        className="bg-green-700 hover:bg-green-800 text-white px-5 py-2 rounded-lg font-medium"
      >
        + Add Product
      </button>

    </div>
  );
}