import { strict as assert } from "node:assert";
import { GoogleApiError, googleRequest } from "../functions/_shared/googlePlay.ts";

Deno.test("catalog diagnostics omit credentials, URLs, raw bodies and structured secret fields", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["GOOGLE_PLAY_PACKAGE_NAME", "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"];
  const previous = names.map((name) => Deno.env.get(name));
  const sentinels = ["PRIVATE_KEY_SENTINEL", "OAUTH_TOKEN_SENTINEL", "PURCHASE_TOKEN_SENTINEL", "RAW_BODY_SENTINEL"];
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes))}\n-----END PRIVATE KEY-----`;
  Deno.env.set(names[0], "in.medveda.app");
  Deno.env.set(names[1], JSON.stringify({ client_email: "fixture@example.invalid", private_key: privateKey }));
  const response = (value: unknown, status = 403) => new Response(JSON.stringify(value), { status });
    const check = async (operation: "oauth.token" | "catalog.get", status: number, reason: string,
      expectedDetails: unknown[] = []) => {
    await assert.rejects(() => googleRequest("GET", `/applications/in.medveda.app/oneTimeProducts/${sentinels[2]}`,
      undefined, "catalog.get"), (error: unknown) => {
        assert.ok(error instanceof GoogleApiError);
        assert.equal(error.operation, operation);
        assert.equal(error.status, status);
        assert.equal(error.reason, reason);
        assert.deepEqual(error.details, expectedDetails);
        assert.match(error.requestId, /^[a-f0-9-]{36}$/);
        const serialized = JSON.stringify({ ...error, message: error.message, stack: error.stack });
        for (const secret of [...sentinels, privateKey, "oauth2.googleapis.com", "/applications/"]) {
          assert.ok(!serialized.includes(secret), "diagnostic leaked a sensitive sentinel or path");
        }
        return true;
      });
  };
  try {
    globalThis.fetch = async () => response({ error: "invalid_grant", error_description: sentinels.join(" "),
      private_key: privateKey, access_token: sentinels[1] });
    await check("oauth.token", 403, "invalid_grant");
    globalThis.fetch = async (input) => String(input).includes("oauth2.googleapis.com/token")
      ? response({ access_token: sentinels[1], expires_in: 3600 }, 200)
      : response({ error: { status: "PERMISSION_DENIED", message: sentinels.join(" "),
        errors: [{ reason: sentinels[2] }], details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "SERVICE_DISABLED", domain: "googleapis.com",
          metadata: { service: "androidpublisher.googleapis.com", consumer: "projects/123456789012",
            private_key: privateKey, token: sentinels[1], method: sentinels[2] } },
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ description: privateKey }] },
          { "@type": "type.googleapis.com/google.rpc.RequestInfo", requestId: sentinels[1] },
          { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: sentinels[0], domain: sentinels[1],
            metadata: { service: sentinels[2], consumer: sentinels[3] } }] } });
    await check("catalog.get", 403, "PERMISSION_DENIED", [
      { type: "ErrorInfo", reason: "SERVICE_DISABLED", domain: "googleapis.com",
        service: "androidpublisher.googleapis.com", consumer: "projects/123456789012" },
      { type: "QuotaFailure" }, { type: "ErrorInfo" },
    ]);
    globalThis.fetch = async () => response({ error: { status: "PERMISSION_DENIED",
      details: Array.from({ length: 20 }, () => ({ "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "SERVICE_DISABLED", domain: sentinels[0], metadata: {
          consumer: sentinels[1], service: sentinels[2], private_key: privateKey } })) } });
    await check("catalog.get", 403, "PERMISSION_DENIED",
      Array.from({ length: 4 }, () => ({ type: "ErrorInfo", reason: "SERVICE_DISABLED" })));
    for (const value of [null, sentinels.join(" "), { error: { errors: [{ reason: sentinels[0] }] } }]) {
      globalThis.fetch = async () => response(value);
      await check("catalog.get", 403, "unclassified");
    }
    globalThis.fetch = async () => new Response(`<html>${sentinels.join(" ")}</html>`, { status: 403 });
    await check("catalog.get", 403, "unclassified");
    globalThis.fetch = async () => { throw new Error(sentinels.join(" ")); };
    await check("catalog.get", 0, "unclassified");
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => previous[index] === undefined
      ? Deno.env.delete(name) : Deno.env.set(name, previous[index]!));
  }
});
