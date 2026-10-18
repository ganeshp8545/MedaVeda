import { handleQuarantine } from "../_shared/noteQuarantine.ts";
import {
  boundedFormData,
  UploadBodyError,
} from "../_shared/boundedFormData.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  aalFromAuthHeader,
  getUserFromAuthHeader,
  supabaseAdmin,
} from "../_shared/supabaseAdmin.ts";
import { validatePdfStructure } from "../_shared/validatePdfStructure.ts";
import { sha256Hex, storedPdfMatchesHash } from "../_shared/notePdfHash.ts";
import { withinLimit } from "../_shared/rateLimit.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }
    const { data: admin, error: adminError } = await supabaseAdmin.from(
      "admins",
    )
      .select("id").eq("id", user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!admin) return jsonResponse({ error: "Admin access required" }, 403);
    const { data: settings, error: settingsError } = await supabaseAdmin.from(
      "admin_settings",
    )
      .select("require_mfa").eq("id", true).maybeSingle();
    if (settingsError) throw settingsError;
    if (settings?.require_mfa && aalFromAuthHeader(req) !== "aal2") {
      return jsonResponse(
        { error: "Multi-factor authentication required" },
        403,
      );
    }
    if (
      (req.headers.get("content-type") ?? "").startsWith("application/json")
    ) {
      return await handleQuarantine(req, user.id);
    }
    if (!(await withinLimit(`note-upload:${user.id}`, 30, 3600))) {
      return jsonResponse({ error: "Too many uploads" }, 429);
    }
    // Larger files must use private quarantine and the separately operated
    // validator; they cannot consume Edge's 256 MB memory budget.
    let form: FormData;
    try {
      form = await boundedFormData(req, 11 * 1024 * 1024);
    } catch (error) {
      if (error instanceof UploadBodyError) {
        return jsonResponse({ error: error.message }, error.status);
      }
      throw error;
    }
    const file = form.get("file");
    const requestId = form.get("request_id");
    if (
      !(file instanceof File) || typeof requestId !== "string" ||
      !UUID.test(requestId)
    ) {
      return jsonResponse({ error: "File and request ID are required" }, 400);
    }
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      return jsonResponse({
        error: "PDFs over 10 MB require the quarantine upload flow",
      }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      await validatePdfStructure(bytes);
    } catch (error) {
      return jsonResponse({
        error: String(error instanceof Error ? error.message : error),
      }, 400);
    }
    const digest = await sha256Hex(bytes);
    const path = `validated/${user.id}/${requestId}.pdf`;
    const { data: publicUrl } = supabaseAdmin.storage.from("notes")
      .getPublicUrl(path);
    const { error: reserveError } = await supabaseAdmin.from(
      "note_upload_requests",
    ).insert({
      request_id: requestId,
      admin_user_id: user.id,
      sha256: digest,
      object_path: path,
      pdf_url: publicUrl.publicUrl,
      status: "reserved",
    });
    if (reserveError && reserveError.code !== "23505") throw reserveError;
    if (reserveError) {
      const { data: existing, error } = await supabaseAdmin.from(
        "note_upload_requests",
      )
        .select("admin_user_id,sha256,object_path,pdf_url,status")
        .eq("request_id", requestId).single();
      if (error) throw error;
      if (
        existing.admin_user_id !== user.id || existing.sha256 !== digest ||
        existing.object_path !== path
      ) {
        return jsonResponse({ error: "Request ID already used" }, 409);
      }
      if (existing.status === "uploaded" || existing.status === "attached") {
        return jsonResponse({ requestId, pdfUrl: existing.pdf_url });
      }
    }
    const { error: uploadError } = await supabaseAdmin.storage.from("notes")
      .upload(path, bytes, { upsert: false, contentType: "application/pdf" });
    if (uploadError) {
      // A timed-out prior request may have written the object. Existence alone
      // cannot prove it is the payload bound to this request ID.
      const { data: existing, error: readError } = await supabaseAdmin.storage
        .from("notes").download(path);
      if (readError || !existing ||
        !await storedPdfMatchesHash(existing, digest, bytes.length)) {
        throw new Error("Existing PDF does not match the reserved upload");
      }
    }
    const { data: updated, error: markError } = await supabaseAdmin.from(
      "note_upload_requests",
    )
      .update({ status: "uploaded", updated_at: new Date().toISOString() })
      .eq("request_id", requestId).eq("status", "reserved")
      .select("request_id").maybeSingle();
    if (markError) throw markError;
    if (!updated) {
      const { data: current, error } = await supabaseAdmin.from(
        "note_upload_requests",
      )
        .select("status").eq("request_id", requestId).single();
      if (error || !["uploaded", "attached"].includes(current.status)) {
        throw error ?? new Error("Upload state changed");
      }
    }
    return jsonResponse({ requestId, pdfUrl: publicUrl.publicUrl });
  } catch (error) {
    console.error(
      "upload-note-pdf:",
      error instanceof Error ? error.message : String(error),
    );
    return jsonResponse(
      { error: "Upload failed. Retry with the same file." },
      500,
    );
  }
});
