const fs=require('fs'),vm=require('vm'),ts=require('../../mobile-app/node_modules/typescript');
const orders=Array.from({length:11},(_,i)=>({id:`order-${i}`,provider:'play',status:'paid',
  play_sku:'notes_1',purchase_token:`token-${i}`,play_last_checked_at:null}));
let checked=new Set(),reversed=false,claimCalls=0;
const query=(table)=>({
  select(){return this},eq(key,value){if(key==='id')this.id=value;return this},not(){return this},in(){return this},
  order(){return this},limit(n){this.n=n;return this},update(changes){this.changes=changes;return this},
  maybeSingle:async function(){return {data:table==='play_void_sweep_metrics'
    ?{unchecked_count:11,oldest_unchecked_at:null,cursor_lag_seconds:0}
    :table==='orders'?orders.find(o=>o.id===this.id):null,error:null}},
  then(resolve){if(this.changes) {
    if(table==='orders')Object.assign(orders.find(o=>o.id===this.id),this.changes);
    return resolve({data:null,error:null});}
    return resolve({data:table==='orders'?orders.slice(0,this.n??11):[],error:null});}
});
const supabaseAdmin={from:query,rpc:async(name,args)=>{
  if(name==='claim_play_void_sweep')return {data:{ok:false},error:null};
  if(name==='claim_payment_jobs')return {data:claimCalls++?[]:orders.map(o=>({target_id:o.id,lease_id:'11111111-1111-1111-1111-111111111111',attempts:1})),error:null};
  if(name==='reverse_play_payment'){reversed=true;return {data:{ok:true},error:null};}
  return {data:name==='finish_payment_job'?'done':null,error:null};
}};
let handler;
const src=fs.readFileSync('supabase/functions/report-external-transaction/index.ts','utf8');
const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:{},require:id=>{
 if(id.endsWith('cors.ts'))return {jsonResponse:(body,status=200)=>({body,status})};
 if(id.endsWith('supabaseAdmin.ts'))return {supabaseAdmin};
 if(id.endsWith('externalReporting.ts'))return {reportExternalOrder:async()=>{},reportExternalRefundEvent:async()=>{}};
 if(id.endsWith('googlePlay.ts'))return {getProductPurchase:async(_sku,token)=>{checked.add(token);
  if(token!=='token-10')throw Error('mock Google failure');return {purchaseState:1,refundableQuantity:0};},
  getVoidedPurchasesPage:async()=>({}),consumeProductPurchase:async()=>{}};
 if(id.endsWith('ucbAlert.ts'))return {alertUcb:async()=>{}};
 if(id.endsWith('settle.ts'))return {settleRefund:async()=>({ok:true}),settleDispute:async()=>({ok:true})};
 if(id.endsWith('razorpay.ts'))return {refundCapturedPayment:async()=>({id:'rfnd_mock'})};
 if(id.endsWith('paymentQueue.ts'))return require('../functions/_shared/paymentQueue.ts');
 throw Error(id);
},Deno:{serve:h=>handler=h,env:{get:k=>k==='UCB_REPORT_CRON_SECRET'?'x'.repeat(32):undefined}},
 console,Date,Request,Response,crypto,Promise,setTimeout});
(async()=>{
 for(let i=0;i<2;i++)await handler(new Request('http://local',{method:'POST',
  headers:{'x-ucb-cron-secret':'x'.repeat(32)},body:JSON.stringify({phase:'reconcile'})}));
 if(!checked.has('token-10')||!reversed
    || !orders.slice(0,10).every(o=>o.play_last_attempt_at&&!o.play_last_checked_at)
    || !orders[10].play_last_checked_at)
   throw Error(`F04 eleventh refunded token starved or attempt/success clocks mixed; checked ${checked.size}`);
 console.log(`PASS F04 eleventh refunded token checked despite ten permanent mock Google failures (${checked.size} unique tokens)`);
})().catch(e=>{console.error(e.message);process.exitCode=1});
