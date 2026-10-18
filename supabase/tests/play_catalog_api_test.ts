import { strict as assert } from "node:assert";
import { activateBuyOption, createOneTimeProduct, getOneTimeProduct,
  optionNeedsActivation, verifiedBuyOption } from "../functions/_shared/playCatalog.ts";

Deno.test("Google catalog create, activate and read-back use the supported APIs", async () => {
  const originalFetch = globalThis.fetch;
  const oldPackage = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME");
  const oldAccount = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes))}\n-----END PRIVATE KEY-----`;
  Deno.env.set("GOOGLE_PLAY_PACKAGE_NAME", "in.medveda.app");
  Deno.env.set("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "fixture@example.invalid", private_key: pem }));
  const seen: string[] = [];
  const sku = "notes_137_25_v_test";
  let product: Record<string, unknown> | null = null;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json" },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    seen.push(`${method} ${url}`);
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "fixture", expires_in: 3600 });
    if (url.includes("pricing:convertRegionPrices")) {
      assert.equal(JSON.parse(String(init?.body)).price.currencyCode, "INR");
      return json({ regionVersion: { version: "2026/10" }, convertedRegionPrices: { IN: {} } });
    }
    if (method === "PATCH") {
      assert.match(url, /regionsVersion\.version=2026%2F10/);
      assert.match(url, /allowMissing=true/);
      product = JSON.parse(String(init?.body));
      assert.equal((product as { purchaseOptions: { regionalPricingAndAvailabilityConfigs: { price: { nanos: number } }[] }[] })
        .purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0].price.nanos, 250000000);
      (product as { purchaseOptions: { state: string }[] }).purchaseOptions[0].state = "DRAFT";
      return json(product);
    }
    if (url.includes("purchaseOptions:batchUpdateStates")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.requests[0].activatePurchaseOptionRequest.purchaseOptionId, "buy");
      (product as { purchaseOptions: { state: string }[] }).purchaseOptions[0].state = "ACTIVE";
      return json({ oneTimeProducts: [product] });
    }
    if (url.includes(`/oneTimeProducts/${sku}`)) return product ? json(product) : json({}, 404);
    throw new Error(`Unexpected mocked call: ${method} ${url}`);
  }) as typeof fetch;
  try {
    assert.equal(await getOneTimeProduct(sku), null);
    await createOneTimeProduct(sku, "buy", 13725);
    let read = await getOneTimeProduct(sku);
    assert.ok(read && optionNeedsActivation(read, "buy", 13725));
    await activateBuyOption(sku, "buy");
    read = await getOneTimeProduct(sku);
    assert.ok(read && verifiedBuyOption(read, sku, "buy", 13725));
    assert.equal(seen.filter((call) => call.startsWith("PATCH ")).length, 1);
    assert.equal(seen.filter((call) => call.includes("purchaseOptions:batchUpdateStates")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldPackage === undefined) Deno.env.delete("GOOGLE_PLAY_PACKAGE_NAME");
    else Deno.env.set("GOOGLE_PLAY_PACKAGE_NAME", oldPackage);
    if (oldAccount === undefined) Deno.env.delete("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    else Deno.env.set("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", oldAccount);
  }
});
