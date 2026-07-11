import { collection, getDocs, query, where } from "firebase/firestore";

import { db, auth } from "../config/firebase";
import { ProductScope } from "./productsService";

// Written ONLY by the verify-payment Firebase Cloud Function (via the
// Firebase Admin SDK). Each purchase doc carries a copy of the product's
// scope fields, so the app can check "do I own this?" with simple local
// comparisons instead of re-fetching the product every time.
export interface OwnedScope {
  scope: ProductScope;
  chapterId?: string;
  subjectId?: string;
  yearId?: string;
  yearIds?: string[];
}

export async function fetchOwnedScopes(): Promise<OwnedScope[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const q = query(collection(db, "purchases"), where("userId", "==", uid));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => d.data() as OwnedScope);
}

// Purchase record with display-friendly fields, for the dashboard's
// "Purchased Packages" section. Falls back to a generic label per scope
// if the purchase doc (written by the verify-payment function) doesn't
// carry a product title.
export interface MyPurchase {
  id: string;
  title: string;
  scope: ProductScope;
  purchasedAt?: number;

  // Optional - only present once the verify-payment function starts
  // writing them (or for older purchase docs that predate these fields).
  // Screens must not assume these exist.
  amount?: number;
  status?: "success" | "pending" | "failed" | string;
  orderId?: string;
}

const SCOPE_FALLBACK_LABEL: Record<ProductScope, string> = {
  chapter: "Chapter Pack",
  subject: "Subject Pack",
  year: "Year Pack",
  bundle: "Multi-Year Bundle",
};

export async function fetchMyPurchases(): Promise<MyPurchase[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const q = query(collection(db, "purchases"), where("userId", "==", uid));
  const snapshot = await getDocs(q);

  const results = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as any;
    return {
      id: docSnap.id,
      title:
        data.productTitle ??
        data.title ??
        data.subjectTitle ??
        data.yearTitle ??
        SCOPE_FALLBACK_LABEL[data.scope as ProductScope] ??
        "Package",
      scope: data.scope as ProductScope,
      purchasedAt: data.createdAt?.toMillis
        ? data.createdAt.toMillis()
        : data.createdAt ?? data.purchasedAt,
      amount: typeof data.amount === "number" ? data.amount : undefined,
      status: data.status ?? data.paymentStatus ?? undefined,
      orderId: data.orderId ?? data.razorpayOrderId ?? undefined,
    };
  });

  return results.sort((a, b) => (b.purchasedAt ?? 0) - (a.purchasedAt ?? 0));
}

// A chapter is unlocked if the user owns:
//  - that exact chapter, OR
//  - the subject it belongs to, OR
//  - the year it belongs to, OR
//  - a multi-year bundle that includes its year.
export function isChapterUnlocked(
  ownedScopes: OwnedScope[],
  chapter: { id: string; subjectId: string; yearId: string }
): boolean {
  return ownedScopes.some((owned) => {
    if (owned.scope === "chapter") return owned.chapterId === chapter.id;
    if (owned.scope === "subject") return owned.subjectId === chapter.subjectId;
    if (owned.scope === "year") return owned.yearId === chapter.yearId;
    if (owned.scope === "bundle") return (owned.yearIds ?? []).includes(chapter.yearId);
    return false;
  });
}

// Used by Store/Search screens to show "Owned" vs a price on a Product card
// itself (as opposed to checking a specific chapter).
export function isProductOwned(
  ownedScopes: OwnedScope[],
  product: {
    scope: ProductScope;
    chapterId?: string;
    subjectId?: string;
    yearId?: string;
    yearIds?: string[];
  }
): boolean {
  return ownedScopes.some((owned) => {
    if (product.scope === "chapter") {
      if (owned.scope === "chapter") return owned.chapterId === product.chapterId;
      if (owned.scope === "subject") return owned.subjectId === product.subjectId;
      if (owned.scope === "year") return owned.yearId === product.yearId;
      if (owned.scope === "bundle") return (owned.yearIds ?? []).includes(product.yearId ?? "");
    }
    if (product.scope === "subject") {
      if (owned.scope === "subject") return owned.subjectId === product.subjectId;
      if (owned.scope === "year") return owned.yearId === product.yearId;
      if (owned.scope === "bundle") return (owned.yearIds ?? []).includes(product.yearId ?? "");
    }
    if (product.scope === "year") {
      if (owned.scope === "year") return owned.yearId === product.yearId;
      if (owned.scope === "bundle") return (owned.yearIds ?? []).includes(product.yearId ?? "");
    }
    if (product.scope === "bundle") {
      if (owned.scope === "bundle") {
        const a = new Set(owned.yearIds ?? []);
        return (product.yearIds ?? []).every((y) => a.has(y));
      }
    }
    return false;
  });
}
