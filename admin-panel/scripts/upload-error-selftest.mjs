import assert from "node:assert/strict";
import { uploadErrorMessage } from "../src/services/uploadError.ts";

const fallback = "PDF upload failed. Please retry.";
const response = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

assert.equal(await uploadErrorMessage({ context: response(400, {
  error: "File and request ID are required",
}) }, fallback), "File and request ID are required");
assert.equal(await uploadErrorMessage({ context: response(413, {
  error: "PDF is too large",
}) }, fallback), "PDF is too large");
assert.equal(await uploadErrorMessage({ context: response(500, {
  error: "Internal details",
}) }, fallback), fallback);
assert.equal(await uploadErrorMessage({ context: response(400, {
  error: "bad\nmessage",
}) }, fallback), fallback);
assert.equal(await uploadErrorMessage(new Error("Network failed"), fallback), fallback);
console.log("Upload error message checks passed.");
