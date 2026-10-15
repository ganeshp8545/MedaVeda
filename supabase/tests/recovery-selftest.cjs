const fs = require('fs');
const vm = require('vm');
const ts = require('../../mobile-app/node_modules/typescript');
let handler, lookups = 0;
const orderId = '00000000-0000-0000-0000-000000000001';
let limiterDown = false;
const order = { id: orderId, user_id: 'owner', razorpay_order_id: 'order_test', external_transaction_token: null };
const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: order, error: null }) };
const mocks = {
  '../_shared/cors.ts': { handleOptions: () => null, jsonResponse: (body, status=200) => new Response(JSON.stringify(body), { status }) },
  '../_shared/supabaseAdmin.ts': { supabaseAdmin: { from: () => query }, getUserFromAuthHeader: async req => {
    const token = req.headers.get('authorization');
    return token?.startsWith('Bearer ') ? { id: token.slice(7) } : null;
  } },
  '../_shared/razorpay.ts': { fetchCapturedPaymentForOrder: async () => { lookups++; return null; }, verifyPaymentSignature: async () => true },
  '../_shared/settle.ts': { settleCapturedPayment: async () => ({ ok: true, orderId, amountRupees: 1 }) },
  '../_shared/rateLimit.ts': { clientIp: () => 'unknown', withinLimit: async (_key,_max,_seconds,failClosed) => !limiterDown || !failClosed },
  '../_shared/paymentGate.ts': { paymentGate: async () => 'allow' },
};
const source = fs.readFileSync('supabase/functions/verify-payment/index.ts','utf8');
const compiled = ts.transpileModule(source,{ compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 } }).outputText;
const testModule = { exports:{} };
vm.runInNewContext(compiled,{ module:testModule,exports:testModule.exports,require:id=>mocks[id],Deno:{serve:h=>handler=h},Request,Response,console });
async function call(token) { return handler(new Request('https://local/verify-payment',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify({internalOrderId:orderId,recover:true})})); }
(async()=>{
  for (const [name, actual, expected] of [
    ['unsigned recover denied', (await call(null)).status, 401],
    ['wrong owner denied', (await call('other')).status, 403],
  ]) { const ok=actual===expected; console.log(`${ok?'PASS':'FAIL'} ${name}: ${actual}`); if(!ok) process.exitCode=1; }
  limiterDown=true;
  const status=(await call('owner')).status;
  const ok=status===429 && lookups===0;
  console.log(`${ok?'PASS':'FAIL'} recovery limiter fails closed before provider lookup: ${status}, lookups=${lookups}`);
  if(!ok) process.exitCode=1;
})().catch(e=>{ console.error(e); process.exitCode=1; });
