import type { Product } from "../types/product";
import type { BillingStatus } from "../services/playBillingSyncService";

type Props = {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  billing: Record<string, BillingStatus>;
  onRetryBilling: (product: Product) => void;
};

const SCOPE_LABELS: Record<string, string> = {
  chapter: "Single Chapter",
  subject: "Full Subject",
  year: "Full Year",
  bundle: "Multi-Year Bundle",
};

function scopeTarget(product: Product): string {
  if (product.scope === "chapter") {
    return `${product.chapterTitle ?? "-"} (${product.subjectTitle ?? "-"})`;
  }
  if (product.scope === "subject") {
    return `${product.subjectTitle ?? "-"} (${product.yearTitle ?? "-"})`;
  }
  if (product.scope === "year") {
    return product.yearTitle ?? "-";
  }
  if (product.scope === "bundle") {
    return (product.yearTitles ?? []).join(" + ") || "-";
  }
  return "-";
}

export default function ProductTable({ products, onEdit, onDelete, billing, onRetryBilling }: Props) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No products created yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-green-700 text-white">
          <tr>
            <th className="p-4 text-left">Title</th>
            <th className="p-4 text-left">Unlocks</th>
            <th className="p-4 text-left">Covers</th>
            <th className="p-4 text-left">Type</th>
            <th className="p-4 text-left">Price</th>
            <th className="p-4 text-left">Status</th>
            <th className="p-4 text-left">Google Play Billing</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-b hover:bg-gray-50">
              <td className="p-4">{product.title}</td>

              <td className="p-4">
                {SCOPE_LABELS[product.scope] ?? product.scope}
              </td>

              <td className="p-4 text-gray-600">{scopeTarget(product)}</td>

              <td className="p-4">
                {product.productType === "notes" || product.productType === "notes_bundle" ? (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    {product.productType === "notes" ? "Notes" : "Notes bundle"}
                  </span>
                ) : (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {product.productType === "video" ? "Video" : "Untagged"}
                  </span>
                )}
              </td>

              <td className="p-4">
                ₹ {product.price}
                {!!product.originalPrice && product.originalPrice > product.price && (
                  <span className="ml-2 text-xs text-gray-400 line-through">
                    ₹ {product.originalPrice}
                  </span>
                )}
              </td>

              <td className="p-4">
                {product.active ? "🟢 Active" : "🔴 Inactive"}
              </td>

              <td className="p-4 text-xs text-gray-700">
                <div className="font-semibold">{billing[product.id]?.billing_status ?? "Pending"}</div>
                {billing[product.id]?.play_sku && <div>Product ID: {billing[product.id].play_sku}</div>}
                {billing[product.id]?.purchase_option_id && <div>BUY option: {billing[product.id].purchase_option_id}</div>}
                {billing[product.id]?.synced_price != null &&
                  <div>Synced: {billing[product.id].currency_code} {billing[product.id].synced_price}</div>}
                {billing[product.id]?.last_synced_at &&
                  <div>Last sync: {new Date(billing[product.id].last_synced_at!).toLocaleString()}</div>}
                {billing[product.id]?.last_error &&
                  <div className="text-red-700">{billing[product.id].last_error}</div>}
                {product.active && product.price > 0 && billing[product.id] &&
                  !["ready", "not_billable_notes", "catalog_inactive"].includes(billing[product.id].billing_status) &&
                  <button onClick={() => onRetryBilling(product)} className="text-green-700 underline">Retry sync</button>}
              </td>

              <td className="p-4 text-right">
                <button
                  onClick={() => onEdit(product)}
                  className="mr-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(product)}
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
