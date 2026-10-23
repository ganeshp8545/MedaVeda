const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../mobile-app/node_modules/typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const validation = { exports: {} };
vm.runInNewContext(compile('supabase/functions/_shared/playPurchaseValidation.ts'), { exports: validation.exports });
const code = compile('supabase/functions/verify-play-purchase/index.ts');
const orderId = '00000000-0000-0000-0000-000000000001';
class GoogleApiError extends Error {
  constructor(status) { super(`Google API status=${status}`); this.status = status; this.operation = 'purchase.get-v2'; }
}
function setup() {
  const state = { user: 'buyer', apiError: null, settlementError: false, duplicate: false, consumed: 0, settled: 0,
    updates: [], consumeFailure: false, logs: [],
    order: { id: orderId, user_id: 'buyer', product_id: 'notes', provider: 'play', play_sku: 'sku',
      play_purchase_option_id: 'buy', amount: 49, status: 'created', purchase_token: null },
    purchase: { purchaseStateContext: { purchaseState: 'PURCHASED' }, regionCode: 'IN',
      obfuscatedExternalAccountId: 'hash-buyer', obfuscatedExternalProfileId: `hash-${orderId}`,
      purchaseCompletionTime: new Date().toISOString(),
      productLineItem: [{ productId: 'sku', productOfferDetails: { purchaseOptionId: 'buy', quantity: 1,
        refundableQuantity: 1, consumptionState: 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED' } }] },
  };
  let handler;
  const mocks = {
    '../_shared/cors.ts': { handleOptions: () => null, jsonResponse: (body, status=200) => new Response(JSON.stringify(body), { status }) },
    '../_shared/rateLimit.ts': { withinLimit: async () => true },
    '../_shared/playPurchaseValidation.ts': validation.exports,
    '../_shared/googlePlay.ts': { GoogleApiError, sha256Hex: async x => `hash-${x}`,
      getProductPurchaseV2: async () => { if (state.apiError) throw state.apiError; return state.purchase; },
      getProductPurchase: async () => { throw new Error('Unexpected legacy path'); },
      consumeProductPurchase: async () => {
        state.consumed++;
        if (state.consumeFailure) {
          // Another worker completed consumption while this request failed.
          state.order.play_consumption_status = 'consumed';
          throw new Error('synthetic-sensitive-error');
        }
      },
    },
    '../_shared/supabaseAdmin.ts': {
      getUserFromAuthHeader: async () => state.user ? { id: state.user } : null,
      supabaseAdmin: {
        rpc: async (name, args) => {
          assert.equal(name, 'settle_play_purchase'); state.settled++;
          assert.equal(args.p_user_id, 'buyer'); assert.equal(args.p_play_sku, 'sku');
          return { data: { ok: true, amount: 49, duplicate: state.duplicate }, error: state.settlementError ? { code: 'fixture' } : null };
        },
        from: table => ({ changes: null, filters: [], select() { return this; },
          eq(k, v) { this.filters.push([k,v,false]); return this; },
          neq(k, v) { this.filters.push([k,v,true]); return this; },
          update(changes) { this.changes=changes; return this; },
          maybeSingle: async () => ({ data: table === 'orders' ? { ...state.order } : { title: 'Notes' }, error: null }),
          then(resolve) {
            if (this.changes && this.filters.every(([k,v,neg]) => neg ? state.order[k]!==v : state.order[k]===v)) {
              state.updates.push(this.changes); Object.assign(state.order, this.changes);
            }
            resolve({ error: null });
          },
        }),
      },
    },
  };
  vm.runInNewContext(code, { exports: {}, require: key => mocks[key], Date,
    console: { error: (...args) => state.logs.push(args) }, Deno: { serve: fn => { handler=fn; } } });
  return { state, invoke: async (body={}) => {
    const response = await handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify({
      internalOrderId: orderId, productId: 'notes', purchaseToken: 'synthetic-purchase-token', ...body,
    }) }));
    return { status: response.status, body: await response.json() };
  } };
}
(async () => {
  let t=setup(), result=await t.invoke();
  assert.equal(result.body.success, true); assert.equal(t.state.settled, 1); assert.equal(t.state.consumed, 1);
  console.log('PASS real verification handler validates v2 receipt then settles and consumes');
  for (const [label, change, status] of [
    ['unauthenticated', s => { s.user=null; }, 401],
    ['wrong owner', s => { s.user='other'; }, 403],
    ['wrong provider', s => { s.order.provider='razorpay'; }, 403],
    ['token replacement', s => { s.order.purchase_token='another-token'; }, 403],
    ['wrong SKU', s => { s.purchase.productLineItem[0].productId='wrong'; }, 403],
    ['wrong option', s => { s.purchase.productLineItem[0].productOfferDetails.purchaseOptionId='wrong'; }, 403],
    ['wrong Play account', s => { s.purchase.obfuscatedExternalAccountId='wrong'; }, 403],
    ['wrong Play order', s => { s.purchase.obfuscatedExternalProfileId='wrong'; }, 403],
    ['refunded', s => { s.purchase.productLineItem[0].productOfferDetails.refundableQuantity=0; }, 403],
    ['cancelled', s => { s.purchase.purchaseStateContext.purchaseState='CANCELLED'; }, 403],
    ['pending', s => { s.purchase.purchaseStateContext.purchaseState='PENDING'; }, 200],
    ['unsettled consumed receipt', s => { s.purchase.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED'; }, 409],
    ['Google permission 403', s => { s.apiError=new GoogleApiError(403); }, 503],
    ['invalid token', s => { s.apiError=new GoogleApiError(400); }, 403],
    ['product/token not found', s => { s.apiError=new GoogleApiError(404); }, 403],
    ['expired token', s => { s.apiError=new GoogleApiError(410); }, 403],
    ['network failure', s => { s.apiError=new Error('synthetic-sensitive-error'); }, 503],
  ]) {
    t=setup(); change(t.state); result=await t.invoke();
    assert.equal(result.status,status,label); assert.equal(t.state.settled,0,label); assert.equal(t.state.consumed,0,label);
    assert.ok(!JSON.stringify(t.state.logs).includes('synthetic-sensitive-error'));
  }
  t=setup(); result=await t.invoke({ productId:'wrong' }); assert.equal(result.status,403); assert.equal(t.state.settled,0);
  t=setup(); result=await t.invoke({ purchaseToken:'short' }); assert.equal(result.status,400); assert.equal(t.state.settled,0);
  console.log('PASS invalid ownership/token/SKU/option/refund/cancellation/pending/API/network cases cannot settle');
  t=setup(); t.state.settlementError=true; result=await t.invoke(); assert.equal(result.status,503); assert.equal(t.state.consumed,0);
  t=setup(); t.state.duplicate=true; result=await t.invoke(); assert.equal(result.status,409);
  t=setup(); t.state.order.status='paid'; t.state.order.purchase_token='synthetic-purchase-token';
  t.state.purchase.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';
  result=await t.invoke(); assert.equal(result.body.success,true); assert.equal(t.state.consumed,0);
  t=setup(); t.state.order.purchase_token='synthetic-purchase-token'; t.state.consumeFailure=true;
  result=await t.invoke(); assert.equal(result.body.success,true); assert.equal(t.state.order.play_consumption_status,'consumed');
  console.log('PASS failed settlement never consumes; duplicate conflicts; paid replay and concurrent consumption remain idempotent');
})().catch(error => { console.error(error); process.exitCode=1; });
