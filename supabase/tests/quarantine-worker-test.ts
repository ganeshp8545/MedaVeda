import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { processNotePdfJob } from "../functions/_shared/processNotePdfJob.ts";
async function digest(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
}
async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  return await pdf.save();
}
for (
  const scenario of [
    "valid",
    "corrupt",
    "wrong-hash",
    "wrong-size",
    "download-fails",
    "lost-promotion-response",
    "wrong-existing-object",
    "expired-lease",
  ]
) {
  Deno.test(scenario, async () => {
    const valid = await fixture();
    const bytes = scenario === "corrupt"
      ? new TextEncoder().encode("%PDF-1.7\ninvalid\n%%EOF")
      : valid;
    const job = {
      request_id: "local-id",
      lease_id: "local-lease",
      expected_bytes: scenario === "wrong-size" ? 1 : bytes.length,
      sha256: scenario === "wrong-hash" ? "0".repeat(64) : await digest(bytes),
      object_path: "validated/local.pdf",
    };
    let promoted = 0;
    let outcome = "";
    const db = {
      storage: {
        from: (bucket: string) => ({
          download: async () =>
            bucket === "note-quarantine" && scenario === "download-fails"
              ? { error: new Error("network") }
              : {
                data: new Blob([
                  new Uint8Array(
                    bucket === "notes" && scenario === "wrong-existing-object"
                      ? new Uint8Array([1])
                      : bytes,
                  ).buffer,
                ]),
                error: null,
              },
          upload: async () => {
            promoted++;
            return {
              error:
                ["lost-promotion-response", "wrong-existing-object"].includes(
                    scenario,
                  )
                  ? new Error("ambiguous")
                  : null,
            };
          },
        }),
      },
      rpc: async (_name: string, args: any) => {
        outcome = args.p_outcome;
        return { data: scenario !== "expired-lease", error: null };
      },
    };
    let threw = false;
    try {
      await processNotePdfJob(db, job);
    } catch {
      threw = true;
    }
    if (threw !== (scenario === "expired-lease")) {
      throw new Error("Unexpected completion failure");
    }
    const expected = ["corrupt", "wrong-hash", "wrong-size"].includes(scenario)
      ? "rejected"
      : ["download-fails", "wrong-existing-object"].includes(scenario)
      ? "pending"
      : "complete";
    if (outcome !== expected) {
      throw new Error(`Expected ${expected}, received ${outcome}`);
    }
    if (
      ["corrupt", "wrong-hash", "wrong-size", "download-fails"].includes(
        scenario,
      ) && promoted !== 0
    ) throw new Error("Invalid bytes promoted");
  });
}
