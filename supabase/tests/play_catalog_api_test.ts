import { strict as assert } from "node:assert";
import { activateBuyOption, createOneTimeProduct, getOneTimeProduct,
  optionNeedsActivation, verifiedBuyOption } from "../functions/_shared/playCatalog.ts";

import { GoogleApiError, googleRequest } from "../functions/_shared/googlePlay.ts";

Deno.test("Google catalog create, activate and read-back use the supported APIs", async () => {
  const originalFetch = globalThis.fetch;
  const oldPackage = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME");
  const oldVersion = Deno.env.get("PLAY_CATALOG_REGIONS_VERSION");
  const oldAccount = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes))}\n-----END PRIVATE KEY-----`;
  Deno.env.set("GOOGLE_PLAY_PACKAGE_NAME", "in.medveda.app");
  Deno.env.set("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "fixture@example.invalid", private_key: pem }));
  Deno.env.set("PLAY_CATALOG_REGIONS_VERSION", "2022/02");
  const seen: string[] = [];
  let oauthFailure = true;
  const sku = "notes_137_25_v_test";
  let product: Record<string, unknown> | null = null;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json" },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    seen.push(`${method} ${url}`);
    if (url.includes("oauth2.googleapis.com/token")) return oauthFailure ? json({ error: "unauthorized_client", error_description: "sensitive-credential-details" }, 403)
      : json({ access_token: "fixture", expires_in: 3600 });
    if (method === "PATCH") {
      assert.match(url, /regionsVersion\.version=2022%2F02/);
      assert.match(url, /allowMissing=true/);
      product = { ...JSON.parse(String(init?.body)), regionsVersion: { version: "2022/02" } };
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
    await assert.rejects(() => getOneTimeProduct(sku), (error: unknown) =>
      error instanceof GoogleApiError && error.operation === "oauth.token" && error.reason === "unauthorized_client" &&
      !error.retryable && !error.message.includes("sensitive"));
    oauthFailure = false;
    assert.equal(await getOneTimeProduct(sku), null);
    await createOneTimeProduct(sku, "buy", 13725);
    let read = await getOneTimeProduct(sku);
    assert.ok(read && optionNeedsActivation(read, sku, "buy", 13725));
    await activateBuyOption(sku, "buy", 13725);
    read = await getOneTimeProduct(sku);
    assert.ok(read && verifiedBuyOption(read, sku, "buy", 13725));
    assert.equal(seen.filter((call) => call.startsWith("PATCH ")).length, 1);
    assert.equal(seen.filter((call) => call.includes("purchaseOptions:batchUpdateStates")).length, 1);
    assert.ok(seen.every((call) => !call.includes("convertRegionPrices")));
    // Prices originate in Admin/database configuration. Serialize exact Money
    // for whole rupees, paise and the upper supported numeric(10,2) boundary.
    for (const cents of [100, 4900, 13725, 9999999999]) {
      let patches = 0;
      globalThis.fetch = async (input, init) => {
        assert.equal(init?.method, "PATCH");
        assert.ok(!String(input).includes("convertRegionPrices"));
        const body = JSON.parse(String(init?.body));
        const option = body.purchaseOptions[0];
        assert.equal(option.regionalPricingAndAvailabilityConfigs.length, 1);
        assert.deepEqual(option.regionalPricingAndAvailabilityConfigs[0], {
          regionCode: "IN", availability: "AVAILABLE", price: { currencyCode: "INR",
            units: String(Math.floor(cents / 100)), nanos: (cents % 100) * 10000000 },
        });
        assert.equal(option.newRegionsConfig, undefined);
        patches++;
        return json({ ...body, regionsVersion: { version: "2022/02" },
          purchaseOptions: [{ ...option, state: "DRAFT" }] });
      };
      await createOneTimeProduct(sku, "buy", cents);
      assert.equal(patches, 1);
    }
    globalThis.fetch = () => { throw new Error("Invalid prices must not make a network call"); };
    for (const cents of [0, -100, 99, 13725.5, 10000000000, NaN, Infinity])
      await assert.rejects(() => createOneTimeProduct(sku, "buy", cents), /Catalog price is outside/);
    const activeProduct = read!;
    // A 2xx status alone is insufficient; never treat an invalid success body as
    // a missing product or a successful activation.
    for (const value of [null, [], true, {}, { ...activeProduct, productId: "other" },
      { ...activeProduct, packageName: "other.app" }, { ...activeProduct, purchaseOptions: [null] },
      { ...activeProduct, purchaseOptions: {} }]) {
      globalThis.fetch = async () => json(value);
      await assert.rejects(() => getOneTimeProduct(sku), /catalog product response invalid/);
      await assert.rejects(() => activateBuyOption(sku, "buy", 13725), /catalog activation response invalid/);
    }
    for (const value of [{ oneTimeProducts: [] }, { oneTimeProducts: [product, product] },
      { oneTimeProducts: [{ ...activeProduct, productId: "other" }] },
      { oneTimeProducts: [{ ...activeProduct, purchaseOptions: [{ purchaseOptionId: "buy", state: "DRAFT" }] }] }]) {
      globalThis.fetch = async () => json(value);
      await assert.rejects(() => activateBuyOption(sku, "buy", 13725), /catalog activation response invalid/);
    }
    for (const body of ["", "{", "<html>error</html>"]) {
      globalThis.fetch = async () => new Response(body, { status: 200 });
      await assert.rejects(() => getOneTimeProduct(sku), /response invalid/);
    }
    // Exercise the actual request wrapper; never send a request to Google.
    for (const status of [400, 401, 403, 404, 408, 409, 429, 500, 503]) {
      globalThis.fetch = async () => json({ error: { status: "PERMISSION_DENIED",
        message: "sensitive-purchase-token", errors: [{ reason: "secret-unrecognized-value" }] } }, status);
      await assert.rejects(() => googleRequest("GET", "/sensitive-purchase-token", undefined, "catalog.readback.activated"),
        (error: unknown) => {
          assert.ok(error instanceof GoogleApiError);
          assert.equal(error.status, status);
          assert.equal(error.operation, "catalog.readback.activated");
          assert.equal(error.reason, "PERMISSION_DENIED");
          assert.equal(error.retryable, [409, 429, 500, 503].includes(status));
          assert.match(error.requestId, /^[a-f0-9-]{36}$/);
          assert.ok(!error.message.includes("sensitive") && !error.message.includes("secret-unrecognized"));
          return true;
        });
    }
    globalThis.fetch = async () => json({ error: { errors: [{ reason: "insufficientPermissions" }] } }, 403);
    for (const [call, operation] of [
      [() => getOneTimeProduct(sku), "catalog.get"],
      [() => getOneTimeProduct(sku, "catalog.readback.created"), "catalog.readback.created"],
      [() => createOneTimeProduct(sku, "buy", 13725), "catalog.patch"],
      [() => activateBuyOption(sku, "buy", 13725), "catalog.activate"],
    ] as const) await assert.rejects(call, (error: unknown) => error instanceof GoogleApiError && error.operation === operation && !error.retryable);
    globalThis.fetch = async () => json({ error: {} }, 403);
    await assert.rejects(() => createOneTimeProduct(sku, "buy", 13725),
      (error: unknown) => error instanceof GoogleApiError && error.operation === "catalog.patch" && error.reason === "unclassified");
    globalThis.fetch = async () => { throw new Error("secret-token-in-network-exception"); };
    await assert.rejects(() => getOneTimeProduct(sku),
      (error: unknown) => error instanceof GoogleApiError && error.status === 0 && error.retryable && !error.message.includes("secret-token"));
  } finally {
    globalThis.fetch = originalFetch;
    if (oldVersion === undefined) Deno.env.delete("PLAY_CATALOG_REGIONS_VERSION");
    else Deno.env.set("PLAY_CATALOG_REGIONS_VERSION", oldVersion);
    if (oldPackage === undefined) Deno.env.delete("GOOGLE_PLAY_PACKAGE_NAME");
    else Deno.env.set("GOOGLE_PLAY_PACKAGE_NAME", oldPackage);
    if (oldAccount === undefined) Deno.env.delete("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    else Deno.env.set("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", oldAccount);
  }
});
