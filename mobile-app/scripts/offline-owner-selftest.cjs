const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('../node_modules/typescript');
const store = new Map([['medveda:offline-owner','first']]);
let authChanged, failPurge = true;
const mocks = {
  '../config/supabase':{supabase:{auth:{getSession:async()=>({data:{session:null}}),
    onAuthStateChange:fn=>{authChanged=fn;}, signOut:async()=>{}},
    from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{blocked:false}})})}},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async k=>store.get(k),setItem:async(k,v)=>store.set(k,v),removeItem:async k=>store.delete(k)}},
  './pushNotifications':{registerForPushNotifications(){},unregisterCurrentDeviceToken:async()=>{}},
  '../utils/logger':{logDebug(){}},
  '../utils/downloadManager':{clearAllDownloads:async()=>{if(failPurge)throw new Error('simulated storage failure');}},
};
const source=fs.readFileSync(process.env.MEDVEDA_TEST_OWNER_SOURCE || path.join(__dirname,'../src/services/authState.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports,require:id=>{assert.ok(id in mocks,id);return mocks[id];}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  await tick();authChanged('SIGNED_IN',{user:{id:'second'}});await tick();
  assert.equal(store.get('medveda:offline-owner'),'first','Failed purge must not transfer ownership');
  await mod.exports.performSignOut();assert.equal(store.get('medveda:offline-owner'),'first','Failed sign-out purge must retain owner boundary');
  failPurge=false;authChanged('SIGNED_IN',{user:{id:'second'}});await tick();
  assert.equal(store.get('medveda:offline-owner'),'second');
  await mod.exports.performSignOut();assert.equal(store.has('medveda:offline-owner'),false);
  // A valid timestamp for another owner must never reach the server or grant access.
  let user = { id: 'second' }, checks = 0, records = 0;
  store.set('medveda:offline-owner', 'first');
  const accessMocks = {
    '@react-native-async-storage/async-storage': mocks['@react-native-async-storage/async-storage'],
    './authState': { getCurrentUser: () => user },
    './secureNotesService': { NoteAccessError: class extends Error {}, getSecureNoteUrl: async () => { checks++; user = { id: 'third' }; } },
    './offlineNoteVerification': { hasRecentNoteVerification: async () => true, recordNoteVerification: async () => { records++; }, clearNoteVerification: async () => {} },
    '../utils/downloadManager': { cancelDownload: async () => {} },
  };
  const accessCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/offlineNoteAccess.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const accessModule = { exports: {} };
  vm.runInNewContext(accessCode, { module: accessModule, exports: accessModule.exports, require: id => { assert.ok(id in accessMocks, id); return accessMocks[id]; } });
  assert.equal(await accessModule.exports.mayOpenOfflineNote('note'), false); assert.equal(checks, 0);
  user = { id: 'first' };
  assert.equal(await accessModule.exports.mayOpenOfflineNote('note'), false); assert.equal(records, 0);
  user = null; assert.equal(await accessModule.exports.mayOpenOfflineNote('note'), false);
  console.log('PASS verification remains owner-bound; account change during check cannot record access');
  console.log('PASS failed cleanup retains original owner through account switch/logout; successful cleanup allows new ownership');
})().catch(error=>{console.error(error);process.exitCode=1;});
