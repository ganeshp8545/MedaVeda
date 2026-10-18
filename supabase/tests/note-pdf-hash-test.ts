import { strict as assert } from "node:assert";
import { sha256Hex, storedPdfMatchesHash } from
  "../functions/_shared/notePdfHash.ts";

Deno.test("ambiguous PDF upload retries require exact stored bytes", async () => {
  const original = new TextEncoder().encode("%PDF-1.7 original");
  const altered = new TextEncoder().encode("%PDF-1.7 altered!");
  const hash = await sha256Hex(original);
  assert.equal(await storedPdfMatchesHash(new Blob([original]), hash, original.length), true);
  assert.equal(await storedPdfMatchesHash(new Blob([altered]), hash, altered.length), false);
  assert.equal(await storedPdfMatchesHash(new Blob([original]), hash, original.length + 1), false);
});
