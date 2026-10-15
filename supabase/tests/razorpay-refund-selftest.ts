import { refundCapturedPayment } from '../functions/_shared/razorpay.ts';
const savedFetch=globalThis.fetch;
const saved=Object.fromEntries(['APP_ENV','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET'].map(key=>[key,Deno.env.get(key)]));
Deno.env.set('APP_ENV','staging');
Deno.env.set('RAZORPAY_KEY_ID','rzp_test_mock');
Deno.env.set('RAZORPAY_KEY_SECRET','mock-secret');
let posted=0,created=false;
const refund={id:'rfnd_mock123',payment_id:'pay_mock123',amount:4900,currency:'INR',status:'processed',
 created_at:Math.floor(Date.now()/1000),notes:{medveda_refund_request_id:'medveda_comp_stable'}};
globalThis.fetch=async (input,init)=>{
 const url=String(input);
 if(url.includes('/refunds?'))return Response.json({items:created?[refund]:[]});
 if(url.endsWith('/payments/pay_mock123'))return Response.json({id:'pay_mock123',amount:4900,
   amount_refunded:0,currency:'INR',status:'captured'});
 if(url.endsWith('/payments/pay_mock123/refund')){
   posted++;
   const body=JSON.parse(String(init?.body));
   if(body.notes.medveda_refund_request_id!=='medveda_comp_stable')throw Error('unstable refund marker');
   created=true;
   throw Error('mock response lost after Razorpay processed refund');
 }
 throw Error(`unexpected mock path ${url}`);
};
try {
 let ambiguous=false;
 try {await refundCapturedPayment('pay_mock123',4900,'medveda_comp_stable');}
 catch {ambiguous=true;}
 const recovered=await refundCapturedPayment('pay_mock123',4900,'medveda_comp_stable');
 if(!ambiguous||recovered.id!==refund.id||posted!==1)
   throw Error('F03 ambiguous refund retry made a second POST or lost provider refund');
 console.log('PASS F03 ambiguous Razorpay refund response recovered by stable marker without second POST');
} finally {
 globalThis.fetch=savedFetch;
 for(const [key,value] of Object.entries(saved))if(value===undefined)Deno.env.delete(key);else Deno.env.set(key,value);
}
