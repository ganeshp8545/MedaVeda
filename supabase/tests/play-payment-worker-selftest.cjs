const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const ts = require('../../mobile-app/node_modules/typescript');

const source = fs.readFileSync('supabase/functions/play-payment-worker/index.ts','utf8');
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,
  target:ts.ScriptTarget.ES2022}}).outputText;
const secret = 's'.repeat(40);
const id = '00000000-0000-0000-0000-000000000001';

function setup(overrides={}) {
  const order = {id,provider:'play',status:'paid',play_sku:'notes_49',purchase_token:'token-1234567890',
    play_consumption_status:'failed',play_last_checked_at:null,play_last_attempt_at:null};
  const state = {order, voidTokens:new Set(),jobs:{consume:{status:'pending',attempts:0,lease:null},
    reconcile:{status:'pending',attempts:0,lease:null}}, cursor:{lease:null,next_page_token:null},
    consumed:0,reversed:0,alerts:0,google:{purchaseState:0,consumptionState:0,refundableQuantity:1},
    calls:[],nextLease:0,...overrides};
  let handler;
  function query(table) {
    const q = {filters:[],changes:null,select(){return this},eq(k,v){this.filters.push([k,v]);return this},
      in(k,v){this.filters.push([k,v]);return this},update(v){this.changes=v;return this},
      maybeSingle:async function(){if(table==='orders')return {data:state.order,error:null};
        if(table==='play_void_tokens')return {data:state.voidTokens.has(state.order.purchase_token)
          ?{purchase_token:state.order.purchase_token}:null,error:null};
        if(table==='play_recovery_metrics')return {data:{backlog_count:0,parked_count:0,
          oldest_job_at:null,cursor_lag_seconds:0,cursor_failures:0},error:null};
        return {data:null,error:null};},
      then(resolve){
        if(table==='orders' && this.changes) {
          if(this.filters.every(([k,v])=>state.order[k]===v)) Object.assign(state.order,this.changes);
          return resolve({data:null,error:null});
        }
        if(table==='orders')return resolve({data:state.order.status==='paid'?[{id,purchase_token:state.order.purchase_token}]:[],error:null});
        return resolve({data:[],error:null});
      }};
    return q;
  }
  const db = {from:query,rpc:async(name,args={})=>{
    state.calls.push(name);
    if(name==='enqueue_play_payment_jobs')return {data:null,error:null};
    if(name==='claim_play_payment_jobs') {
      const job=state.jobs[args.p_kind];
      if(job.status==='leased' && !state.expired)return {data:[],error:null};
      if(job.status!=='pending' && !(job.status==='leased' && state.expired))return {data:[],error:null};
      job.status='leased';job.attempts++;job.lease=`lease-${++state.nextLease}`;
      return {data:[{order_id:id,lease_id:job.lease,attempts:job.attempts}],error:null};
    }
    if(name==='finish_play_payment_job') {
      const job=state.jobs[args.p_kind];
      if(job.lease!==args.p_lease_id || state.forceLeaseLost)return {data:'lease_lost',error:null};
      job.status=args.p_success?'done':job.attempts>=12?'parked':'pending';job.lease=null;
      return {data:job.status,error:null};
    }
    if(name==='reverse_play_payment') {
      assert.equal(args.p_purchase_token,state.order.purchase_token);
      state.reversed++;state.order.status='refunded';
      return {data:{status:'no_referral_credit',purchases_revoked:1},error:null};
    }
    if(name==='record_play_void_tokens') {
      args.p_tokens.forEach(token=>state.voidTokens.add(token));return {data:null,error:null};
    }
    if(name==='claim_play_recovery_cursor') {
      if(state.cursor.lease && !state.expired)return {data:{ok:false},error:null};
      state.cursor.lease=`cursor-${++state.nextLease}`;
      return {data:{ok:true,lease_id:state.cursor.lease,start_time_ms:Date.now()-86400000,
        end_time_ms:Date.now()-1000,next_page_token:state.cursor.next_page_token},error:null};
    }
    if(name==='finish_play_recovery_cursor') {
      if(state.cursor.lease!==args.p_lease_id || state.forceLeaseLost)return {data:'lease_lost',error:null};
      state.cursor.lease=null;
      if(args.p_success)state.cursor.next_page_token=args.p_next_page_token;
      return {data:args.p_success?'done':'retry',error:null};
    }
    throw Error(name);
  }};
  class GoogleApiError extends Error{constructor(status){super('Google failure');this.status=status}}
  const mocks={
    '../_shared/cors.ts':{jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status})},
    '../_shared/supabaseAdmin.ts':{supabaseAdmin:db},
    '../_shared/googlePlay.ts':{
      GoogleApiError,
      getProductPurchase:async()=>{if(state.googleFailure)throw new Error('Google unavailable');return {...state.google};},
      consumeProductPurchase:async()=>{state.consumed++;
        if(state.consumeConflict){state.google.consumptionState=1;throw new GoogleApiError(409);}
        if(state.consumeFailure)throw new Error('consume failed');state.google.consumptionState=1;},
      getVoidedPurchasesPage:async()=>{if(state.googleFailure)throw new Error('Google unavailable');
        return state.voidPage??{voidedPurchases:[],tokenPagination:{}};},
    },
    '../_shared/paymentQueue.ts':{runBounded:async(items,_concurrency,fn)=>{await Promise.all(items.map(fn));}},
    '../_shared/ucbAlert.ts':{alertUcb:async()=>{state.alerts++;}},
  };
  vm.runInNewContext(code,{exports:{},require:name=>{if(!(name in mocks))throw Error(name);return mocks[name]},
    Deno:{serve:fn=>handler=fn,env:{get:key=>key==='PLAY_PAYMENT_CRON_SECRET'?secret:undefined}},
    Request,Response,Date,console,Promise,Set});
  return {state,invoke:async phase=>{
    const response=await handler(new Request('http://local',{method:'POST',
      headers:{'x-play-payment-cron-secret':secret},body:JSON.stringify({phase})}));
    return {status:response.status,body:await response.json()};
  },handler};
}

(async()=>{
  let t=setup();let r=await t.invoke('consume');
  assert.equal(r.status,200);assert.equal(t.state.consumed,1);
  assert.equal(t.state.order.play_consumption_status,'consumed');
  console.log('PASS successful Play consumption');

  t=setup({consumeFailure:true});r=await t.invoke('consume');
  assert.equal(r.status,503);assert.equal(t.state.jobs.consume.status,'pending');
  t.state.consumeFailure=false;r=await t.invoke('consume');
  assert.equal(r.status,200);assert.equal(t.state.order.play_consumption_status,'consumed');
  console.log('PASS failed consumption and retry');

  t=setup();const first=await t.invoke('consume');const second=await t.invoke('consume');
  assert.equal(first.status,200);assert.equal(second.body.claimed,0);assert.equal(t.state.consumed,1);
  console.log('PASS duplicate token/job does not consume twice');

  t=setup();await Promise.all([t.invoke('consume'),t.invoke('consume')]);
  assert.equal(t.state.consumed,1);console.log('PASS concurrent worker claim');

  t=setup({expired:true});t.state.jobs.consume={status:'leased',attempts:1,lease:'old-lease'};
  await t.invoke('consume');assert.equal(t.state.jobs.consume.status,'done');
  assert.equal(t.state.jobs.consume.attempts,2);
  console.log('PASS expired lease reclaimed');

  t=setup({consumeFailure:true});t.state.jobs.consume.attempts=11;
  r=await t.invoke('consume');assert.equal(r.status,503);
  assert.equal(t.state.jobs.consume.status,'parked');
  console.log('PASS retry limit parks failed job');

  t=setup({googleFailure:true});r=await t.invoke('reconcile');
  assert.equal(r.status,503);assert.equal(t.state.order.play_last_checked_at,null);
  assert.ok(t.state.order.play_last_attempt_at);
  console.log('PASS Google API failure retried without false check timestamp');

  t=setup({google:{purchaseState:1,consumptionState:0,refundableQuantity:0}});
  await t.invoke('reconcile');assert.equal(t.state.reversed,1);
  assert.equal(t.state.order.status,'refunded');
  console.log('PASS refunded purchase reverses entitlement');

  t=setup({voidPage:{voidedPurchases:[{purchaseToken:'token-1234567890'},
    {purchaseToken:'token-1234567890'}],tokenPagination:{}}});
  r=await t.invoke('voids');assert.equal(r.status,200);assert.equal(t.state.reversed,1);
  assert.ok(t.state.voidTokens.has('token-1234567890'));
  console.log('PASS voided token deduplicated and reversed');

  t=setup();t.state.voidTokens.add(t.state.order.purchase_token);
  await t.invoke('reconcile');assert.equal(t.state.reversed,1);
  console.log('PASS void observed before settlement reverses later entitlement');

  t=setup({forceLeaseLost:true});r=await t.invoke('consume');
  assert.equal(r.status,503);assert.equal(r.body.failed,1);
  console.log('PASS stale lease cannot finish job');

  t=setup({forceLeaseLost:true});r=await t.invoke('voids');
  assert.equal(r.status,503);assert.ok(t.state.cursor.lease);
  console.log('PASS stale lease cannot advance void cursor');

  t=setup({googleFailure:true});r=await t.invoke('voids');
  assert.equal(r.status,503);assert.equal(t.state.cursor.lease,null);
  console.log('PASS void API failure releases cursor for retry');

  t=setup();t.state.order.play_consumption_status='consumed';
  await t.invoke('consume');assert.equal(t.state.consumed,0);
  console.log('PASS direct verification consumption race');

  t=setup({consumeConflict:true});r=await t.invoke('consume');
  assert.equal(r.status,200);assert.equal(t.state.order.play_consumption_status,'consumed');
  console.log('PASS concurrent direct consume 409 confirmed with fresh Google read');

  t=setup();t.state.order.provider='razorpay';await t.invoke('consume');
  assert.equal(t.state.consumed,0);assert.equal(t.state.reversed,0);
  assert.ok(t.state.calls.every(x=>!x.includes('razorpay')&&!x.includes('refundCaptured')));
  assert.ok(!source.includes('razorpay')&&!source.includes('payment_compensations'));
  console.log('PASS Razorpay paths untouched');

  t=setup();const unauthorized=await t.handler(new Request('http://local',{method:'POST',
    body:'{"phase":"consume"}'}));assert.equal(unauthorized.status,401);
  console.log('PASS dedicated cron authentication');

  const migration=fs.readFileSync('supabase/migrations/20261015100000_play_payment_jobs.sql','utf8');
  for(const name of ['public.payment_jobs','public.payment_compensations','public.provider_events','razorpay_order_id'])
    assert.ok(!migration.includes(name),`migration references shared/Razorpay path: ${name}`);
  assert.ok(migration.includes("lease_until>now() for update"));
  assert.ok(migration.includes("for update skip locked limit p_limit"));
  console.log('PASS Play-only migration dependencies and SQL lease fences');
})().catch(error=>{console.error(error);process.exitCode=1});
