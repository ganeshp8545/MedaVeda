import { useCallback, useEffect, useState } from "react";

import {
  fetchOwnedScopes,
  isChapterUnlocked,
  isProductOwned,
  OwnedScope,
} from "../services/purchasesService";
import { Product } from "../services/productsService";

/**
 * Tracks everything the current user owns (as purchase "scopes" - chapter,
 * subject, year, or multi-year bundle), so screens can check "is this
 * chapter/product unlocked?" without re-fetching on every check.
 */
export default function usePurchases() {
  const [ownedScopes, setOwnedScopes] = useState<OwnedScope[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const scopes = await fetchOwnedScopes();
      setOwnedScopes(scopes);
    } catch (err) {
      console.error("Failed to load purchases:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function isChapterOwned(chapter: { id: string; subjectId: string; yearId: string }) {
    return isChapterUnlocked(ownedScopes, chapter);
  }

  function isOwned(product: Product) {
    return isProductOwned(ownedScopes, product);
  }

  return { ownedScopes, isChapterOwned, isOwned, refresh, loading };
}
