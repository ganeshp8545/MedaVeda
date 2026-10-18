// Manual hosted harness: WRITES one unattached PDF and ledger entry.
// Run only AFTER change-specific owner approval, backup/recovery verification,
// function deployment and selection of dedicated test accounts. No auto-cleanup.
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const url = Deno.env.get("TEST_PROJECT_URL")?.replace(/\/$/, "");
const anon = Deno.env.get("TEST_ANON_KEY");
const admin = Deno.env.get("TEST_ADMIN_JWT");
const student = Deno.env.get("TEST_STUDENT_JWT");
const adminId = Deno.env.get("TEST_ADMIN_USER_ID");
const studentId = Deno.env.get("TEST_STUDENT_USER_ID");
if (
  Deno.env.get("MEDVEDA_UPLOAD_APPROVAL") !== "APPROVED_ONE_UNATTACHED_TEST_PDF" ||
  url !== "https://xbvenkfmesugrbjuufyw.supabase.co" ||
  !anon || !admin || !student || !adminId || !studentId || adminId === studentId
) throw new Error("Existing project, distinct authorized test accounts and explicit upload approval required.");
// Check actual authenticated identity before making any write request.
for (const [token, expected] of [[admin, adminId], [student, studentId]]) {
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  if (!response.ok || (await response.json()).id !== expected) throw new Error("Test account identity mismatch");
}

async function pdf(width: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([width, 200]);
  return await document.save();
}
async function upload(
  token: string,
  bytes: Uint8Array,
  id: string,
): Promise<Response> {
  const body = new FormData();
  body.append(
    "file",
    new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
    "test.pdf",
  );
  body.append("request_id", id);
  return await fetch(`${url}/functions/v1/upload-note-pdf`, {
    method: "POST",
    headers: { apikey: anon!, Authorization: `Bearer ${token}` },
    body,
  });
}
function assertStatus(name: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${name}: ${actual}`);
}

const id = crypto.randomUUID();
const valid = await pdf(200);
assertStatus(
  "student unauthorized",
  (await upload(student, valid, crypto.randomUUID())).status,
  403,
);
assertStatus(
  "corrupt PDF rejected",
  (await upload(
    admin,
    new TextEncoder().encode("%PDF-1.7\n%%EOF"),
    crypto.randomUUID(),
  )).status,
  400,
);
const good = await upload(admin, valid, id);
assertStatus("admin valid PDF", good.status, 200);
const first = await good.json();
const retry = await upload(admin, valid, id);
assertStatus("same ID and bytes retry", retry.status, 200);
const second = await retry.json();
if (first.pdfUrl !== second.pdfUrl) {
  throw new Error("Retry changed object identifier");
}
assertStatus(
  "same ID with different bytes rejected",
  (await upload(admin, await pdf(201), id)).status,
  409,
);
const direct = await fetch(
  `${url}/storage/v1/object/notes/release-test-bypass-${crypto.randomUUID()}.pdf`,
  {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${student}`,
      "content-type": "application/pdf",
    },
    body: new Uint8Array(valid).buffer,
  },
);
if (direct.ok) throw new Error("Student bypassed Storage write restriction");
console.log(`PASS direct student Storage write denied: ${direct.status}`);
console.log(
  `Review unattached approved test upload request ${id}; do not delete without checking note references.`,
);
