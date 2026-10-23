import { getUserDoc, setUserDoc } from "../repositories/usersRepository";
import { UserProfile } from "../types/user";
import { supabase } from "../config/supabase";
import { performSignOut } from "./authState";

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
    emailVerified: data.emailVerified ?? false,
    mobileVerified: data.mobileVerified ?? false,
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

export type ChangePhoneResult = "ok" | "invalid" | "unavailable" | "rate_limited";

// The only allowed way to change the phone number: profiles has a guard trigger that
// rejects direct writes to phone, and change_my_phone() is rate limited and gives the
// same "unavailable" answer whether a number is taken or refused (no probing).
export async function changeMyPhone(phone: string): Promise<ChangePhoneResult> {
  const { data, error } = await supabase.rpc("change_my_phone", { p_phone: phone });
  if (error) throw new Error("Could not update your mobile number. Please try again.");
  const result = data as { ok?: boolean; code?: string } | null;
  if (result?.ok) return "ok";
  if (result?.code === "invalid" || result?.code === "rate_limited") return result.code;
  return "unavailable";
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<UserProfile, "name" | "emailVerified" | "mobileVerified">>
): Promise<void> {
  // The phone number is deliberately not writable here: use changeMyPhone().
  await setUserDoc(uid, data);
}

// Permanently deletes the signed-in student's account (Play Store account
// deletion requirement). The anon key used on the client can never delete
// an auth.users row itself, so this calls a Supabase Edge Function
// ("delete-account") that runs with the service-role key server-side to:
//   1. erase/unlink selected account data (payment and order records are
//      retained; newer account-linked records still need review), then
//   2. delete the corresponding auth.users row via supabase.auth.admin.
// The client signs the local session out only after an explicit server
// success response. Server cleanup and provider-side retention still need
// production verification.
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("delete-account");

  if (error) {
    // For non-2xx responses supabase-js only says "Edge Function returned a
    // non-2xx status code"; the function's own JSON message is in error.context.
    let message = "";
    try {
      const body = await (error as any).context?.json?.();
      message = body?.error ?? "";
    } catch {
      // no JSON body - fall through to the generic message
    }
    throw new Error(message || "Failed to delete account. Please try again.");
  }
  if (data?.ok !== true || (data.status !== "deleted" && data.status !== "already_deleted")) {
    throw new Error(data?.error || "Deletion could not be confirmed. Please try again or contact support.");
  }

  await performSignOut();
}
