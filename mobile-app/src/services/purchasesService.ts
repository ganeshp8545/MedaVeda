import { getCurrentUser } from "./authState";
import { getPurchasesByUser } from "../repositories/purchasesRepository";
import { ProductScope } from "../types/product";
import { OwnedScope, MyPurchase } from "../types/purchase";

export type { OwnedScope, MyPurchase } from "../types/purchase";

export async function fetchOwnedScopes(): Promise<OwnedScope[]> {
  const uid = getCurrentUser()?.id;
  if (!uid) return [];

  const docs = await getPurchasesByUser(uid);
  return docs as unknown as OwnedScope[];
}

const SCOPE_FALLBACK_LABEL: Record<ProductScope, string> = {
  chapter: "Chapter Pack",
  subject: "Subject Pack",
  year: "Year Pack",
  bundle: "Multi-Year Bundle",
};

// Purchase record with display-friendly fields, for the dashboard's
// "Purchased Packages" section. Falls back to a generic label per scope
// if the purchase doc (written by the verify-payment function) doesn't
// carry a product title.
export async function fetchMyPurchases(): Promise<MyPurchase[]> {
  const uid = getCurrentUser()?.id;
  if (!uid) return [];

  const docs = await getPurchasesByUser(uid);

  const results = docs.map((data: any) => ({
    id: data.id,
    title:
      data.productTitle ??
      data.title ??
      data.subjectTitle ??
      data.yearTitle ??
      SCOPE_FALLBACK_LABEL[data.scope as ProductScope] ??
      "Package",
    scope: data.scope as ProductScope,
    purchasedAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt ?? data.purchasedAt,
    amount: typeof data.amount === "number" ? data.amount : undefined,
    status: data.status ?? data.paymentStatus ?? undefined,
    orderId: data.orderId ?? data.razorpayOrderId ?? undefined,
  }));

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
