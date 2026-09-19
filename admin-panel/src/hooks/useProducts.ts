import { useEffect, useState } from "react";

import {
  addProduct,
  deleteProduct,
  getProducts,
  updateProduct,
} from "../services/productService";

import type { Product, ProductInput } from "../types/product";

export default function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load products. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function createProduct(data: ProductInput) {
    await addProduct(data);
    await loadProducts();
  }

  async function editProduct(id: string, data: ProductInput) {
    await updateProduct(id, data);
    await loadProducts();
  }

  async function removeProduct(id: string) {
    await deleteProduct(id);
    await loadProducts();
  }

  return {
    products,
    loading,
    error,
    reload: loadProducts,
    createProduct,
    editProduct,
    removeProduct,
  };
}
