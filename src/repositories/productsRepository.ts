import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import { Product } from "../types/product";

// The "products" table itself only stores subject_id/year_id (see the
// admin panel's productService.ts - chapterTitle/subjectTitle/yearTitle
// are UI-only and never written to the DB). So every read here joins the
// "subjects"/"years" tables live to resolve the display title - otherwise
// subjectTitle/yearTitle always come back empty on every screen that
// shows a Product (Search, Store, Home, Downloads...).
const SELECT_WITH_TITLES = "*, subjects ( title ), years ( title )";

function mapRow(row: any): Product {
  const product = toCamelCase<Product>(row);
  return {
    ...product,
    subjectTitle: row.subjects?.title ?? undefined,
    yearTitle: row.years?.title ?? undefined,
  };
}

async function runQuery(builder: any): Promise<Product[]> {
  const { data, error } = await builder;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function getProductsByChapter(chapterId: string): Promise<Product[]> {
  return runQuery(
    supabase
      .from("products")
      .select(SELECT_WITH_TITLES)
      .eq("scope", "chapter")
      .eq("chapter_id", chapterId)
      .eq("active", true)
  );
}

export async function getProductsBySubject(subjectId: string): Promise<Product[]> {
  return runQuery(
    supabase
      .from("products")
      .select(SELECT_WITH_TITLES)
      .eq("scope", "subject")
      .eq("subject_id", subjectId)
      .eq("active", true)
  );
}

export async function getProductsByYear(yearId: string): Promise<Product[]> {
  return runQuery(
    supabase
      .from("products")
      .select(SELECT_WITH_TITLES)
      .eq("scope", "year")
      .eq("year_id", yearId)
      .eq("active", true)
  );
}

export async function getBundleProducts(courseId?: string): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select(SELECT_WITH_TITLES)
    .eq("scope", "bundle")
    .eq("active", true);
  if (courseId) query = query.eq("course_id", courseId);
  return runQuery(query);
}

export async function getAllActiveProducts(courseId?: string): Promise<Product[]> {
  let query = supabase.from("products").select(SELECT_WITH_TITLES).eq("active", true);
  if (courseId) query = query.eq("course_id", courseId);
  return runQuery(query);
}
