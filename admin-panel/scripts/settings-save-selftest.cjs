const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../src/services/settingsService.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let cfgError, rowError, missing = false, disconnected = false, writes = [];
const mocks = {
  '../config/supabase': { supabase: { from: table => ({
    upsert: async () => { writes.push(table); return { error: cfgError }; },
    update: () => ({ eq: () => ({ select: () => ({ single: async () => {
      writes.push(table); if (disconnected) throw new Error('offline');
      return { data: missing ? null : { id: 1 }, error: rowError };
    } }) }) }),
  }) } },
  '../utils/caseConvert': { toSnakeCase: x => x },
  '../utils/appVersion': { validateUpdateGate: v => v === 'bad' ? 'Invalid version' : null },
};
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, require: id => mocks[id] });
const { updateSettings, PartialSettingsSaveError } = mod.exports;
(async () => {
  const settings = { minAppVersion: '1.0.0', storeUrl: 'https://fixture.invalid', maintenanceMode: true };
  await updateSettings(settings); assert.deepEqual(writes, ['app_config', 'app_settings']);
  writes = []; await assert.rejects(updateSettings({ ...settings, minAppVersion: 'bad' }), /Invalid/);
  assert.equal(writes.length, 0);
  cfgError = new Error('config failure');
  await assert.rejects(updateSettings(settings), /config failure/); assert.deepEqual(writes, ['app_config']);
  cfgError = null;
  for (const scenario of ['error', 'missing', 'disconnect']) {
    writes = []; rowError = scenario === 'error' ? {} : null; missing = scenario === 'missing'; disconnected = scenario === 'disconnect';
    await assert.rejects(updateSettings(settings), e => e instanceof PartialSettingsSaveError &&
      /update settings were saved/.test(e.message) && /Maintenance Mode.*could not be confirmed/.test(e.message));
    assert.deepEqual(writes, ['app_config', 'app_settings']);
  }
  const page = fs.readFileSync(`${__dirname}/../src/pages/Settings.tsx`, 'utf8');
  assert.match(page, /err instanceof PartialSettingsSaveError\s*\? err.message/);
  console.log('PASS ADM-01 full success, pre-write validation, config failure, partial save, zero-row update, disconnect and displayed partial result');
})().catch(error => { console.error(error); process.exitCode = 1; });
