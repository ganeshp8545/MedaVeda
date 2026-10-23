const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../mobile-app/node_modules/typescript');
const code = ts.transpileModule(fs.readFileSync('supabase/functions/create-play-order/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup(status, lookupError = false) {
  let handler;
  const mocks = {
    '../_shared/cors.ts': { handleOptions: () => null, jsonResponse: (body, status=200) => new Response(JSON.stringify(body), { status }) },
    '../_shared/rateLimit.ts': { withinLimit: async () => true },
    '../_shared/supabaseAdmin.ts': {
      getUserFromAuthHeader: async () => ({ id: 'buyer' }),
      supabaseAdmin: {
        rpc: async () => ({ data: { ok: false, code: 'price_tier_pending' }, error: null }),
        from: table => ({ select() { return this; }, eq() { return this; },
          maybeSingle: async () => ({ data: table === 'products'
            ? { scope: 'chapter', active: true, product_type: 'notes', price: 49 }
            : status ? { status } : null, error: table === 'play_price_sync' && lookupError ? {} : null }),
        }),
      },
    },
  };
  vm.runInNewContext(code, { exports: {}, require: key => mocks[key], Deno: { serve: fn => { handler = fn; } }, console });
  return () => handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify({ productId: 'notes' }) }));
}
(async () => {
  for (const state of ['failed', 'pending', 'running', 'ready', null]) {
    const response = await setup(state)();
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, state === 'failed' ? 'price_tier_failed' : 'price_tier_pending');
    assert.ok(!JSON.stringify(body).includes('403'));
  }
  assert.equal((await setup('failed', true)()).status, 503);
  console.log('PASS checkout distinguishes terminal catalog failures from pending/stale tiers and fails closed on lookup errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
