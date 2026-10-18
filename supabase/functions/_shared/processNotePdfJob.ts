import { validatePdfStructure } from "./validatePdfStructure.ts";
// Only a privileged, separately operated validator calls this function.
export async function processNotePdfJob(db: any, job: {
  request_id: string;
  lease_id: string;
  expected_bytes: number;
  sha256: string;
  object_path: string;
}): Promise<void> {
  let outcome = "pending";
  let message = "Storage or validation worker failure";
  try {
    const { data: file, error } = await db.storage.from("note-quarantine")
      .download(job.object_path);
    if (error) throw error;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ).map((n) => n.toString(16).padStart(2, "0")).join("");
    if (bytes.length !== Number(job.expected_bytes) || digest !== job.sha256) {
      outcome = "rejected";
      throw new Error("Size or digest mismatch");
    }
    try {
      await validatePdfStructure(bytes);
    } catch {
      outcome = "rejected";
      throw new Error("Invalid PDF structure");
    }
    const { error: uploadError } = await db.storage.from("notes").upload(
      job.object_path,
      bytes,
      { upsert: false, contentType: "application/pdf" },
    );
    if (uploadError) {
      // Never trust mere existence after an ambiguous previous promotion.
      const { data: existing, error: readError } = await db.storage.from(
        "notes",
      ).download(job.object_path);
      if (readError) throw uploadError;
      const actual = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await existing.arrayBuffer()),
        ),
      ).map((n) => n.toString(16).padStart(2, "0")).join("");
      if (actual !== job.sha256) {
        throw new Error("Existing destination digest differs");
      }
    }
    outcome = "complete";
    message = "";
  } catch (error) {
    // Do not persist provider messages that might contain signed URLs/tokens.
    if (outcome === "rejected") {
      message = "PDF size, digest or structural validation failed";
    }
    console.error(
      JSON.stringify({
        requestId: job.request_id,
        outcome,
        errorClass: error instanceof Error ? error.name : "Error",
      }),
    );
  }
  const { data: finished, error: finishError } = await db.rpc(
    "finish_note_pdf_validation",
    {
      p_request_id: job.request_id,
      p_lease: job.lease_id,
      p_outcome: outcome,
      p_error: message || null,
    },
  );
  if (finishError) throw finishError;
  if (!finished) throw new Error("Lease expired; result not committed");
  console.log(JSON.stringify({ requestId: job.request_id, outcome }));
}
