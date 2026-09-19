import { supabase } from "../config/supabase";

async function countRows(table: string) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function getDashboardStats() {
  const [years, subjects, products, users, notes, videos, quiz] = await Promise.all([
    countRows("years"),
    countRows("subjects"),
    countRows("products"),
    countRows("profiles"),
    countRows("notes"),
    countRows("videos"),
    countRows("quiz_tests"),
  ]);

  return { years, subjects, products, users, notes, videos, quiz };
}
