const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto').webcrypto;
const ts = require('../../mobile-app/node_modules/typescript');
const transpile = source => ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const code = transpile(fs.readFileSync('supabase/functions/sync-play-catalog/index.ts','utf8'));
const baselineSource = fs.readFileSync('supabase/tests/fixtures/play-catalog-production-v2.ts.txt','utf8');
const release = JSON.parse(fs.readFileSync('docs/audit/evidence/play-403-release-20261019/manifest.json','utf8'));
assert.equal(require('node:crypto').createHash('sha256').update(baselineSource).digest('hex'),
  release.files.rollback['supabase/functions/sync-play-catalog/index.ts']);
const baseline = transpile(baselineSource);
const shared = {exports:{}};
vm.runInNewContext(transpile(fs.readFileSync('supabase/functions/_shared/googlePlay.ts','utf8')),
  {module:shared,exports:shared.exports,TextEncoder,crypto});
const {GoogleApiError} = shared.exports;
function fixture(status,operation='catalog.patch',old=false,finish='ok') {
  let handler; const calls=[], logs=[]; const secret='s'.repeat(40);
  const mocks={
    '../_shared/cors.ts':{jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status})},
    '../_shared/googlePlay.ts':{GoogleApiError},
    '../_shared/supabaseAdmin.ts':{supabaseAdmin:{rpc:async(name,args)=>{
      if(name==='fail_play_price_sync' && finish!=='ok') return {data:false,error:finish==='error'?{code:'fixture'}:null};
      calls.push({name,args});return {data:name==='claim_play_price_sync'?[{price_inr:'49',candidate_sku:'fixture',purchase_option_id:'buy',lease_id:'lease'}]:true,error:null};
    }}},
    '../_shared/playCatalog.ts':{priceCents:()=>4900, getOneTimeProduct:async()=>{
      if(old && (operation==='oauth.token' || status===0)) throw new Error('Google OAuth returned '+status);
      throw new GoogleApiError(status,operation,'PERMISSION_DENIED',undefined,[{
        '@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'SERVICE_DISABLED',domain:'googleapis.com',
        metadata:{service:'androidpublisher.googleapis.com',consumer:'projects/123456789012',token:'TOKEN_SENTINEL'},
      }]);
    }},
  };
  const mod={exports:{}};
  vm.runInNewContext(old?baseline:code,{module:mod,exports:mod.exports,require:id=>mocks[id],Request,Response,
    console:{error:(...args)=>logs.push(args)}, Deno:{env:{get:()=>secret},serve:fn=>{handler=fn;}}});
  return {calls,logs,run:(auth,method='POST')=>handler(new Request('https://fixture.invalid',{method,headers:auth?{'x-play-catalog-cron-secret':secret}:{}}))};
}
(async()=>{
  for(const operation of ['catalog.patch','oauth.token']) for(const status of [0,400,401,403,404,408,409,429,500,503]) {
    const f=fixture(status,operation),old=fixture(status,operation,true);
    assert.equal((await f.run(false,'GET')).status,405);assert.equal(f.calls.length,0);
    assert.equal((await f.run(false)).status,401);assert.equal(f.calls.length,0);
    const result=await (await f.run(true)).json(), previous=await (await old.run(true)).json();
    const retry = [0,409,429,500,503].includes(status);
    assert.equal(result.status,retry?'retry':'failed');
    if (operation !== 'oauth.token' || retry) assert.equal(result.status,previous.status);
    const failed=f.calls.find(c=>c.name==='fail_play_price_sync');
    assert.equal(failed.args.p_retry,retry);
    assert.deepEqual(f.calls.map(c=>c.name),old.calls.map(c=>c.name));
    assert.match(failed.args.p_reason,new RegExp('operation='+operation));
    const log=JSON.parse(f.logs[0][1]);assert.equal(log.jobId,'49');assert.equal(log.leaseId,'lease');
    assert.equal(log.retryable,failed.args.p_retry);assert.equal(log.details[0].reason,'SERVICE_DISABLED');
    assert.equal(log.details[0].consumer,'projects/123456789012');
    assert.ok(!JSON.stringify(f.logs).includes('TOKEN_SENTINEL'));
  }
  console.log('PASS worker auth, safe logs, Publisher retry parity and terminal OAuth permission failures across 20 cases');
  for (const finish of ['lost', 'error']) {
    const f=fixture(403,'catalog.patch',false,finish);
    assert.equal((await f.run(true)).status,503);
  }
  console.log('PASS catalog failure persistence errors and expired leases return 503');
})().catch(error=>{console.error(error);process.exitCode=1;});
