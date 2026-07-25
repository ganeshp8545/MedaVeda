import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";

// The "users" collection is now the "profiles" table, auto-created by a
// database trigger the moment someone signs up (see schema.sql). Its
// primary key is the Supabase auth user's uuid - same role Firebase's
// uid played before.
//
// BUG FIX: without an explicit return type here, TypeScript's inference
// for `{ uid: ..., ...someRecordStringAny }` collapses down to just
// `{ uid: any }` - it silently drops the spread's index signature
// instead of keeping it. That made every caller's `data.name`,
// `data.email`, etc. a type error, even though the actual runtime value
// has those fields. Explicit return type fixes it for every caller at
// once, not just the read site.
export async function getUserDoc(
  uid: string
): Promise<({ uid: string } & Record<string, any>) | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { uid: data.id, ...toCamelCase<Record<string, any>>(data) };
}

export async function setUserDoc(uid: string, data: Record<string, any>): Promise<void> {
  const { error } = await supabase.from("profiles").update(toSnakeCase(data)).eq("id", uid);
  if (error) throw error;
}
