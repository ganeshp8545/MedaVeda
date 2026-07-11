import {
  collection,
  getDocs,
  query,
  where,
  Query,
  DocumentData,
} from "firebase/firestore";

import { db } from "../config/firebase";

export type ProductScope =
  | "chapter"
  | "subject"
  | "year"
  | "bundle";

export interface Product {
  id: string;

  title: string;
  description: string;

  scope: ProductScope;

  price: number;
  active: boolean;

  chapterId?: string;

  subjectId?: string;
  subjectTitle?: string;

  yearId?: string;
  yearTitle?: string;

  yearIds?: string[];
}

const productsCollection = collection(db, "products");

async function runQuery(
  q: Query<DocumentData>
): Promise<Product[]> {
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<Product, "id">;

    return {
      id: docSnap.id,
      ...data,
    };
  });
}

export async function fetchProductsByChapter(
  chapterId: string
): Promise<Product[]> {
  return runQuery(
    query(
      productsCollection,
      where("scope", "==", "chapter"),
      where("chapterId", "==", chapterId),
      where("active", "==", true)
    )
  );
}

export async function fetchProductsBySubject(
  subjectId: string
): Promise<Product[]> {
  return runQuery(
    query(
      productsCollection,
      where("scope", "==", "subject"),
      where("subjectId", "==", subjectId),
      where("active", "==", true)
    )
  );
}

export async function fetchProductsByYear(
  yearId: string
): Promise<Product[]> {
  return runQuery(
    query(
      productsCollection,
      where("scope", "==", "year"),
      where("yearId", "==", yearId),
      where("active", "==", true)
    )
  );
}

export async function fetchBundleProducts(): Promise<Product[]> {
  return runQuery(
    query(
      productsCollection,
      where("scope", "==", "bundle"),
      where("active", "==", true)
    )
  );
}

export async function fetchBuyOptionsForChapter(
  chapterId: string,
  subjectId: string,
  yearId: string
): Promise<Product[]> {
  const [
    chapterProducts,
    subjectProducts,
    yearProducts,
    bundleProducts,
  ] = await Promise.all([
    fetchProductsByChapter(chapterId),
    fetchProductsBySubject(subjectId),
    fetchProductsByYear(yearId),
    fetchBundleProducts(),
  ]);

  const relevantBundles = bundleProducts.filter((product) =>
    (product.yearIds ?? []).includes(yearId)
  );

  return [
    ...chapterProducts,
    ...subjectProducts,
    ...yearProducts,
    ...relevantBundles,
  ];
}

export async function fetchAllProducts(): Promise<Product[]> {
  return runQuery(
    query(
      productsCollection,
      where("active", "==", true)
    )
  );
}