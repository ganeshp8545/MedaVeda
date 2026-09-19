import { useMemo, useState } from "react";

import useProducts from "../hooks/useProducts";
import useYears from "../hooks/useYears";
import useSubjects from "../hooks/useSubjects";
import useChapters from "../hooks/useChapters";

import ProductHeader from "../components/ProductHeader";
import ProductFilter from "../components/ProductFilter";
import ProductTable from "../components/ProductTable";
import ProductFormModal from "../components/ProductFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import SearchBar from "../components/SearchBar";

import type { Product, ProductInput } from "../types/product";

export default function Products() {
  const { products, loading, error, createProduct, editProduct, removeProduct } =
    useProducts();

  const { years } = useYears();
  const { subjects } = useSubjects();
  const { chapters } = useChapters();

  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.title
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesScope = !scope || product.scope === scope;

      return matchesSearch && matchesScope;
    });
  }, [products, search, scope]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setFormOpen(true);
  }

  async function handleSubmit(data: ProductInput) {
    if (editing) {
      await editProduct(editing.id, data);
    } else {
      await createProduct(data);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await removeProduct(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <h2>Loading...</h2>;
  }

  return (
    <div>
      <ProductHeader onAdd={openCreate} />

      {years.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Year (and Subject) before adding Products.
        </p>
      )}

      <div className="flex gap-4 mb-6">
        <SearchBar value={search} onChange={setSearch} />
        <ProductFilter value={scope} onChange={setScope} />
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      <ProductTable
        products={filteredProducts}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
      />

      <ProductFormModal
        open={formOpen}
        years={years}
        subjects={subjects}
        chapters={chapters}
        initialData={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Product?"
        message={`"${deleteTarget?.title}" will be permanently deleted. This action cannot be undone.`}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
