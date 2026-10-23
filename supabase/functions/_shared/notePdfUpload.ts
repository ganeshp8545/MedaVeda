import { validatePdfStructure } from "./validatePdfStructure.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NotePdfUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function parseNotePdfUpload(
  form: FormData,
): Promise<{ bytes: Uint8Array; requestId: string }> {
  const file = form.get("file");
  const requestId = form.get("request_id");
  if (
    !(file instanceof File) || typeof requestId !== "string" ||
    !UUID.test(requestId)
  ) {
    throw new NotePdfUploadError("File and request ID are required");
  }
  if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
    throw new NotePdfUploadError(
      "PDFs over 10 MB require the quarantine upload flow",
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    await validatePdfStructure(bytes);
  } catch (error) {
    throw new NotePdfUploadError(
      String(error instanceof Error ? error.message : error),
    );
  }
  return { bytes, requestId };
}
