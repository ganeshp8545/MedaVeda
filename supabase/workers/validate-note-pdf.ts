// Privileged worker, NOT an Edge Function. Processes at most one job per run.
// Run only after approval on an isolated worker with OS memory/CPU/deadline
// limits (>=512 MiB, 5-minute deadline). Lease expiry makes killed jobs retryable.
// No automatic object cleanup. Structural parsing is NOT malware scanning.
import { createClient } from "npm:@supabase/supabase-js@2";
import { processNotePdfJob } from "../functions/_shared/processNotePdfJob.ts";
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (
  url !== "https://xbvenkfmesugrbjuufyw.supabase.co" || !key ||
  Deno.env.get("MEDVEDA_VALIDATOR_APPROVAL") !== "APPROVED_QUARANTINE_VALIDATOR"
) {
  throw new Error(
    "Explicit worker approval and existing project credentials required",
  );
}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: jobs, error: claimError } = await db.rpc(
  "claim_note_pdf_validation",
);
if (claimError) throw claimError;
const job = jobs?.[0];
if (job) await processNotePdfJob(db, job);
