import { getRazorpayKeyId } from '../functions/_shared/razorpay.ts';
const original = Object.fromEntries(['APP_ENV','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','ALLOW_TEST_MODE'].map(k => [k,Deno.env.get(k)]));
function check(name: string, environment: string | undefined, allowed: boolean) {
  if (environment === undefined) Deno.env.delete('APP_ENV'); else Deno.env.set('APP_ENV', environment);
  Deno.env.set('RAZORPAY_KEY_ID','rzp_test_example');
  Deno.env.set('RAZORPAY_KEY_SECRET','dummy');
  Deno.env.set('ALLOW_TEST_MODE','true');
  let succeeded = false;
  try { getRazorpayKeyId(); succeeded = true; } catch { /* expected when blocked */ }
  if (succeeded !== allowed) throw new Error(`${name}: test key ${succeeded ? 'accepted' : 'rejected'}`);
  console.log('PASS',name);
}
try {
  check('F07 production rejects test key with ALLOW_TEST_MODE=true','production',false);
  check('F07 unset marker rejects test key with ALLOW_TEST_MODE=true',undefined,false);
  check('F07 staging accepts intentional test key','staging',true);
  Deno.env.set('APP_ENV','production');
  Deno.env.set('RAZORPAY_KEY_ID','rzp_live_example');
  if (getRazorpayKeyId()!=='rzp_live_example') throw new Error('F07 production live key rejected');
  console.log('PASS F07 production accepts live key');
} finally {
  for (const [key,value] of Object.entries(original)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key,value);
}
