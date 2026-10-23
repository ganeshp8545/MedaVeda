const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
function load(file, mocks, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, AbortController, setTimeout, clearTimeout,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.invalid' } },
    require: id => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; }, ...extra });
  return mod.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const effects = []; let restored = 0, auth, app, unsubscribed = 0;
  const noop = () => {};
  const mocks = {
    react: { useEffect: effect => effects.push(effect), useState: initial => [initial, noop], useCallback: fn => fn }, 'react/jsx-runtime': { jsx: noop, jsxs: noop },
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: (_event, fn) => { app = fn; return { remove: () => unsubscribed++ }; } } },
    'expo-status-bar': {}, 'react-native-safe-area-context': {}, './src/navigation/AppNavigator': {}, './src/screens/update/UpdateRequiredScreen': {},
    './src/screens/maintenance/MaintenanceScreen': {},
    './src/hooks/useMaintenanceMode': { __esModule: true, default: () => ({ enabled: false }) },
    './src/hooks/useForceUpdate': { __esModule: true, default: () => ({ required: false }) },
    './src/config/database': { initDatabase: noop }, './src/utils/downloadManager': { recoverInterruptedDownloads: noop, removeLegacyOfflineQuizzes: async () => {} },
    './src/services/syncEngine': { startSyncEngine: noop, stopSyncEngine: noop },
    './src/services/pushNotifications': { registerForPushNotifications: noop }, './src/services/authState': { getCurrentUser: noop },
    './src/config/supabase': { supabase: { auth: { onAuthStateChange: fn => { auth = fn; return { data: { subscription: { unsubscribe: () => unsubscribed++ } } }; } } } },
    './src/services/playBillingService': { restorePlayPurchases: async () => { restored++; } }, './src/utils/logger': { logError: noop },
    './src/config/paymentProvider': { paymentProvider: 'play' },
  };
  load('App.tsx', mocks).default();
  const cleanup = effects.map(effect => effect());
  assert.equal(restored, 1); auth('SIGNED_IN'); auth('INITIAL_SESSION'); app('active');
  auth('TOKEN_REFRESHED'); app('background'); assert.equal(restored, 4);
  cleanup.forEach(fn => fn?.()); assert.equal(unsubscribed, 2);
  console.log('PASS App launch, sign-in, initial session and resume invoke restore; unrelated events do not; listeners cleaned up');

  let user = 'buyer', orderStatus = 'created', available = [], update, errorListener, requests = 0, queries = 0, network;
  let deadline, requestSignal, timersCleared = 0;
  const store = new Map(); const events = [];
  const session = () => ({ data: { session: user ? { user: { id: user }, access_token: 'fixture' } : null } });
  const service = load('src/services/playBillingService.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async k => store.get(k), setItem: async (k,v) => store.set(k,v), removeItem: async k => store.delete(k) } },
    'react-native': { Platform: { OS: 'android' } }, 'js-sha256': { sha256: x => `hash-${x}` },
    '../config/supabase': { supabase: { auth: { getSession: async () => session() } } },
    '../repositories/ordersRepository': { getOrdersByUser: async () => [{ id: 'order', status: orderStatus, provider: 'play', playSku: 'sku', productId: 'product' }] },
    './playOfferSelection': {}, 'expo-iap': {
      purchaseUpdatedListener: fn => { update = fn; return { remove: noop }; },
      purchaseErrorListener: fn => { errorListener = fn; return { remove: noop }; },
      initConnection: async () => true, getAvailablePurchases: async () => { queries++; return available; }, requestPurchase: async () => {},
    },
  }, { setTimeout: (fn, ms) => { assert.equal(ms, 15000); deadline = fn; return 1; },
    clearTimeout: () => { timersCleared++; },
    fetch: async (_url, options) => { requestSignal = options.signal; requests++; return network ? network() : { ok: true, json: async () => ({ success: true }) }; } });
  service.subscribePlayBilling(event => events.push(event));
  const purchase = { platform: 'android', productId: 'sku', purchaseToken: 'synthetic-token', purchaseState: 'purchased',
    obfuscatedAccountIdAndroid: 'hash-buyer', obfuscatedProfileIdAndroid: 'hash-order' };
  available = [purchase];
  const results = await Promise.all([service.restorePlayPurchases(), service.restorePlayPurchases()]);
  assert.equal(queries, 1); assert.equal(requests, 1); assert.equal(results[0].confirmed, 1);
  assert.equal(events[0].type, 'success'); // no local attempt: reconstructed from server order after process death
  let finish; network = () => new Promise(resolve => { finish = resolve; });
  update(purchase); update(purchase); await tick(); assert.equal(requests, 2);
  user = 'other'; finish({ ok: true, json: async () => ({ success: true }) }); await tick();
  assert.equal(events.length, 1); await service.restorePlayPurchases(); assert.equal(requests, 2);
  user = null; await service.restorePlayPurchases(); assert.equal(requests, 2);
  user = 'buyer'; network = async () => { throw new Error('offline'); };
  assert.equal((await service.restorePlayPurchases()).pending, 1);
  assert.equal(events.at(-1).type, 'pending');
  network = undefined; available = [{ ...purchase, purchaseState: 'pending' }];
  assert.equal((await service.restorePlayPurchases()).pending, 1); assert.equal(requests, 3);
  available = [{ ...purchase, purchaseState: 'cancelled' }]; await service.restorePlayPurchases(); assert.equal(requests, 3);
  available = []; await service.restorePlayPurchases(); assert.equal(requests, 3); // consumed receipt: no regrant
  await service.startPlayPurchase({ userId: 'buyer', internalOrderId: 'order', playSku: 'sku', productId: 'product', productTitle: 'Notes' }, 'offer');
  errorListener({ code: 'user-cancelled' }); await tick(); assert.equal(events.at(-1).type, 'cancel');
  network = async () => ({ ok: false, status: 400, json: async () => ({ error: 'price_tier_failed' }) });
  await assert.rejects(service.createPlayOrder('product'), /unavailable.*support/);
  network = async () => ({ ok: false, status: 400, json: async () => ({ error: 'price_tier_pending' }) });
  await assert.rejects(service.createPlayOrder('product'), /being prepared/);
  network = undefined; available = [purchase]; orderStatus = 'cancelled';
  assert.equal((await service.recheckPlayOrder('order')).success, true);
  available = []; assert.equal((await service.recheckPlayOrder('order')).pending, false);
  orderStatus = 'refunded'; assert.match((await service.recheckPlayOrder('order')).message, /refunded/);
  orderStatus = 'created'; available = [purchase];
  const attempt = { userId: 'buyer', internalOrderId: 'order', playSku: 'sku', productId: 'product', productTitle: 'Notes' };
  await service.startPlayPurchase(attempt, 'offer');
  for (const stallBody of [false, true]) {
    network = () => stallBody ? Promise.resolve({ ok: true, json: () => new Promise(() => {}) }) : new Promise(() => {});
    const restoring = service.restorePlayPurchases(); await tick(); deadline();
    const timedOut = await restoring;
    assert.equal(timedOut.pending, 1); assert.equal(timedOut.failed, 0);
    assert.equal(requestSignal.aborted, true); assert.equal(events.at(-1).type, 'pending');
    assert.ok(store.has('medveda:play-attempt:buyer'));
    const checking = service.recheckPlayOrder('order'); await tick(); deadline();
    assert.equal((await checking).pending, true);
  }
  const creating = service.createPlayOrder('product'); await tick(); deadline();
  await assert.rejects(creating, /timed out/); // no Google payment has started
  const attaching = service.attachExternalToken(attempt, 'fixture'); await tick(); deadline();
  await assert.rejects(attaching, /timed out/);
  network = undefined;
  assert.equal((await service.restorePlayPurchases()).confirmed, 1);
  assert.equal(store.has('medveda:play-attempt:buyer'), false);
  assert.ok(timersCleared > 0);
  console.log('PASS API-01 stalled fetch/body abort, pending verification/recheck, retained attempt and successful recovery; create/attach deadlines');
  console.log('PASS cancelled local order can verify delayed Google purchase; refunded orders stay terminal');
  console.log('PASS process-death recovery, coalesced restores, duplicate callbacks, account switch, interrupted network, pending, cancelled and consumed receipts');
})().catch(error => { console.error(error); process.exitCode = 1; });
