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
  console, AbortController, setTimeout, clearTimeout,
}, { filename: 'playBillingService.ts' });

const tick = () => new Promise(resolve => setImmediate(resolve));
const attempt = { userId: 'buyer', internalOrderId: 'valid-order', playSku: 'notes-tier',
  productId: 'notes-product', productTitle: 'Notes' };
const attemptKey = 'medveda:play-attempt:buyer';
function recoveryFixture(store = new Map([[attemptKey, JSON.stringify(attempt)]])) {
  const timers = new Map(), events = [], tokens = [];
  let timerId = 0, lookups = 0, connections = 0, removed = 0, update;
  let lookup = async () => [purchases[1]], initialize = async () => true;
  let network = async () => ({ ok: true, json: async () => ({ success: true }) });
  let session = async () => ({ data: { session: { user: { id: 'buyer' }, access_token: 'fixture' } } });
  let read = async key => store.get(key) ?? null;
  let orders = async () => [{ ...attempt, id: attempt.internalOrderId, provider: 'play' }];
  const instance = { exports: {} };
  const dependencies = {
    ...mocks,
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: key => read(key), setItem: async (key, value) => store.set(key, value), removeItem: async key => store.delete(key),
    } },
    '../config/supabase': { supabase: { auth: { getSession: () => session() } } },
    '../repositories/ordersRepository': { getOrdersByUser: () => orders() },
    'expo-iap': {
      purchaseUpdatedListener: fn => { update = fn; return { remove() { removed++; } }; },
      purchaseErrorListener: () => ({ remove() { removed++; } }),
      initConnection: () => { connections++; return initialize(); },
      getAvailablePurchases: () => { lookups++; return lookup(); },
    },
  };
  vm.runInNewContext(code, {
    module: instance, exports: instance.exports, require: id => { assert.ok(id in dependencies, id); return dependencies[id]; },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.invalid' } },
    console, AbortController,
    setTimeout: (fn, ms) => { assert.equal(ms, 15000); timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: async (_url, options) => { tokens.push(JSON.parse(options.body).purchaseToken); return network(); },
  });
  instance.exports.subscribePlayBilling(event => events.push(event));
  return { service: instance.exports, store, events, tokens,
    setLookup: fn => { lookup = fn; }, setInitialize: fn => { initialize = fn; }, setNetwork: fn => { network = fn; },
    setSession: fn => { session = fn; }, setRead: fn => { read = fn; }, setOrders: fn => { orders = fn; },
    update: purchase => update(purchase),
    expire: () => { assert.ok(timers.size, 'a stalled wait must have a deadline'); for (const fn of [...timers.values()]) fn(); },
    counts: () => ({ lookups, connections, removed, timers: timers.size }),
  };
}

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

  let f = recoveryFixture(), finish;
  f.setLookup(() => new Promise(resolve => { finish = resolve; }));
  const stalled = f.service.restorePlayPurchases(); await tick(); f.expire();
  assert.equal((await stalled).pending, 1);
  assert.ok(f.store.has(attemptKey));
  f.setLookup(async () => [purchases[1]]);
  assert.equal((await f.service.restorePlayPurchases()).confirmed, 1);
  assert.equal(f.counts().lookups, 2, 'later restore must start a fresh native lookup');
  finish([purchases[1]]); await tick();
  assert.deepEqual(f.tokens, ['valid-token'], 'late timed-out lookup must not verify again');
  assert.equal(f.counts().timers, 0);
  console.log('PASS stalled native lookup times out pending, cache clears, fresh lookup completes, late result ignored');

  f = recoveryFixture(); f.setInitialize(() => new Promise(() => {}));
  let pending = f.service.restorePlayPurchases(); await tick(); f.expire();
  assert.equal((await pending).pending, 1); assert.equal(f.counts().removed, 2);
  f.setInitialize(async () => true);
  assert.equal((await f.service.restorePlayPurchases()).confirmed, 1);
  assert.equal(f.counts().connections, 2, 'timed-out native connection must be retried');
  assert.equal(f.counts().timers, 0);
  console.log('PASS native connection timeout releases connection/restore caches and listeners; retry succeeds');

  f = recoveryFixture(); f.setLookup(async () => { throw new Error('native disconnected'); });
  assert.equal((await f.service.restorePlayPurchases()).pending, 1);
  f.setLookup(async () => [purchases[1]]);
  assert.equal((await f.service.restorePlayPurchases()).confirmed, 1);
  console.log('PASS native error preserves pending state and releases cached restore');

  for (const stall of ['session', 'storage', 'orders']) {
    f = recoveryFixture();
    if (stall === 'session') f.setSession(() => new Promise(() => {}));
    if (stall === 'storage') f.setRead(() => new Promise(() => {}));
    if (stall === 'orders') { f.store.clear(); f.setOrders(() => new Promise(() => {})); }
    pending = f.service.restorePlayPurchases(); await tick(); f.expire();
    assert.equal((await pending).pending, 1, `${stall} wait must be bounded and recoverable`);
    f.setSession(async () => ({ data: { session: { user: { id: 'buyer' }, access_token: 'fixture' } } }));
    f.setRead(async key => f.store.get(key) ?? null);
    f.setOrders(async () => [{ ...attempt, id: attempt.internalOrderId, provider: 'play' }]);
    assert.equal((await f.service.restorePlayPurchases()).confirmed, 1);
    assert.equal(f.counts().timers, 0);
  }
  console.log('PASS stalled restore session/storage/order waits release pending recovery for retry');

  // Fresh VM means fresh module state: no connection, token lock or restore cache.
  // Persisted attempts and the unconsumed Play receipt survive process death.
  f = recoveryFixture(); f.setNetwork(() => new Promise(() => {}));
  pending = f.service.restorePlayPurchases(); await tick(); f.expire();
  assert.equal((await pending).pending, 1);
  assert.deepEqual(f.tokens, ['valid-token']); assert.ok(f.store.has(attemptKey));
  const fresh = recoveryFixture(f.store);
  const restores = [fresh.service.restorePlayPurchases(), fresh.service.restorePlayPurchases()];
  await tick();
  const results = await Promise.all(restores);
  assert.equal(results[0].confirmed, 1); assert.equal(results[1].confirmed, 1);
  assert.deepEqual(fresh.tokens, ['valid-token'], 'same token verified exactly once in fresh recovery pass');
  assert.equal(fresh.counts().lookups, 1); assert.equal(fresh.events.length, 1);
  assert.equal(fresh.events[0].type, 'success'); assert.equal(fresh.store.has(attemptKey), false);
  fresh.setLookup(async () => []); await fresh.service.restorePlayPurchases();
  assert.deepEqual(fresh.tokens, ['valid-token'], 'consumed token must not be verified again');
  assert.equal(fresh.counts().timers, 0);
  console.log('PASS verification timeout -> fresh service instance -> same token verified once, coalesced restore, persisted attempt cleared');
})().catch(error => { console.error(error); process.exitCode = 1; });
