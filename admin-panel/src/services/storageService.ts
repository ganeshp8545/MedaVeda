import { supabase } from "../config/supabase";
import { validatePdf } from "../utils/pdfValidation";

// The notes bucket is made private by 20260924120000. Existing rows store
// public-style URLs as object identifiers; get-note-url checks entitlement
// and signs a short-lived URL before the mobile app opens a PDF.

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB - adjust to your content

// Returns the legacy URL-shaped identifier expected by notes.pdf_url. It
// cannot be fetched without a signed URL while the bucket is private.
export async function uploadFile(
  file: File,
  bucket: string,
  onProgress?: (percent: number) => void,
  allowedMimeTypes: string[] = ["application/pdf"],
  requestId: string = crypto.randomUUID()
): Promise<{ pdfUrl: string; requestId: string }> {
  if (bucket !== "notes") throw new Error("Unsupported upload bucket.");
  if (!allowedMimeTypes.includes(file.type)) {
    return Promise.reject(new Error(`File type "${file.type}" is not allowed.`));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(
      new Error(`File is too large (max ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB).`)
    );
  }

  if (file.type === "application/pdf") await validatePdf(file);

  if (file.size > 10 * 1024 * 1024) {
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
      .map((n) => n.toString(16).padStart(2, "0")).join("");
    const invoke = async (body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("upload-note-pdf", { body });
      if (error) throw new Error("Upload validation service unavailable. Retry with the same file.");
      if (!data || data.requestId !== requestId) throw new Error("Invalid upload response.");
      if (data.status === "rejected" || data.status === "failed") throw new Error(data.error || "PDF validation failed.");
      return data;
    };
    let result = await invoke({ action: "reserve", requestId, sha256, bytes: file.size });
    if (result.status !== "ready") {
      if (typeof result.path !== "string" || typeof result.token !== "string") throw new Error("Upload authorization missing.");
      const { error } = await supabase.storage.from("note-quarantine")
        .uploadToSignedUrl(result.path, result.token, file, { contentType: "application/pdf" });
      // An ambiguous previous upload can already exist. The worker validates
      // the immutable object's expected hash before it can become attachable.
      if (error && String((error as any).statusCode) !== "409" && !/already exists/i.test(error.message)) {
        throw new Error("Quarantine transfer failed. Retry with the same file.");
      }
      onProgress?.(75);
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline && result.status !== "ready") {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        result = await invoke({ action: "status", requestId });
      }
    }
    if (result.status !== "ready" || typeof result.pdfUrl !== "string") {
      throw new Error("PDF is awaiting trusted validation. Retry with the same file; do not start another upload.");
    }
    onProgress?.(100);
    return { requestId, pdfUrl: result.pdfUrl };
  }

  const body = new FormData();
  body.append("file", file);
  body.append("request_id", requestId);
  onProgress?.(50);
  const { data, error } = await supabase.functions.invoke("upload-note-pdf", { body });
  if (error || typeof data?.pdfUrl !== "string" || data?.requestId !== requestId) {
    const detail = data?.error;
    throw new Error(typeof detail === "string" ? detail : "PDF upload failed. Please retry.");
  }
  onProgress?.(100);
  return { pdfUrl: data.pdfUrl, requestId };
}

// Admin preview only. Mobile callers use get-note-url, which checks purchase
// entitlement before signing.
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 300
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

// Extracts the object path from a stored getPublicUrl()-style URL
// (.../storage/v1/object/public/<bucket>/<path>). Pure string parsing, so it
// works whether or not the bucket is currently public. Returns null when the
// URL does not point at that bucket.
export function extractStoragePath(bucket: string, storedUrl: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = storedUrl.indexOf(marker);
  if (idx === -1) return null;
  const path = storedUrl.slice(idx + marker.length).split("?")[0];
  try {
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}
