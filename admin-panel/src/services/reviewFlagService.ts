import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { fetchAllPages } from "../utils/filters";

// Rows written by the database when an order needs a human look (referral / wallet
// anti-abuse, late payments, ...). Admin-only table (RLS); resolving goes through
// admin_resolve_order_flag(), which records who resolved it and why.
export interface ReviewFlag {
  id: string;
  orderId: string | null;
  userId: string | null;
  reason: string;
  walletAmount: number | null;
  referralDiscount: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export async function getReviewFlags(includeResolved: boolean): Promise<ReviewFlag[]> {
  const rows = await fetchAllPages<any>(() => {
    let query = supabase.from("order_review_flags").select("*")
      .order("created_at", { ascending: false }).order("id");
    if (!includeResolved) query = query.is("resolved_at", null);
    return query;
  });
  return rows.map((row) => toCamelCase<ReviewFlag>(row));
}

export async function resolveReviewFlag(flagId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("admin_resolve_order_flag", {
    p_flag_id: flagId,
    p_note: note,
  });
  if (error) throw error;
}
