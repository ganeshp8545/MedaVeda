// All network calls and database writes are fixtures. Executes the real worker,
// catalog helpers and Google request/error wrapper together.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const ts = require('../../mobile-app/node_modules/typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sources = Object.fromEntries(['_shared/googlePlay', '_shared/playCatalog', 'sync-play-catalog/index']
  .map(name => [name, compile(`supabase/functions/${name}.ts`)]));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const sku = 'notes_137_25_v_fixture';
const rotatedSku = 'notes_137_25_v_rotated';
const secret = 'fixture-secret-'.repeat(3);
let account;
function setup() {
  let handler;
  const state = { product: null, calls: [], rpc: [], error: null, overrides: {}, created: false, activated: false,
    version: '2022/02', ready: 0, eligible: true, leaseValid: true, knownTier: false, candidate: sku };
  const env = { GOOGLE_PLAY_PACKAGE_NAME: 'in.medveda.app', GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: account,
    PLAY_CATALOG_CRON_SECRET: secret };
  const deno = { env: { get: name => name === 'PLAY_CATALOG_REGIONS_VERSION' ? state.version : env[name] },
    serve: fn => { handler = fn; } };
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const stage = url.hostname === 'oauth2.googleapis.com' ? 'oauth' : init.method === 'PATCH' ? 'patch' :
      url.pathname.endsWith('purchaseOptions:batchUpdateStates') ? 'activate' : state.activated ? 'activated' :
      state.created ? 'created' : 'get';
    state.calls.push({ stage, url: String(url), method: init.method, body: init.body });
    assert.ok(!url.pathname.includes('convertRegionPrices'), 'conversion dependency returned');
    if (state.error?.stage === stage) {
      if (state.error.status === 0) throw new Error('sensitive-network-error');
      return json({ error: { status: 'PERMISSION_DENIED', message: 'sensitive-provider-error' } }, state.error.status);
    }
    if (Object.hasOwn(state.overrides, stage)) {
      const value = state.overrides[stage];
      return value instanceof Response ? value.clone() : json(value);
    }
    if (stage === 'oauth') return json({ access_token: 'fixture', expires_in: 3600 });
    if (stage === 'patch') {
      assert.equal(url.pathname, `/androidpublisher/v3/applications/in.medveda.app/onetimeproducts/${state.candidate}`);
      assert.equal(url.searchParams.get('regionsVersion.version'), '2022/02');
      assert.equal(url.searchParams.get('allowMissing'), 'true');
      assert.equal(url.searchParams.get('updateMask'), 'listings,purchaseOptions');
      const body = JSON.parse(init.body);
      assert.equal(body.productId, state.candidate);
      assert.equal(body.purchaseOptions.length, 1);
      assert.deepEqual(body.purchaseOptions[0].regionalPricingAndAvailabilityConfigs,
        [{ regionCode: 'IN', availability: 'AVAILABLE', price: { currencyCode: 'INR', units: '137', nanos: 250000000 } }]);
      assert.equal(body.purchaseOptions[0].newRegionsConfig, undefined);
      assert.equal(body.purchaseOptions[0].state, undefined); // output-only
      assert.equal(body.regionsVersion, undefined); // query parameter, output-only in resource
      state.product = { ...body, regionsVersion: { version: '2022/02' } };
      state.product.purchaseOptions[0].state = 'DRAFT';
      state.created = true;
      return json(state.product);
    }
    if (stage === 'activate') {
      assert.deepEqual(JSON.parse(init.body), { requests: [{ activatePurchaseOptionRequest:
        { packageName: 'in.medveda.app', productId: state.candidate, purchaseOptionId: 'buy' } }] });
      state.product.purchaseOptions[0].state = 'ACTIVE';
      state.activated = true;
      return json({ oneTimeProducts: [state.product] });
    }
    assert.equal(url.pathname, `/androidpublisher/v3/applications/in.medveda.app/oneTimeProducts/${state.candidate}`);
    return state.product ? json(state.product) : json({}, 404);
  };
  const context = { TextEncoder, crypto, btoa, atob, URLSearchParams, AbortSignal, fetch, Deno: deno,
    console: { error() {} } };
  const load = (name, mocks = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(sources[name], { ...context, module, exports: module.exports, require: id => {
      assert.ok(Object.hasOwn(mocks, id), `Unexpected import ${id}`);
      return mocks[id];
    } });
    return module.exports;
  };
  const google = load('_shared/googlePlay');
  const catalog = load('_shared/playCatalog', { './googlePlay.ts': google });
  load('sync-play-catalog/index', {
    '../_shared/googlePlay.ts': google,
    '../_shared/playCatalog.ts': catalog,
    '../_shared/cors.ts': { jsonResponse: (body, status = 200) => json(body, status) },
    '../_shared/supabaseAdmin.ts': { supabaseAdmin: {
      rpc: async (name, args) => {
        state.rpc.push({ name, args });
        let data = true;
        if (name === 'claim_play_price_sync') data = [{ price_inr: '137.25', candidate_sku: state.candidate,
          purchase_option_id: 'buy', lease_id: 'fixture-lease' }];
        if (name === 'play_price_has_eligible_product') data = state.eligible;
        if (name === 'rotate_play_price_sku') { state.candidate = rotatedSku; state.product = null; data = rotatedSku; }
        if (name === 'finish_play_price_sync') { data = state.leaseValid; if (data) state.ready++; }
        return { data, error: null };
      },
      from: table => {
        assert.equal(table, 'play_price_tiers');
        return { select() { return this; }, eq() { return this; },
          maybeSingle: async () => ({ data: state.knownTier ? { play_sku: sku } : null, error: null }) };
      },
    } },
  });
  return { state, invoke: async (authorized = true) => {
    const response = await handler(new Request('https://fixture.invalid', { method: 'POST',
      headers: authorized ? { 'x-play-catalog-cron-secret': secret } : {} }));
    return { status: response.status, body: await response.json() };
  } };
}
(async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  account = JSON.stringify({ client_email: 'fixture@example.invalid',
    private_key: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes))}\n-----END PRIVATE KEY-----` });
  let cases = 0;
  const success = setup();
  assert.equal((await success.invoke(false)).status, 401);
  assert.equal(success.state.calls.length + success.state.rpc.length, 0);
  assert.equal((await success.invoke()).body.status, 'ready');
  assert.deepEqual(success.state.calls.map(c => c.stage), ['oauth', 'get', 'patch', 'created', 'activate', 'activated']);
  const active = structuredClone(success.state.product);
  const draft = structuredClone(active); draft.purchaseOptions[0].state = 'DRAFT';
  for (const product of [active, draft]) {
    const f = setup(); f.state.product = structuredClone(product); f.state.version = undefined;
    assert.equal((await f.invoke()).body.status, 'ready');
    assert.equal(f.state.calls.filter(c => c.stage === 'patch').length, 0);
    cases++;
  }
  // Existing ready products need no configuration or conversion. Replays reuse
  // the same SKU, and still read back before finishing the lease.
  const patchCount = success.state.calls.filter(c => c.stage === 'patch').length;
  assert.equal((await success.invoke()).body.status, 'ready');
  assert.equal(success.state.calls.filter(c => c.stage === 'patch').length, patchCount);
  for (const version of [undefined, '', '2026/10', '2022/02 ', '2022/13', 'garbage']) {
    const f = setup(); f.state.version = version;
    assert.equal((await f.invoke()).body.status, 'failed');
    assert.equal(f.state.calls.filter(c => c.method === 'PATCH').length, 0);
    assert.equal(f.state.rpc.find(c => c.name === 'fail_play_price_sync').args.p_retry, false);
    assert.equal(f.state.ready, 0); cases++;
  }
  for (const stage of ['oauth', 'get', 'patch', 'created', 'activate', 'activated']) {
    for (const status of [0, 400, 401, 403, 409, 429, 500, 503]) {
      const f = setup(); f.state.error = { stage, status };
      const result = await f.invoke();
      assert.equal(result.body.status, [0, 409, 429, 500, 503].includes(status) ? 'retry' : 'failed');
      assert.equal(f.state.ready, 0);
      assert.ok(!JSON.stringify(result).includes('sensitive'));
      assert.equal(f.state.rpc.filter(c => c.name === 'finish_play_price_sync').length, 0);
      cases++;
    }
  }
  // Read-back 404 is never readiness, even after a successful write.
  for (const stage of ['created', 'activated']) {
    const f = setup(); f.state.error = { stage, status: 404 };
    assert.equal((await f.invoke()).body.status, 'retry'); assert.equal(f.state.ready, 0); cases++;
  }
  for (const stage of ['get', 'patch', 'created', 'activate', 'activated']) {
    for (const value of [null, {}, [], { ...active, productId: 'wrong' },
      new Response('<html>unexpected</html>'), new Response('')]) {
      const f = setup(); f.state.overrides[stage] = value;
      assert.equal((await f.invoke()).body.status, 'retry'); assert.equal(f.state.ready, 0); cases++;
    }
  }
  for (const version of [undefined, { version: '2026/10' }, { version: 202202 }]) {
    const f = setup(); f.state.overrides.patch = { ...draft, regionsVersion: version };
    assert.equal((await f.invoke()).body.status, 'retry'); assert.equal(f.state.ready, 0); cases++;
  }
  for (const mutate of [p => { p.purchaseOptions[0].state = 'DRAFT'; },
    p => { p.purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0].price.units = '138'; },
    p => { p.purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0].price.currencyCode = 'USD'; },
    p => { p.purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0].availability = 'NO_LONGER_AVAILABLE'; },
    p => { delete p.purchaseOptions[0].buyOption; p.purchaseOptions[0].rentOption = {}; },
    p => { p.purchaseOptions.push(structuredClone(p.purchaseOptions[0])); }]) {
    for (const stage of ['patch', 'created', 'activate', 'activated']) {
      const f = setup(); const wrong = structuredClone(active); mutate(wrong);
      // DRAFT is valid at creation; only exercise its rejection at activation.
      if (wrong.purchaseOptions[0].state === 'DRAFT' && (stage === 'patch' || stage === 'created')) continue;
      f.state.overrides[stage] = stage === 'activate' ? { oneTimeProducts: [wrong] } : wrong;
      assert.equal((await f.invoke()).body.status, 'retry'); assert.equal(f.state.ready, 0); cases++;
    }
  }
  for (const stage of ['created', 'activated']) {
    const f = setup(); f.state.error = { stage, status: 503 };
    assert.equal((await f.invoke()).body.status, 'retry'); f.state.error = null;
    assert.equal((await f.invoke()).body.status, 'ready');
    assert.equal(f.state.calls.filter(c => c.stage === 'patch').length, 1); cases++;
  }
  for (const knownTier of [false, true]) {
    const f = setup(); f.state.knownTier = knownTier; f.state.product = structuredClone(active);
    f.state.product.purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0].price.units = '138';
    assert.equal((await f.invoke()).body.status, knownTier ? 'ready' : 'failed');
    assert.equal(f.state.calls.filter(c => c.stage === 'patch').length, knownTier ? 1 : 0);
    if (knownTier) assert.equal(f.state.product.productId, rotatedSku);
    cases++;
  }
  const expired = setup(); expired.state.leaseValid = false;
  assert.equal((await expired.invoke()).body.status, 'retry'); assert.equal(expired.state.ready, 0);
  const ineligible = setup(); ineligible.state.eligible = false;
  assert.equal((await ineligible.invoke()).body.status, 'failed'); assert.equal(ineligible.state.calls.length, 0);
  console.log(`PASS real catalog creation worker: ${cases + 5} scenarios; exact INR/India, explicit version, auth, failures, retries, idempotency, rotation and lease fences`);
})().catch(error => { console.error(error); process.exitCode = 1; });
