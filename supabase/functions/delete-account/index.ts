// Permanently deletes the signed-in student's account (Play Store / DPDP
// account-deletion requirement). Called by the app as
// supabase.functions.invoke("delete-account") with no body.
//
// - The user is taken ONLY from the verified JWT in the Authorization header
//   (verify_jwt = true in config.toml plus getUserFromAuthHeader). The request
//   body is never read, so a caller can only ever delete their own account.
// - public.erase_user_data() removes/anonymises all data in one transaction
//   (payment/order records are kept, with user_id set to null, for tax law).
// - Then the auth user is deleted through the admin API.
// - Safe to retry: every step is idempotent, and if the auth user is already
//   gone the call reports success.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const RETAINED_NOTE =
  "Payment, order and invoice records are retained (without your personal details) for up to 8 years as required by Indian tax and accounting laws.";

function isUserNotFound(error: { status?: number; code?: string; message?: string }): boolean {
  return error.status === 404 || error.code === "user_not_found" || /user (from sub claim in jwt )?does not exist|user not found/i.test(error.message ?? "");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ ok: false, error: "Please sign in and try again." }, 401);
  }

  const { data, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !data.user) {
    // A retry after the auth user was already removed: the data is gone too
    // (erase runs before the auth delete), so report success.
    if (userError && isUserNotFound(userError)) {
      return jsonResponse({ ok: true, status: "already_deleted", message: "Your account has already been deleted." });
    }
    return jsonResponse({ ok: false, error: "Your session has expired. Please sign in again." }, 401);
  }
  const userId = data.user.id;

  const { data: erased, error: eraseError } = await supabaseAdmin.rpc("erase_user_data", { p_user_id: userId });
  if (eraseError) {
    console.error("delete-account: erase_user_data failed", { code: eraseError.code, message: eraseError.message });
    return jsonResponse({ ok: false, error: "We couldn't delete your data. Nothing was lost - please try again, or contact support." }, 500);
  }
  if (erased?.status === "admin_blocked") {
    return jsonResponse({ ok: false, error: "Admin accounts can't be deleted from the app. Please contact support." }, 403);
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError && !isUserNotFound(deleteError)) {
    console.error("delete-account: auth delete failed", { status: deleteError.status, message: deleteError.message });
    return jsonResponse({ ok: false, error: "Your data was removed but we couldn't finish closing the account. Please try again." }, 500);
  }

  return jsonResponse({ ok: true, status: "deleted", message: `Your account and data have been deleted. ${RETAINED_NOTE}` });
});
