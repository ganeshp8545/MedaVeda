import { supabase } from "../config/supabase";

// ============================================================================
// CRITICAL FINDING (see audit report): uploadFile() returns getPublicUrl(),
// which only works if the bucket is marked PUBLIC in Supabase Dashboard ->
// Storage. A public bucket means the PDF/file is reachable by ANYONE who
// has (or guesses/finds) the URL - with no auth check and no purchase/
// entitlement check. Since "notes" holds paid content (Notes are gated by
// a purchase in the mobile app), a public "notes" bucket lets anyone
// bypass the paywall entirely if they ever see one URL (shared link,
// screenshot, proxy log, browser history, etc.) - RLS on the `notes`
// TABLE does not protect the file sitting in Storage; those are two
// separate permission systems in Supabase.
//
// RECOMMENDED FIX (requires a small migration, so not applied
// automatically here - see the audit report's "manual actions" section):
//   1. In Supabase Dashboard -> Storage, set the "notes" bucket to
//      PRIVATE.
//   2. Add a Storage RLS policy on storage.objects restricting SELECT to
//      users who own a matching row in `purchases` (or gate access
//      through an Edge Function instead - the report includes an
//      example).
//   3. Switch callers from getPublicUrl() to getSignedUrl() below, and
//      have the mobile app fetch a fresh signed URL right before opening
//      the PDF viewer (not once at admin-upload time), through a
//      call that checks entitlement server-side.
// ============================================================================

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB - adjust to your content

// Uploads a file to a Supabase Storage bucket and returns its PUBLIC URL.
// Keep using this only for genuinely public assets (e.g. thumbnails).
// For anything paywalled (Note PDFs), migrate to uploadPrivateFile below
// once the bucket is private.
export function uploadFile(
  file: File,
  bucket: string,
  onProgress?: (percent: number) => void,
  allowedMimeTypes: string[] = ["application/pdf"]
): Promise<string> {
  if (!allowedMimeTypes.includes(file.type)) {
    return Promise.reject(new Error(`File type "${file.type}" is not allowed.`));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(
      new Error(`File is too large (max ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB).`)
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}_${safeName}`;

  return new Promise((resolve, reject) => {
    // supabase-js v2 doesn't expose granular upload progress like Firebase
    // did, so we show an indeterminate state to the caller instead.
    onProgress?.(50);

    supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type })
      .then(({ error }) => {
        if (error) {
          reject(error);
          return;
        }

        onProgress?.(100);
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve(data.publicUrl);
      })
      .catch(reject);
  });
}

// Same upload, but returns the storage PATH (not a URL) - use this once a
// bucket is switched to private. Store `bucket:path` (or just `path`, if
// you always know the bucket) instead of a URL in the DB row, and resolve
// it to a short-lived signed URL only at view-time via getSignedUrl().
export function uploadPrivateFile(
  file: File,
  bucket: string,
  onProgress?: (percent: number) => void,
  allowedMimeTypes: string[] = ["application/pdf"]
): Promise<string> {
  if (!allowedMimeTypes.includes(file.type)) {
    return Promise.reject(new Error(`File type "${file.type}" is not allowed.`));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(
      new Error(`File is too large (max ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB).`)
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}_${safeName}`;

  return new Promise((resolve, reject) => {
    onProgress?.(50);

    supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type })
      .then(({ error }) => {
        if (error) {
          reject(error);
          return;
        }
        onProgress?.(100);
        resolve(path); // caller stores `path`, not a URL
      })
      .catch(reject);
  });
}

// Generates a time-boxed URL for a private-bucket object. Call this from
// the MOBILE app right before opening the PDF viewer (ideally via an
// Edge Function / RPC that re-checks purchase entitlement server-side
// first), not once at admin-upload time - a signed URL that never
// expires is only marginally better than a public one.
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
  return path ? decodeURIComponent(path) : null;
}
