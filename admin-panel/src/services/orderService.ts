import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import type { Order, OrderStatus } from "../types/order";
import { applyContentFilters, fetchAllPages } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "orders";

// Orders join user + product info for display (the Firestore version
// denormalized these fields onto the order itself; Postgres joins them
// live instead, so the data is never stale).
export async function getOrders(filters: ContentFilters = {}): Promise<Order[]> {
  // orders has no year_id of its own that means "this order's year", so
  // only the course filter applies.
  const rows = await fetchAllPages<any>(() => applyContentFilters(
    supabase
      .from(TABLE)
      .select(`*, products ( title ), courses ( name )`)
      .order("created_at", { ascending: false }).order("id"),
    { courseId: filters.courseId }
  ));

  // orders.user_id references auth.users, not profiles, so PostgREST cannot
  // embed profiles on orders. Fetch the names/emails separately. user_id is
  // null for deleted accounts (their order rows are kept for tax records but
  // anonymised), so those are labelled instead of looked up.
  const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))] as string[];
  const profileById = new Map<string, { name: string; email: string }>();
  for (let i = 0; i < userIds.length; i += 100) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds.slice(i, i + 100));
    if (profilesError) throw profilesError;
    for (const p of profiles ?? []) profileById.set(p.id, { name: p.name, email: p.email });
  }

  return rows.map((row: any) => {
    const profile = row.user_id ? profileById.get(row.user_id) : undefined;
    return {
      ...toCamelCase<Order>(row),
      userDeleted: !row.user_id,
      userName: row.user_id ? profile?.name ?? "" : "Deleted user",
      userEmail: profile?.email ?? "",
      productTitle: row.products?.title ?? "",
      courseTitle: row.courses?.name ?? "",
      paymentId: row.razorpay_payment_id ?? undefined,
    };
  });
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  // Direct UPDATEs on orders are no longer allowed for any client. Admins can
  // only cancel/fail an unpaid order, through this RPC (never mark it paid).
  const { error } = await supabase.rpc("admin_set_order_status", { p_order_id: id, p_status: status });
  if (error) throw error;
}
