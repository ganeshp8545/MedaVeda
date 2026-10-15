const fs=require('fs'),vm=require('vm'),ts=require('../../mobile-app/node_modules/typescript');
let handler,attempts=0,refundCalls=0,googleRefundQueued=0,status='pending';
const item={payment_id:'pay_compensate',order_id:'order-comp',amount_paise:4900,
 refund_request_id:'medveda_comp_fixed',provider_refund_id:null};
const query=table=>{const q={select(){return q},eq(){return q},update(changes){q.changes=changes;return q},
 maybeSingle:async()=>({data:table==='payment_compensations'?item:null,error:null}),
 then(resolve){if(q.changes&&table==='payment_compensations')Object.assign(item,q.changes);
   resolve({data:null,error:null});}};return q};
const supabaseAdmin={from:query,rpc:async(name)=>{
 if(name==='claim_payment_jobs')return {data:[{target_id:item.payment_id,lease_id:'11111111-1111-1111-1111-111111111111'}],error:null};
 if(name==='finish_payment_job')return {data:status==='refunded'?'done':'pending',error:null};
 return {data:null,error:null};
}};
const source=fs.readFileSync('supabase/functions/report-external-transaction/index.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:{},require:id=>{
 if(id.endsWith('cors.ts'))return {jsonResponse:(body,status=200)=>({body,status})};
 if(id.endsWith('supabaseAdmin.ts'))return {supabaseAdmin};
 if(id.endsWith('externalReporting.ts'))return {reportExternalOrder:async()=>{},reportExternalRefundEvent:async()=>{}};
 if(id.endsWith('googlePlay.ts'))return {};
 if(id.endsWith('ucbAlert.ts'))return {alertUcb:async()=>{}};
 if(id.endsWith('settle.ts'))return {settleRefund:async()=>{googleRefundQueued++;return {ok:true}}};
 if(id.endsWith('razorpay.ts'))return {refundCapturedPayment:async(_payment,_amount,requestId)=>{
   if(requestId!==item.refund_request_id)throw Error('idempotency marker changed');
   refundCalls++;if(refundCalls===1)throw Error('mock transient Razorpay error');
   return {id:'rfnd_mock_processed'};}};
 if(id.endsWith('paymentQueue.ts'))return require('../functions/_shared/paymentQueue.ts');
 throw Error(id);
},Deno:{serve:h=>handler=h,env:{get:k=>k==='UCB_REPORT_CRON_SECRET'?'x'.repeat(32):undefined}},
 console,Date,Request,Response,crypto,Promise,setTimeout});
(async()=>{
 const send=()=>handler(new Request('http://local',{method:'POST',
  headers:{'x-ucb-cron-secret':'x'.repeat(32)},body:JSON.stringify({phase:'compensate'})}));
 const first=await send();attempts++;
 const second=await send();attempts++;
 if(first.status!==503||second.status!==200||item.status!=='refunded'||item.provider_refund_id!=='rfnd_mock_processed'
    ||refundCalls!==2||googleRefundQueued!==1)throw Error('F03 compensation retry or Google refund reporting failed');
 console.log('PASS F03 full automatic compensation retries and queues Google refund with stable request id');
})().catch(e=>{console.error(e);process.exitCode=1});
