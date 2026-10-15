const fs=require('fs'),vm=require('vm'),ts=require('../../mobile-app/node_modules/typescript');
let completed=null,providerTime=null,captureStatus='granted',reported=0,recorded=null;
let orderExists=true,compensatedUnknown=false;
const order={id:'order-1',user_id:'buyer',product_id:'p',amount:49,status:'created',
 razorpay_order_id:'rzp-order',external_transaction_token:'choice-token'};
const supabaseAdmin={
 from(table){const q={select(columns){this.columns=columns;return this},eq(){return this},
  upsert:async()=>{compensatedUnknown=true;return {error:null}},
  update(){return this},then(resolve){resolve({error:null})},
  maybeSingle:async function(){return {data:table==='orders'
    ?!orderExists?null:this.columns.startsWith('payment_completed_at')?{payment_completed_at:completed,
      payment_provider_time:providerTime,payment_time_fallback:!providerTime}:order
    :table==='payment_captures'?{status:captureStatus,failure_reason:captureStatus==='granted'?null:'wallet_shortfall'}:null,error:null}}};return q;},
 rpc:async(name,args)=>{if(name==='record_payment_capture')recorded=args;return {error:null}}};
const mocks={
 './supabaseAdmin.ts':{supabaseAdmin},
 './razorpay.ts':{fetchPayment:async()=>({status:'captured',order_id:'rzp-order',currency:'INR',amount:4900,created_at:1}),
  fetchRazorpayOrder:async()=>({amount:4900,currency:'INR'})},
 './externalReporting.ts':{reportExternalOrder:async()=>{reported++}},
 './ucbAlert.ts':{alertUcb:async()=>{}},
};
const source=fs.readFileSync('supabase/functions/_shared/settle.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const testModule={exports:{}};
vm.runInNewContext(code,{module:testModule,exports:testModule.exports,require:id=>mocks[id],console,Date});
const check=(name,condition)=>{console.log(`${condition?'PASS':'FAIL'} ${name}`);if(!condition)process.exitCode=1};
(async()=>{
 const call=()=>testModule.exports.settleCapturedPayment({eventId:'evt',razorpayOrderId:'rzp-order',
   razorpayPaymentId:'pay-one',providerTime:'2026-10-12T23:00:00Z'});
 const missing=await call();
 check('F05 missing settlement receipt cannot return success',!missing.ok&&reported===0);
 completed='2026-10-14T00:00:00Z'; providerTime='2026-10-12T23:00:00Z';
 const present=await call();
 check('F05 authoritative capture timestamp persisted separately from receipt',
   present.ok&&recorded?.p_provider_time===providerTime&&reported===1);
 captureStatus='compensation_pending';
 const rejected=await call();
 check('F03 UCB wallet shortfall capture is reported despite refused entitlement',
   !rejected.ok&&reported===2);
 orderExists=false;recorded=null;
 const unknown=await call();
 check('F03 verified capture for an unknown local order is recorded and compensated',
   !unknown.ok&&recorded?.p_payment_id==='pay-one'&&compensatedUnknown);
})().catch(e=>{console.error(e);process.exitCode=1});
