import { withinLimit } from "./rateLimit.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { jsonResponse } from "./cors.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Called only after the upload endpoint has authenticated the admin and MFA.
export async function handleQuarantine(
  req: Request,
  adminId: string,
): Promise<Response> {
  // Bound JSON too: Content-Length cannot be trusted.
  const reader = req.body?.getReader();
  if (!reader) return jsonResponse({ error: "Body required" }, 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.length;
    if (length > 2048) {
      await reader.cancel();
      return jsonResponse({ error: "Request too large" }, 413);
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  let input;
  try {
    input = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { requestId: rawRequestId, sha256, bytes, action } = input ?? {};
  const requestId = typeof rawRequestId === "string" ? rawRequestId.toLowerCase() : rawRequestId;
  if (
    typeof requestId !== "string" || !UUID.test(requestId) ||
    !["reserve", "status"].includes(action)
  ) return jsonResponse({ error: "Invalid request" }, 400);
  if (
    !(await withinLimit(
      `note-upload-${action}:${adminId}`,
      action === "status" ? 600 : 30,
      3600,
    ))
  ) return jsonResponse({ error: "Too many requests" }, 429);
  const path = `validated/${adminId}/${requestId}.pdf`;
  const { data: url } = supabaseAdmin.storage.from("notes").getPublicUrl(path);
  if (action === "reserve") {
    if (
      typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256) ||
      !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 52428800
    ) return jsonResponse({ error: "Invalid PDF metadata" }, 400);
    const { error } = await supabaseAdmin.rpc("reserve_note_pdf_validation", {
      p_request_id: requestId,
      p_admin: adminId,
      p_hash: sha256,
      p_bytes: bytes,
      p_url: url.publicUrl,
    });
    if (error) {
      if (error.code === "23505") {
        return jsonResponse({ error: "Request ID already used" }, 409);
      }
      throw error;
    }
  }
  const { data: upload, error } = await supabaseAdmin.from(
    "note_upload_requests",
  ).select("status,pdf_url,admin_user_id").eq("request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!upload || upload.admin_user_id !== adminId) {
    return jsonResponse({ error: "Upload unavailable" }, 404);
  }
  if (["uploaded", "attached"].includes(upload.status)) {
    return jsonResponse({ requestId, status: "ready", pdfUrl: upload.pdf_url });
  }
  const { data: job, error: jobError } = await supabaseAdmin.from(
    "note_pdf_validation_jobs",
  ).select("status,attempts,lease_until").eq("request_id", requestId).single();
  if (jobError) throw jobError;
  if (job.status === "rejected") {
    return jsonResponse({
      requestId,
      status: "rejected",
      error:
        "PDF validation failed. Select a valid PDF and start a new request.",
    });
  }
  if (
    job.attempts >= 5 &&
    (job.status === "pending" ||
      (job.status === "working" && Date.parse(job.lease_until) < Date.now()))
  ) {
    return jsonResponse({
      requestId,
      status: "failed",
      error: "Validation needs operator review. Keep this request ID.",
    });
  }
  if (action === "status") {
    return jsonResponse({ requestId, status: "pending" });
  }
  const { data: signed, error: signError } = await supabaseAdmin.storage.from(
    "note-quarantine",
  ).createSignedUploadUrl(path, { upsert: false });
  if (signError) throw signError;
  return jsonResponse({
    requestId,
    status: "pending",
    path,
    token: signed.token,
  });
}
