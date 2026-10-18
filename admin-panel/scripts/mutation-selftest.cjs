// Exercise real service code and Supabase's singular-response error handling
// against a fake PostgREST transport. This is not a hosted RLS test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
let missing = true;
const client = createClient('https://example.invalid', 'local-test-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (_url, options) => {
    const headers = new Headers(options.headers);
    if (options.method === 'HEAD') return new Response(null, {status: 200, headers: {'content-range': '*/0'}});
    const singular = headers.get('accept')?.includes('application/vnd.pgrst.object+json');
    if (missing && singular) return new Response(JSON.stringify({code:'PGRST116',message:'Expected one row; zero rows returned'}), {status:406,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify(missing ? [] : singular ? {id:'fixture'} : [{id:'fixture'}]), {status:200,headers:{'content-type':'application/json'}});
  }},
});
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};
  vm.runInNewContext(code, {module,exports:module.exports,require:(name)=> {
    if (name === '../config/supabase') return {supabase:client};
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file),name+'.ts'));
    return require(name);
  }});
  cache.set(file,module.exports); return module.exports;
}
(async () => {
  for (const [service, calls] of [
    ['course', [['updateCourse','fixture',{}],['setCourseActive','fixture',false],['deleteCourse','fixture']]],
    ['year', [['updateYear','fixture',{}],['deleteYear','fixture']]],
    ['subject', [['updateSubject','fixture',{}],['deleteSubject','fixture']]],
    ['chapter', [['updateChapter','fixture',{}],['deleteChapter','fixture']]],
    ['product', [['updateProduct','fixture',{}],['deleteProduct','fixture']]],
    ['user', [['setUserBlocked','fixture',true]]],
  ]) {
    const api=load(path.resolve(__dirname,`../src/services/${service}Service.ts`));
    for (const [method,...args] of calls) {
      missing=true;
      await assert.rejects(()=>api[method](...args), error=>error.code==='PGRST116');
      missing=false;
      await api[method](...args);
      console.log(`PASS ${method}: zero-row rejection / one-row success`);
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
