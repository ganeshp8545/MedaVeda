const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/utils/filters.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports });
const { fetchAllPages } = moduleRef.exports;

(async () => {
  const fixtures = Array.from({ length: 1001 }, (_, index) => ({ id: index }));
  const ranges = [];
  const rows = await fetchAllPages(() => ({ range: async (start, end) => {
    ranges.push([start, end]);
    return { data: fixtures.slice(start, end + 1), error: null };
  } }));
  assert.equal(rows.length, 1001);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);

  await assert.rejects(fetchAllPages(() => ({ range: async (start) => ({
    data: start === 0 ? fixtures.slice(0, 500) : null,
    error: start === 0 ? null : new Error('page 2 denied'),
  }) })), /page 2 denied/);
  console.log('PASS admin pagination: 1001 rows and later-page errors');
})().catch((error) => { console.error(error); process.exitCode = 1; });
