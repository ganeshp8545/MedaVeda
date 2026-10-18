const MAX_PDF_BYTES = 50 * 1024 * 1024;

// Client-side feedback only. A trusted server-side scanner is needed before
// uploaded files can be treated as fully validated.
export async function validatePdf(file: File): Promise<void> {
  if (file.type !== "application/pdf" || file.size < 5 || file.size > MAX_PDF_BYTES) {
    throw new Error("Choose a PDF smaller than 50 MB.");
  }
  const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...signature) !== "%PDF-") {
    throw new Error("The selected file is not a valid PDF.");
  }
}
