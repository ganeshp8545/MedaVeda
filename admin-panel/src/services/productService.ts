import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type { Product, ProductInput } from "../types/product";
import { applyContentFilters, omitBlankIds } from "../utils/filters";
import type { ContentFilters } from "../types/filters";

const TABLE = "products";

// products.year_id only means "the scope='year' target", so only the course
// filter is applied here (see applyContentFilters).
export async function getProducts(filters: ContentFilters = {}): Promise<Product[]> {
  const { data, error } = await applyContentFilters(
    supabase.from(TABLE).select("*").order("created_at", { ascending: false }),
    { courseId: filters.courseId }
  );
  if (error) throw error;
  return (data ?? []).map((row: any) => toCamelCase<Product>(row));
}

// A Product only ever uses the id field(s) matching its `scope` (see
// types/product.ts) - the others are left as "" by the form. Postgres'
// uuid columns reject "" outright ("invalid input syntax for type uuid"),
// so any unused id must become `null`, not "", before it reaches Supabase.
function nullifyEmptyIds(payload: Record<string, any>) {
  const idKeys = ["chapterId", "subjectId", "yearId", "courseId"];
  const cleaned = { ...payload };
  for (const key of idKeys) {
    if (cleaned[key] === "") cleaned[key] = null;
  }
  return cleaned;
}

// chapterTitle / subjectTitle / yearTitle / yearTitles are UI-only display
// fields - not columns on the "products" table - so they must be stripped
// before sending to Supabase.
// Postgres error code for a unique-constraint violation. On the "products"
// table this fires when a Year/Subject/Chapter already has a Product
// pointing at it for that scope (e.g. two "full year" products for the
// same Year) - the DB enforces "one active product per target" so buyers
// never see two competing prices for the same thing.
const UNIQUE_VIOLATION = "23505";

function friendlyProductError(error: any): Error {
  if (error?.code === UNIQUE_VIOLATION) {
    return new Error(
      "A product already exists for this Year/Subject/Chapter. Edit the existing product instead, or pick a different selection."
    );
  }
  return error;
}

export async function addProduct(data: ProductInput) {
  const { chapterTitle, subjectTitle, yearTitle, yearTitles, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).insert(toSnakeCase(nullifyEmptyIds(payload)));
  if (error) throw friendlyProductError(error);
}

export async function updateProduct(id: string, data: ProductInput) {
  const { chapterTitle, subjectTitle, yearTitle, yearTitles, courseTitle, ...payload } = data;
  const { error } = await supabase.from(TABLE).update(toSnakeCase(nullifyEmptyIds(payload))).eq("id", id);
  if (error) throw friendlyProductError(error);
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
