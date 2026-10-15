const fs = require('fs');
const vm = require('vm');
const ts = require('../../mobile-app/node_modules/typescript');
const order = { id: 'order-1', provider: 'razorpay', status: 'paid', amount: 10,
  external_transaction_token: 'choice-token', external_transaction_id: 'external-1',
  external_report_status: 'pending', tax_pre_amount: 10, tax_amount: 0,
  tax_region_code: 'IN', tax_administrative_area: 'MAHARASHTRA',
  payment_completed_at: '2026-10-13T00:00:00.000Z', external_refund_at: null };
order.payment_provider_time='2026-10-11T23:00:00.000Z'; // capture 25h before receipt
const refunds = {};
const api = { current: null, getFailures: 0, createFailures: 0, permanent: false,
  createCalls: 0, partialCalls: [], mismatch: false };
class GoogleApiError extends Error { constructor(status) { super(`Google API ${status}`); this.status = status; } }
const packageName = () => 'in.medveda.app';
function external(id, body) {
  return { externalTransactionId: id, packageName: packageName(), transactionState: 'TRANSACTION_REPORTED',
    originalPreTaxAmount: body.originalPreTaxAmount, originalTaxAmount: body.originalTaxAmount,
    currentPreTaxAmount: { ...body.originalPreTaxAmount },
    userTaxAddress: body.userTaxAddress, transactionTime: body.transactionTime,
    oneTimeTransaction: body.oneTimeTransaction };
}
const google = { GoogleApiError, packageName,
  getExternalTransaction: async () => {
    if (api.getFailures-- > 0 || !api.current) throw new GoogleApiError(404);
    return api.current;
  },
  createExternalTransaction: async (id, body) => {
    api.createCalls++;
    if (api.permanent) throw new GoogleApiError(400);
    if (api.createFailures-- > 0) throw new GoogleApiError(503);
    api.current = external(id, body);
    if (api.mismatch) api.current.originalPreTaxAmount = { currency: 'INR', priceMicros: '1' };
    return api.current;
  },
  refundExternalTransactionPartially: async (_id, refundId, amount) => {
    api.partialCalls.push([refundId, amount]);
    api.current.currentPreTaxAmount = { currency: 'INR',
      priceMicros: String(Number(api.current.currentPreTaxAmount.priceMicros) - Number(amount)) };
    return api.current;
  },
  refundExternalTransaction: async () => { api.current.transactionState='TRANSACTION_CANCELED'; return api.current; },
};
function rows(table) { return table === 'orders' ? [order] : Object.values(refunds); }
function query(table) {
  const predicates = [];
  const q = { select() { return this; }, eq(k,v) { predicates.push(row=>row[k]===v); return this; },
    neq(k,v) { predicates.push(row=>row[k]!==v); return this; },
    update(changes) { this.changes=changes; return this; },
    single: async () => ({ data: rows(table).find(row=>predicates.every(f=>f(row))) ?? null, error:null }),
    maybeSingle: async () => ({ data: rows(table).find(row=>predicates.every(f=>f(row))) ?? null, error:null }),
    then(resolve) {
      const selected=rows(table).filter(row=>predicates.every(f=>f(row)));
      if (this.changes) selected.forEach(row=>Object.assign(row,this.changes));
      resolve({ data:selected, error:null });
    },
  };
  return q;
}
const supabaseAdmin = { from: query, rpc: async (name,args) => {
  if (name === 'claim_ucb_external_refund') {
    const row=refunds[args.p_refund_id];
    if (row.status === 'reported') return { data:{ok:false},error:null };
    row.status='processing'; return {data:{ok:true},error:null};
  }
  return {data:{ok:true},error:null};
} };
const src=fs.readFileSync('supabase/functions/_shared/externalReporting.ts','utf8');
const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const testModule={exports:{}};
vm.runInNewContext(code,{module:testModule,exports:testModule.exports,require:id=>{
  if(id==='./supabaseAdmin.ts') return {supabaseAdmin};
  if(id==='./googlePlay.ts') return google;
  if(id==='./ucbStates.ts') return {INDIA_ADMINISTRATIVE_AREAS:new Set(['MAHARASHTRA'])};
  throw new Error(id);
},console,Date,BigInt});
const {reportExternalOrder,reportExternalRefundEvent}=testModule.exports;
let failed=0;
function check(name,ok){console.log(`${ok?'PASS':'FAIL'} F10 ${name}`);if(!ok)failed++;}
async function rejects(fn){try{await fn();return false}catch{return true}}
(async()=>{
  order.payment_completed_at=null;
  check('missing completion time prevents Google call',await rejects(()=>reportExternalOrder(order.id)) && api.createCalls===0 && order.external_report_status==='failed');
  order.payment_completed_at='2026-10-13T00:00:00.000Z';
  api.createFailures=1;
  check('transient rejection records failed state',await rejects(()=>reportExternalOrder(order.id)) && order.external_report_status==='failed');
  check('retry then success',await reportExternalOrder(order.id)==='reported' && order.external_report_status==='reported');
  check('F05 Google transactionTime is provider capture time, 25h before receipt',
    api.current.transactionTime===order.payment_provider_time);
  api.current=null; api.permanent=true; order.external_report_status='pending';
  check('permanent Google rejection stays failed',await rejects(()=>reportExternalOrder(order.id)) && order.external_report_status==='failed');
  api.permanent=false;api.mismatch=true;api.current=null;order.external_report_status='pending';
  check('Google amount mismatch rejected',await rejects(()=>reportExternalOrder(order.id)) && order.external_report_status==='failed');
  api.mismatch=false;api.current=null;order.external_report_status='pending';
  await reportExternalOrder(order.id);
  for(const [id,amount] of [['refund-one',200],['refund-two',300]])
    refunds[id]={refund_id:id,order_id:order.id,amount_paise:amount,pre_tax_paise:amount,
      refund_time:'2026-10-13T01:00:00Z',is_full:false,status:'pending'};
  check('first partial refund',await reportExternalRefundEvent('refund-one')==='reported'
    && api.current.currentPreTaxAmount.priceMicros==='8000000');
  check('second partial refund uses prior reported amount',await reportExternalRefundEvent('refund-two')==='reported'
    && api.current.currentPreTaxAmount.priceMicros==='5000000' && api.partialCalls.length===2);
  if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
