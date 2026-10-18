import { PDFDocument } from "npm:pdf-lib@1.17.1";

export const MAX_NOTE_PDF_BYTES = 50 * 1024 * 1024;

export async function validatePdfStructure(bytes: Uint8Array): Promise<void> {
  if (bytes.length < 32 || bytes.length > MAX_NOTE_PDF_BYTES) {
    throw new Error("PDF must be smaller than 50 MB.");
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 8));
  const tail = new TextDecoder().decode(
    bytes.subarray(Math.max(0, bytes.length - 2048)),
  );
  if (!/^%PDF-1\.[0-9]/.test(head) && !/^%PDF-2\.0/.test(head)) {
    throw new Error("Invalid PDF header.");
  }
  if (!tail.includes("%%EOF")) throw new Error("PDF is incomplete.");
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (document.getPageCount() < 1) throw new Error("PDF has no pages.");
  } catch {
    throw new Error("PDF structure is invalid or encrypted.");
  }
}
