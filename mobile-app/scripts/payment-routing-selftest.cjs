const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('../node_modules/typescript');
function load(file, mocks, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, module: mod, console,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.invalid' } },
    require: name => { assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name]; }, ...extra });
  return mod.exports;
}
(async () => {
  for (const os of ['android', 'web']) for (const configured of ['play', 'razorpay', 'disabled', undefined]) {
    const actual = load('src/config/paymentProvider.ts', {
      'expo-constants': { __esModule: true, default: { expoConfig: { extra: { medvedaPaymentProvider: configured } } } },
      'react-native': { Platform: { OS: os } },
    }).paymentProvider;
    assert.equal(actual, configured === 'disabled' ? 'disabled' :
      os === 'android' ? 'play' : configured === 'razorpay' ? 'razorpay' : 'play');
  }
  let navigations = 0, notices = 0;
  const disabledPurchase = load('src/hooks/usePurchase.ts', {
    '@react-navigation/native': { useNavigation: () => ({ navigate: () => { navigations++; } }) },
    'react-native': { Platform: { OS: 'android' }, Alert: { alert: () => { notices++; } } },
    '../config/paymentProvider': { paymentProvider: 'disabled' },
  }).default();
  disabledPurchase.buy({ id: 'fixture-product', title: 'Fixture' });
  assert.equal(navigations, 0);
  assert.equal(notices, 1);
  let sessions = 0, requests = 0;
  for (const provider of ['play', 'razorpay']) {
    const service = load('src/services/paymentService.ts', {
      '../config/supabase': { supabase: { auth: { getSession: async () => {
        sessions++; return { data: { session: { access_token: 'synthetic' } } };
      } } } },
      'react-native': { Platform: { OS: 'android' } },
      'expo-application': { nativeApplicationVersion: '1.2.0' },
      '../config/paymentProvider': { paymentProvider: provider },
    }, { fetch: async () => { requests++; return { ok: true, json: async () => ({ internalOrderId: 'fixture' }) }; } });
    if (provider === 'play') {
      await assert.rejects(service.purchaseProduct('notes'), /Google Play Billing/);
      assert.equal(sessions, 0); assert.equal(requests, 0);
    } else {
      assert.equal((await service.purchaseProduct('notes')).internalOrderId, 'fixture');
      assert.equal(requests, 1);
    }
    const screen = load('src/screens/payment/PaymentCheckoutScreen.tsx', {
      react: {},
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
      'react-native': { StyleSheet: { create: x => x }, View: 'View', Text: 'Text' },
      'react-native-webview': {}, '@react-navigation/native': {},
      '../../theme/colors': { COLORS: {} }, '../../theme/fonts': { FONT: {} }, '../../theme/spacing': { SPACING: {} },
      './checkoutHtmlTemplate': {}, '../../services/paymentService': {}, '../../services/ordersService': {},
      './checkoutNavigation': {}, '../../config/paymentProvider': { paymentProvider: provider },
    }).default();
    if (provider === 'play') {
      assert.equal(screen.type, 'View');
      assert.match(screen.props.children.props.children, /Google Play Billing/);
    } else assert.equal(screen.type.name, 'RazorpayCheckoutScreen');
  }
  console.log('PASS staging disables payment navigation; Play and Razorpay routing guards preserved');
})().catch(error => { console.error(error); process.exitCode = 1; });
