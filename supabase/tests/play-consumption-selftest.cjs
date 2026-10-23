const fs=require('fs'),vm=require('vm'),ts=require('../../mobile-app/node_modules/typescript');
const orderId='00000000-0000-0000-0000-000000000010',userId='buyer-id',token='play-token-12345';
const order={id:orderId,user_id:userId,product_id:'product',provider:'play',play_sku:'notes_49',
  amount:49,status:'created',purchase_token:null,external_transaction_token:null,
  external_choice_bound_order_id:null,play_consumption_status:null};
function query(table){return {select(){return this},eq(){return this},neq(){return this},update(changes){Object.assign(order,changes);return this},
  maybeSingle:async()=>({data:table==='orders'?order:{title:'Notes'},error:null}),
  then(resolve){resolve({data:null,error:null})}}}
let handler,consumptionCalls=0;
const mocks={
 '../_shared/cors.ts':{handleOptions:()=>null,jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status})},
 '../_shared/supabaseAdmin.ts':{getUserFromAuthHeader:async()=>({id:userId}),supabaseAdmin:{from:query,rpc:async()=>({data:{ok:true,amount:49},error:null})}},
 '../_shared/rateLimit.ts':{withinLimit:async()=>true},
 '../_shared/googlePlay.ts':{GoogleApiError:class extends Error{},sha256Hex:async s=>`hash:${s}`,
  getProductPurchase:async()=>({purchaseState:0,refundableQuantity:1,productId:'notes_49',purchaseToken:token,
    regionCode:'IN',quantity:1,obfuscatedExternalAccountId:`hash:${userId}`,
    obfuscatedExternalProfileId:`hash:${orderId}`,purchaseTimeMillis:String(Date.now()-1000),consumptionState:0}),
  consumeProductPurchase:async()=>{consumptionCalls++;throw new Error('mock Google consume outage')}}};
const source=fs.readFileSync('supabase/functions/verify-play-purchase/index.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const testModule={exports:{}};
vm.runInNewContext(code,{module:testModule,exports:testModule.exports,require:id=>mocks[id],
 Deno:{serve:h=>handler=h},Request,Response,Date,console});
(async()=>{const result=await handler(new Request('https://local/verify-play-purchase',{method:'POST',
  body:JSON.stringify({purchaseToken:token,productId:'product',internalOrderId:orderId})}));
const body=await result.json();
const ok=result.status===200&&body.success===true&&order.play_consumption_status==='failed'&&consumptionCalls===1;
console.log(`${ok?'PASS':'FAIL'} F10 Google consumption failure recorded for retry after grant`);
if(!ok)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
