const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
function load(file, mocks, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, AbortController,
    setTimeout, clearTimeout, process: { env: {} },
    require: id => { assert.ok(id in mocks, `Unexpected import: ${id}`); return mocks[id]; }, ...extra });
  return mod.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  let mode = 'error', signal, timer;
  const maintenance = load('src/services/maintenanceService.ts', {
    '../config/supabase': { supabase: { rpc: name => {
      assert.equal(name, 'get_maintenance_mode');
      return { abortSignal: s => { signal = s; if (mode === 'hang') return new Promise(() => {});
        if (mode === 'throw') throw new Error('offline');
        return Promise.resolve(mode === 'error' ? { error: {} } : { data: mode }); } };
    } } },
  }, { setTimeout: (fn, ms) => { assert.equal(ms, 6000); timer = fn; return 1; }, clearTimeout: () => {} });
  for (mode of [null, 'true', 'error', 'throw']) assert.equal(await maintenance.checkMaintenanceMode(), false);
  mode = 'hang'; let pending = maintenance.checkMaintenanceMode(); timer();
  assert.equal(await pending, false); assert.equal(signal.aborted, true);
  mode = true;
  assert.equal(await maintenance.checkMaintenanceMode(), true);
  for (mode of [null, 'true', 'error', 'throw']) assert.equal(await maintenance.checkMaintenanceMode(), true);
  mode = 'hang'; pending = maintenance.checkMaintenanceMode(); timer();
  assert.equal(await pending, true); assert.equal(signal.aborted, true);
  mode = false; assert.equal(await maintenance.checkMaintenanceMode(), false);
  mode = 'error'; assert.equal(await maintenance.checkMaintenanceMode(), false); // confirmed false also survives errors

  // Exercise launch/resume/retry hook and listener cleanup with a small hook harness.
  let states = [], cursor = 0, effect, resume, removed = false, reads = 0;
  const hook = load('src/hooks/useMaintenanceMode.ts', {
    react: { useState: initial => { const i = cursor++; states[i] = initial; return [initial, v => { states[i] = v; }]; },
      useRef: current => ({ current }), useCallback: fn => fn, useEffect: fn => { effect = fn; } },
    'react-native': { AppState: { addEventListener: (_, fn) => { resume = fn; return { remove: () => { removed = true; } }; } } },
    '../services/maintenanceService': { checkMaintenanceMode: async () => { reads++; return maintenance.checkMaintenanceMode(); } },
  }).default();
  mode = true; const cleanup = effect(); await tick(); assert.equal(states[0], true);
  mode = 'error'; await hook.retry(); assert.equal(states[0], true, 'fetch error must not reopen confirmed maintenance');
  mode = 'hang'; pending = hook.retry(); timer(); await pending; assert.equal(states[0], true);
  mode = false; await hook.retry(); assert.equal(states[0], false);
  mode = true; resume('active'); await tick(); assert.equal(states[0], true);
  resume('background'); assert.equal(reads, 5); cleanup(); assert.equal(removed, true);
  console.log('PASS MOB-01 initial fail-open, confirmed true/false retained on malformed/error/timeout, successful false reopens, launch/resume and cleanup');

  for (const id of ['com.medveda.app', 'com.ayurpulse.app', 'in.medveda.app', 'custom.app']) {
    for (const prefix of ['id=', 'hl=en&id=']) {
      const url = `https://play.google.com/store/apps/details?${prefix}${id}`;
      const config = load('src/services/appConfigService.ts', {
        'expo-application': { nativeApplicationVersion: '1.0.0' },
        '../config/supabase': { supabase: { from: () => ({ select: () => ({ in: async () => ({ data: [
          { key: 'store_url', value: url }, { key: 'min_app_version', value: '2.0.0' },
        ] }) }) }) } },
        '../utils/version': { parseVersion: () => true, compareVersions: () => -1 }, '../utils/logger': { logDebug() {} },
      });
      const result = await config.checkForRequiredUpdate();
      assert.equal(result.required, true);
      assert.equal(result.storeUrl, id.startsWith('com.') ? config.DEFAULT_STORE_URL : url);
    }
  }
  console.log('PASS MOB-02 runtime correction of both stale IDs; valid and custom URLs preserved');
})().catch(error => { console.error(error); process.exitCode = 1; });
