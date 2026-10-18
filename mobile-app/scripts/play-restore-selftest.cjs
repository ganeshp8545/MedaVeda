const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/services/playBillingService.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
const purchases = [
  { platform: 'android', productId: 'notes-tier', purchaseToken: 'unresolved-token',
    purchaseState: 'purchased', obfuscatedAccountIdAndroid: 'hash-buyer',
    obfuscatedProfileIdAndroid: 'hash-unresolved-order' },
  { platform: 'android', productId: 'notes-tier', purchaseToken: 'valid-token',
    purchaseState: 'purchased', obfuscatedAccountIdAndroid: 'hash-buyer',
    obfuscatedProfileIdAndroid: 'hash-valid-order' },
];
let orderLookups = 0;
const verifiedTokens = [];
const mocks = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: {
    getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
  } },
  'react-native': { Platform: { OS: 'android' } },
  'js-sha256': { sha256: value => `hash-${value}` },
  '../config/supabase': { supabase: { auth: { getSession: async () => ({
    data: { session: { user: { id: 'buyer' }, access_token: 'mock-access-token' } },
  }) } } },
  '../repositories/ordersRepository': { getOrdersByUser: async () => {
    orderLookups++;
    if (orderLookups === 1) throw new Error('Temporary order lookup failure');
    return [{ id: 'valid-order', provider: 'play', playSku: 'notes-tier',
      productId: 'notes-product', productTitle: 'Notes' }];
  } },
  './playOfferSelection': { selectStandardPlayOffer: () => 'mock-offer-token' },
  'expo-iap': {
    purchaseUpdatedListener: () => ({ remove() {} }),
    purchaseErrorListener: () => ({ remove() {} }),
    initConnection: async () => true,
    getAvailablePurchases: async () => purchases,
  },
};
vm.runInNewContext(code, {
  module: moduleRef, exports: moduleRef.exports,
  require: id => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected import: ${id}`);
    return mocks[id];
  },
  process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid' } },
  fetch: async (_url, options) => {
    const body = JSON.parse(options.body);
    verifiedTokens.push(body.purchaseToken);
    return { ok: true, json: async () => ({ success: true, internalOrderId: body.internalOrderId }) };
  },
  console,
}, { filename: 'playBillingService.ts' });

(async () => {
  const events = [];
  moduleRef.exports.subscribePlayBilling(event => events.push(event));
  await moduleRef.exports.restorePlayPurchases();
  assert.equal(orderLookups, 2);
  assert.deepEqual(verifiedTokens, ['valid-token']);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'success');
  assert.equal(events[0].attempt.internalOrderId, 'valid-order');
  console.log('PASS restore continues after one receipt lookup failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
