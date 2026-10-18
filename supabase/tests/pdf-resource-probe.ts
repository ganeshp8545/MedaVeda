// Local synthetic probe; NOT a hosted Edge or malware test.
// Generate in a separate process, then parse so fixture creation is excluded.
// deno run --allow-write=/tmp ... generate /tmp/medveda-pdf-49.multipart 49
// deno run --allow-read=/tmp ... parse /tmp/medveda-pdf-49.multipart
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { boundedFormData } from "../functions/_shared/boundedFormData.ts";
import { validatePdfStructure } from "../functions/_shared/validatePdfStructure.ts";
const [mode, path, size] = Deno.args;
if (!path?.startsWith("/tmp/medveda-pdf-")) {
  throw new Error("Use a synthetic fixture under /tmp/medveda-pdf-");
}
const boundary = "medveda-local-resource-probe";
if (mode === "generate") {
  const mb = Number(size);
  if (![1, 10, 49].includes(mb)) throw new Error("Expected 1, 10 or 49 MiB");
  const document = await PDFDocument.create();
  document.addPage([200, 200]);
  const original = await document.save();
  const file = await Deno.open(path, { write: true, createNew: true });
  const writer = file.writable.getWriter();
  const encode = (text: string) => new TextEncoder().encode(text);
  await writer.write(
    encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="probe.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
  );
  await writer.write(original.subarray(0, original.length - 5));
  let remaining = mb * 1024 * 1024 - original.length;
  const padding = new Uint8Array(1024 * 1024).fill(32);
  while (remaining > 0) {
    const amount = Math.min(remaining, padding.length);
    await writer.write(padding.subarray(0, amount));
    remaining -= amount;
  }
  await writer.write(encode(`%%EOF\r\n--${boundary}--\r\n`));
  await writer.close();
} else if (mode === "parse") {
  const baseline = Deno.memoryUsage();
  const file = await Deno.open(path, { read: true });
  const start = performance.now();
  const form = await boundedFormData(
    new Request("https://example.invalid", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body: file.readable,
    }),
    51 * 1024 * 1024,
  );
  const pdf = form.get("file") as File;
  await validatePdfStructure(new Uint8Array(await pdf.arrayBuffer()));
  console.log(
    JSON.stringify({
      fileBytes: pdf.size,
      wallMs: Math.round(performance.now() - start),
      baseline,
      after: Deno.memoryUsage(),
    }),
  );
} else throw new Error("Expected generate or parse");
