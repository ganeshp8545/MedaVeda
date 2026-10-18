import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { validatePdfStructure } from "../functions/_shared/validatePdfStructure.ts";

Deno.test("complete PDF with a page passes", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  await validatePdfStructure(await doc.save());
});

Deno.test("header spoof, false structure, and truncated PDFs fail", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const bytes = await doc.save();
  const falseStructure = new TextEncoder().encode(
    `%PDF-1.7\n${"garbage".repeat(30)}\n%%EOF`,
  );
  for (
    const invalid of [
      new TextEncoder().encode("%PDF-1.7\n%%EOF"),
      falseStructure,
      bytes.subarray(0, bytes.length - 10),
    ]
  ) {
    let rejected = false;
    try {
      await validatePdfStructure(invalid);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Malformed PDF accepted");
  }
});
