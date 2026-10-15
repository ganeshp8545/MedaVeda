const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '../src');
const rows = ['success', 'refunded', 'chargeback', 'partial_refund'].map((status, i) => ({
  id: `purchase-${i}`, user_id: 'buyer', status, scope: 'chapter', chapter_id: `chapter-${i}`,
}));
rows.push({ id: 'purchase-partial-kept', user_id: 'buyer', status: 'success',
  refundStatus: 'partial', scope: 'chapter', chapter_id: 'chapter-partial-kept' });
let statusFilter;
const supabase = { from(table) {
  if (table !== 'purchases') throw new Error(table);
  const query = { select() { return this; }, eq(key, value) {
    if (key === 'status') statusFilter = value;
    return this;
  }, then(resolve) {
    resolve({ data: statusFilter ? rows.filter(row => row.status === statusFilter) : rows, error: null });
  } };
  return query;
} };
function load(name, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: id => mocks[id], console }, { filename: name });
  return module.exports;
}
const repository = load('repositories/purchasesRepository.ts', {
  '../config/supabase': { supabase }, '../utils/caseConvert': { toCamelCase: row => ({
    ...row, chapterId: row.chapter_id,
  }) },
});
const service = load('services/purchasesService.ts', {
  './authState': { getCurrentUser: () => ({ id: 'buyer' }) },
  '../repositories/purchasesRepository': repository,
});
(async () => {
  const scopes = await service.fetchOwnedScopes();
  const checks = [
    ['repository filters success', statusFilter === 'success'],
    ['only successful scopes returned', scopes.length === 2 && scopes.every(scope => scope.status === 'success')],
    ['partial refund with successful purchase stays owned', service.isChapterUnlocked(scopes,
      { id: 'chapter-partial-kept', subjectId: 's', yearId: 'y' })],
    ...['refunded', 'chargeback', 'partial_refund'].map((status, index) => {
      const revoked = { ...rows[index + 1], chapterId: `chapter-${index + 1}` };
      const chapter = { id: revoked.chapterId, subjectId: 's', yearId: 'y' };
      return [`${status} scope denied by helpers`,
        !service.isChapterUnlocked([revoked], chapter) &&
        !service.isProductOwned([revoked], { scope: 'chapter', chapterId: chapter.id })];
    }),
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
})().catch(err => { console.error(err); process.exitCode = 1; });
