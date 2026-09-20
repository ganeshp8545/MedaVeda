import {
  getProductsByChapter,
  getProductsBySubject,
  getProductsByYear,
  getBundleProducts,
  getAllActiveProducts,
} from "../repositories/productsRepository";

export type { Product, ProductScope } from "../types/product";

export {
  getProductsByChapter as fetchProductsByChapter,
  getProductsBySubject as fetchProductsBySubject,
  getProductsByYear as fetchProductsByYear,
  getBundleProducts as fetchBundleProducts,
  getAllActiveProducts as fetchAllProducts,
};

export async function fetchBuyOptionsForChapter(
  chapterId: string,
  subjectId: string,
  yearId: string,
  courseId?: string
) {
  const [chapterProducts, subjectProducts, yearProducts, bundleProducts] = await Promise.all([
    getProductsByChapter(chapterId),
    getProductsBySubject(subjectId),
    getProductsByYear(yearId),
    getBundleProducts(courseId),
  ]);

  const relevantBundles = bundleProducts.filter((product) =>
    (product.yearIds ?? []).includes(yearId)
  );

  return [...chapterProducts, ...subjectProducts, ...yearProducts, ...relevantBundles];
}
