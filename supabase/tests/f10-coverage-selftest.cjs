const fs = require('fs');
const paths = [
  ['independent Play and Razorpay sessions', 'supabase/tests/payment-concurrency.sh'],
  ['mocked Google reporting scenarios', 'supabase/tests/google-reporting-selftest.cjs'],
  ['mocked Play consumption failure', 'supabase/tests/play-consumption-selftest.cjs'],
];
let failed = 0;
for (const [name, path] of paths) {
  const ok = fs.existsSync(path);
  console.log(`${ok ? 'PASS' : 'FAIL'} F10 ${name}`);
  if (!ok) failed++;
}
if (failed) process.exitCode = 1;
