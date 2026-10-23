import { PDFDocument } from "npm:pdf-lib@1.17.1";
import {
  boundedFormData,
  UploadBodyError,
} from "../functions/_shared/boundedFormData.ts";
import {
  NotePdfUploadError,
  parseNotePdfUpload,
} from "../functions/_shared/notePdfUpload.ts";

const limit = 11 * 1024 * 1024;

async function pdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([200, 200]);
  return await document.save();
}

function request(file: Blob | null, requestId: string): Request {
  const form = new FormData();
  if (file) form.append("file", file, "note.pdf");
  form.append("request_id", requestId);
  return new Request("https://example.invalid/upload-note-pdf", {
    method: "POST",
    body: form,
  });
}

async function parse(req: Request) {
  return await parseNotePdfUpload(await boundedFormData(req, limit));
}

Deno.test("valid multipart PDF and UUID pass upload validation", async () => {
  const bytes = await pdf();
  const id = crypto.randomUUID();
  const parsed = await parse(request(
    new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
    id,
  ));
  if (parsed.requestId !== id || parsed.bytes.length !== bytes.length) {
    throw new Error("Valid upload changed or rejected");
  }
});

Deno.test("missing file is rejected", async () => {
  try {
    await parse(request(null, crypto.randomUUID()));
  } catch (error) {
    if (
      error instanceof NotePdfUploadError && error.status === 400 &&
      error.message === "File and request ID are required"
    ) return;
    throw error;
  }
  throw new Error("Missing file was accepted");
});

for (
  const [name, blob, id, expected] of [
    [
      "malformed UUID",
      new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      "not-a-uuid",
      "File and request ID are required",
    ],
    [
      "invalid PDF",
      new Blob([`%PDF-1.7\n${"garbage".repeat(30)}\n%%EOF`], {
        type: "application/pdf",
      }),
      crypto.randomUUID(),
      "PDF structure is invalid or encrypted.",
    ],
  ] as const
) {
  Deno.test(name, async () => {
    try {
      await parse(request(blob, id));
    } catch (error) {
      if (
        error instanceof NotePdfUploadError && error.status === 400 &&
        error.message === expected
      ) return;
      throw error;
    }
    throw new Error(`${name} was accepted`);
  });
}

Deno.test("PDF above 10 MB uses quarantine flow", async () => {
  const file = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], {
    type: "application/pdf",
  });
  try {
    await parse(request(file, crypto.randomUUID()));
  } catch (error) {
    if (
      error instanceof NotePdfUploadError && error.status === 400 &&
      error.message === "PDFs over 10 MB require the quarantine upload flow"
    ) return;
    throw error;
  }
  throw new Error("Large PDF bypassed quarantine flow");
});

Deno.test("oversized multipart request is rejected before parsing", async () => {
  const oversized = new Blob([new Uint8Array(limit)], {
    type: "application/pdf",
  });
  try {
    await parse(request(oversized, crypto.randomUUID()));
  } catch (error) {
    if (error instanceof UploadBodyError && error.status === 413) return;
    throw error;
  }
  throw new Error("Oversized request was accepted");
});
