type Props = {
  open: boolean;
  title: string;
  message: string;
  loading?: boolean;
  confirmLabel?: string;
  loadingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  loading = false,
  confirmLabel = "Delete",
  loadingLabel = "Deleting...",
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <p className="mt-2 text-sm text-gray-500">{message}</p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
