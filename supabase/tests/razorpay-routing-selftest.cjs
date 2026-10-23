const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../mobile-app/node_modules/typescript');
const code = ts.transpileModule(fs.readFileSync('supabase/functions/create-order/index.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup() {
  let handler, providerCalls=0, writes=0;
  const mocks = {
    '../_shared/cors.ts': { handleOptions: () => null, jsonResponse: (body,status=200) => new Response(JSON.stringify(body),{status}) },
    '../_shared/rateLimit.ts': { withinLimit: async () => true },
    '../_shared/ucbStates.ts': { INDIA_ADMINISTRATIVE_AREAS: new Set() },
    '../_shared/paymentGate.ts': { paymentGate: async () => 'allow' },
    '../_shared/razorpay.ts': {
      createRazorpayOrder: async () => { providerCalls++; return { id:'fixture-provider-order' }; },
      getRazorpayKeyId: () => 'fixture-public-key', isLiveMode: () => false,
    },
    '../_shared/supabaseAdmin.ts': {
      getUserFromAuthHeader: async () => ({id:'buyer'}),
      supabaseAdmin: {
        rpc: async () => { writes++; return {data:{ok:true,order_id:'fixture-order',amount:49,title:'Notes'}}; },
        from: table => ({ select() { return this; }, eq() { return this; }, is() { return this; },
          update() { writes++; return this; },
          maybeSingle: async () => ({data: table === 'profiles' ? { course_id:'bams',blocked:false } : { id:'notes',course_id:'bams',active:true }}),
          then(resolve) { resolve({error:null}); },
        }),
      },
    },
  };
  vm.runInNewContext(code, { exports:{}, require:key=>mocks[key], Date, console,
    Deno:{serve:fn=>{handler=fn;},env:{get:()=> 'https://fixture.invalid'}} });
  return { invoke: headers=>handler(new Request('https://fixture.invalid',{method:'POST',headers,
    body:JSON.stringify({productId:'notes'})})), counts:()=>({providerCalls,writes}) };
}
(async()=>{
  for(const version of ['1.2.0','1.1.0','']) {
    const t=setup(), response=await t.invoke({'x-medveda-app-version':version});
    assert.equal(response.status,403);assert.equal((await response.json()).code,'play_billing_required');
    assert.deepEqual(t.counts(),{providerCalls:0,writes:0});
  }
  const t=setup(), response=await t.invoke({});
  assert.equal(response.status,200);assert.equal((await response.json()).razorpayOrderId,'fixture-provider-order');
  assert.equal(t.counts().providerCalls,1);
  console.log('PASS declared native Razorpay creation denied before writes; website request retains Razorpay checkout');
})().catch(error=>{console.error(error);process.exitCode=1;});
