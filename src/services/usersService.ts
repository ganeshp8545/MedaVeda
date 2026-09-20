import { getUserDoc, setUserDoc } from "../repositories/usersRepository";
import { UserProfile, UserRole } from "../types/user";
import { supabase } from "../config/supabase";

export type { UserProfile, UserRole } from "../types/user";

// Called right after signup. Uses merge:true so it's safe to call more
// than once (e.g. retried after a transient failure) without overwriting
// fields written elsewhere.
//
// NOTE: does NOT send `role` - the "profiles" table has no such column
// (admin-vs-student is decided server-side by the `admins` table / the
// am_i_admin() RPC, never by anything the client writes). Sending it used
// to make this whole update fail silently, so the student's name never
// got saved after signup.
export async function createUserProfile(
  uid: string,
  data: { name: string; email: string }
): Promise<void> {
  await setUserDoc(uid, {
    name: data.name,
    email: data.email,
    createdAt: Date.now(),
  });
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const data = await getUserDoc(uid);
  if (!data) return null;

  return {
    uid: data.uid,
    name: data.name ?? "",
    email: data.email ?? "",
    mobile: data.phone ?? undefined,
    role: "student",
    createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
    courseId: data.courseId ?? undefined,
    courseTitle: data.courseTitle ?? undefined,
    yearId: data.yearId ?? undefined,
    yearTitle: data.yearTitle ?? undefined,
    referralCode: data.referralCode ?? "",
  };
}

// The only allowed way for a student to change their course/year: profiles
// has a guard trigger that rejects direct writes to course_id/year_id, and
// set_my_course_year() validates the pair (year must belong to course).
// Passing a null year clears it.
export async function setMyCourseYear(courseId: string, yearId: string | null): Promise<void> {
  const { error } = await supabase.rpc("set_my_course_year", {
    p_course_id: courseId,
    p_year_id: yearId,
  });
  if (error) throw new Error(error.message || "Could not update your course. Please try again.");
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<UserProfile, "name" | "mobile">>
): Promise<void> {
  // The DB column is "phone", not "mobile". Translate here so every
  // screen can keep using the friendlier `mobile` name without knowing
  // about the DB's naming.
  const { mobile, ...rest } = data;
  await setUserDoc(uid, {
    ...rest,
    ...(mobile !== undefined ? { phone: mobile } : {}),
  });
}

// Permanently deletes the signed-in student's account (Play Store account
// deletion requirement). The anon key used on the client can never delete
// an auth.users row itself, so this calls a Supabase Edge Function
// ("delete-account") that runs with the service-role key server-side to:
//   1. delete the row from "profiles" (and any owned data via FK cascade
//      / RLS-safe cleanup on the server), then
//   2. delete the corresponding auth.users row via supabase.auth.admin.
// The client only signs the local session out after the server confirms
// success, so a failed/partial deletion never leaves the user stuck
// logged-out with data still on the server.
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke("delete-account");

  if (error) {
    throw new Error(error.message || "Failed to delete account. Please try again.");
  }

  await supabase.auth.signOut();
}
