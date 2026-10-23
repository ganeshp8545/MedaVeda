const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('../node_modules/typescript');
let now = 1_800_000_000_000;
class TestDate extends Date { static now() { return now; } }
function load(relative, mocks) {
  const source = fs.readFileSync(relative, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, Date: TestDate, require: id => {
    assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id];
  } });
  return mod.exports;
}
const schema = fs.readFileSync(path.join(__dirname, '../src/config/database.ts'), 'utf8')
  .match(/CREATE TABLE IF NOT EXISTS downloads \([\s\S]*?\n    \);/)[0];
function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(schema); sql.exec("ALTER TABLE downloads ADD COLUMN course_id TEXT DEFAULT ''");
  const db = { runSync: (q, args = []) => sql.prepare(q).run(...args),
    getFirstSync: (q, args = []) => sql.prepare(q).get(...args), getAllSync: (q, args = []) => sql.prepare(q).all(...args) };
  const storage = new Map([['medveda:offline-owner', 'buyer']]);
  const files = new Map();
  const calls = [];
  let user = { id: 'buyer' }, accessError, deleteError, refreshes = 0, transport = async () => ({ status: 200 }), header = 'JVBERi0=';
  class NoteAccessError extends Error { constructor(status) { super('access'); this.status = status; } }
  const secure = { NoteAccessError, getSecureNoteUrl: async () => { refreshes++; if (accessError) throw accessError; return `https://fixture.invalid/fresh-${refreshes}`; } };
  const mocks = {
    '../services/courseState': { getCourseYear: () => ({ courseId: 'bams' }) },
    '../services/authState': { getCurrentUser: () => user },
    '../services/secureNotesService': secure,
    '../config/database': { getDb: () => db, OFFLINE_DB_SUPPORTED: true },
    './logger': { logDebug() {} },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value),
      removeItem: async key => storage.delete(key), getAllKeys: async () => [...storage.keys()],
      multiRemove: async keys => keys.forEach(key => storage.delete(key)),
    } },
    'expo-file-system/legacy': {
      documentDirectory: 'file:///documents/', EncodingType: { Base64: 'base64' },
      getInfoAsync: async uri => ({ exists: files.has(uri), size: files.get(uri) ?? 0 }),
      makeDirectoryAsync: async uri => files.set(uri, 0),
      deleteAsync: async uri => { if (deleteError) throw deleteError; for (const key of files.keys()) if (key.startsWith(uri)) files.delete(key); },
      writeAsStringAsync: async (uri, value) => { files.set(uri, value); },
      readAsStringAsync: async () => header,
      DownloadResumable: class {
        constructor(url, uri, options, progress, resumeData) { Object.assign(this, { url, uri, options, progress, resumeData }); }
        async downloadAsync() { calls.push(this.url); const result = await transport(this); files.set(this.uri, 100); return { uri: this.uri, ...result }; }
        resumeAsync() { return this.downloadAsync(); }
        async cancelAsync() { this.cancelled = true; }
        async pauseAsync() { return { url: this.url, fileUri: this.uri, options: {}, resumeData: 'partial' }; }
      },
    },
  };
  const verification = load(path.join(__dirname, '../src/services/offlineNoteVerification.ts'), {
    '@react-native-async-storage/async-storage': mocks['@react-native-async-storage/async-storage'],
  });
  mocks['../services/offlineNoteVerification'] = verification;
  const manager = load(process.env.MEDVEDA_TEST_DOWNLOAD_SOURCE || path.join(__dirname, '../src/utils/downloadManager.ts'), mocks);
  const access = load(path.join(__dirname, '../src/services/offlineNoteAccess.ts'), {
    '@react-native-async-storage/async-storage': mocks['@react-native-async-storage/async-storage'],
    './authState': mocks['../services/authState'], './secureNotesService': secure,
    './offlineNoteVerification': verification, '../utils/downloadManager': manager,
  });
  return { manager, access, calls, files, storage, NoteAccessError,
    setUser: value => { user = value; }, setError: value => { accessError = value; },
    setDeleteError: value => { deleteError = value; },
    setTransport: value => { transport = value; }, setHeader: value => { header = value; }, close: () => sql.close() };
}
const request = { id: 'note-1', contentType: 'note', title: 'Note', sourceUrl: 'https://fixture.invalid/expired-120-seconds-ago',
  chapterId: 'c', chapterTitle: 'C', subjectId: 's', subjectTitle: 'S', yearId: 'y', yearTitle: 'Y' };
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  let f = fixture();
  await f.manager.enqueueDownload(request);
  assert.match(f.calls[0], /fresh-1$/);
  assert.equal(f.manager.getDownload(request.id).status, 'completed');
  await f.manager.retryDownload(request.id);
  assert.match(f.calls[1], /fresh-2$/);
  assert.match(f.manager.getDownload(request.id).sourceUrl, /fresh-2$/);
  f.storage.set('medveda:resume:note-1', JSON.stringify({ url: request.sourceUrl, fileUri: 'file:///documents/medveda/notes/partial.pdf', resumeData: 'old-bytes' }));
  await f.manager.resumeDownload(request.id);
  assert.match(f.calls[2], /fresh-3$/);
  f.setError(new f.NoteAccessError(403));
  await f.manager.retryDownload(request.id);
  assert.equal(f.calls.length, 3); assert.equal(f.manager.getDownload(request.id), null);
  assert.equal([...f.files.keys()].filter(k => k.endsWith('.pdf')).length, 0);
  assert.equal(f.storage.has('medveda:note-verified:buyer:note-1'), false);
  f.close(); console.log('PASS stale URL initial/retry/resume refresh, persisted source, revoked retry makes no download');
  for (const response of [{ status: 403 }, { status: 200, badHeader: true }, { status: 200, headers: { 'Content-Length': '200' } }, { status: 206 }]) {
    f = fixture(); f.setTransport(async () => response); if (response.badHeader) f.setHeader('PGh0bWw=');
    await f.manager.enqueueDownload(request); assert.equal(f.manager.getDownload(request.id).status, 'failed'); f.close();
  }
  console.log('PASS HTTP errors, partial bodies, size mismatch and non-PDF bodies never become completed downloads');
  f = fixture(); let finish; f.setTransport(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.manager.enqueueDownload(request); await tick();
  await f.manager.enqueueDownload(request); assert.equal(f.calls.length, 1);
  f.setUser({ id: 'second-user' }); await f.manager.clearAllDownloads(); finish({ status: 200 }); await pending;
  assert.equal(f.manager.getAllDownloads().length, 0); assert.equal(f.files.size, 0); f.close();
  console.log('PASS duplicate start coalesces; late completion after account switch cannot recreate content');
  f = fixture(); f.setTransport(() => new Promise(resolve => { finish = resolve; }));
  const paused = f.manager.enqueueDownload(request); await tick(); await f.manager.pauseDownload(request.id);
  finish(undefined); await paused; assert.equal(f.manager.getDownload(request.id).status, 'paused');
  f.setTransport(async () => ({ status: 200 })); await f.manager.resumeDownload(request.id);
  assert.equal(f.manager.getDownload(request.id).status, 'completed'); f.close();
  console.log('PASS pause completion cannot overwrite paused state; resume obtains fresh authorization');
  const day = 24 * 60 * 60 * 1000;
  const verifiedKey = 'medveda:note-verified:buyer:note-1';
  for (const status of [undefined, 500, 429]) {
    f = fixture(); now = 1_800_000_000_000;
    await f.manager.enqueueDownload(request);
    assert.equal(JSON.parse(f.storage.get(verifiedKey)).checkedAt, now);
    f.setError(status ? new f.NoteAccessError(status) : new Error('network'));
    now += 7 * day;
    assert.equal(await f.access.mayOpenOfflineNote('note-1'), true, 'seven-day boundary allowed');
    assert.ok(f.manager.getDownload('note-1'), 'transient failure must not revoke/delete the download');
    assert.notEqual(f.storage.get('medveda:note-denied:buyer:note-1'), '1');
    now += 1;
    assert.equal(await f.access.mayOpenOfflineNote('note-1'), false, 'day eight denied');
    f.close();
  }
  for (const status of [401, 403]) {
    f = fixture(); await f.manager.enqueueDownload(request);
    const uri = f.manager.getDownload('note-1').localUri;
    f.setError(new f.NoteAccessError(status));
    assert.equal(await f.access.mayOpenOfflineNote('note-1'), false);
    assert.equal(f.files.has(uri), false); assert.equal(f.storage.has(verifiedKey), false);
    f.setError(new Error('network')); assert.equal(await f.access.mayOpenOfflineNote('note-1'), false);
    f.close();
  }
  f = fixture(); now = 1_800_000_000_000;
  await f.manager.enqueueDownload(request); f.setError(new Error('offline'));
  now += 3 * day; assert.equal(await f.access.mayOpenOfflineNote('note-1'), true);
  now -= day; assert.equal(await f.access.mayOpenOfflineNote('note-1'), false, 'rollback after offline use denied');
  now += day; assert.equal(await f.access.mayOpenOfflineNote('note-1'), false, 'rollback expiry persists');
  f.setError(undefined); assert.equal(await f.access.mayOpenOfflineNote('note-1'), true);
  f.setError(new Error('offline')); now -= 1;
  assert.equal(await f.access.mayOpenOfflineNote('note-1'), false, 'future check timestamp denied');
  f.storage.set(verifiedKey, '{bad json'); assert.equal(await f.access.mayOpenOfflineNote('note-1'), false);
  f.close();
  f = fixture(); await f.manager.enqueueDownload(request); f.storage.delete(verifiedKey);
  f.setError(new Error('offline')); assert.equal(await f.access.mayOpenOfflineNote('note-1'), false, 'legacy download denied');
  f.setError(undefined); assert.equal(await f.access.mayOpenOfflineNote('note-1'), true, 'legacy online check recovers');
  await f.manager.removeDownload('note-1'); assert.equal(f.storage.has(verifiedKey), false);
  await f.manager.enqueueDownload(request); await f.manager.clearAllDownloads(); assert.equal(f.storage.has(verifiedKey), false);
  f.close();
  console.log('PASS seven-day grace/network/5xx/429, day eight, 401/403 deletion, persistent rollback expiry, future/corrupt timestamps, legacy recovery, cleanup');
  f = fixture();
  assert.equal(await f.access.mayOpenOfflineNote('n'), true);
  f.setError(new Error('network')); assert.equal(await f.access.mayOpenOfflineNote('n'), true);
  f.setError(new f.NoteAccessError(403)); assert.equal(await f.access.mayOpenOfflineNote('n'), false);
  f.setError(new Error('network')); assert.equal(await f.access.mayOpenOfflineNote('n'), false);
  f.setError(undefined); assert.equal(await f.access.mayOpenOfflineNote('n'), true);
  f.setError(new f.NoteAccessError(500)); assert.equal(await f.access.mayOpenOfflineNote('n'), true);
  f.setError(new f.NoteAccessError(401)); assert.equal(await f.access.mayOpenOfflineNote('n'), false);
  f.setUser({ id: 'other' }); assert.equal(await f.access.mayOpenOfflineNote('n'), false);
  f.setUser(null); assert.equal(await f.access.mayOpenOfflineNote('n'), false); f.close();
  console.log('PASS online denial persists offline, recovery clears denial, transient failure retains access, wrong user/sign-out denied');

  f = fixture();
  await f.manager.enqueueDownload(request);
  await f.manager.saveQuizForOffline({ id: 'quiz-1', title: 'Quiz', subjectId: 's', subjectTitle: 'Subject',
    yearId: 'y', yearTitle: 'Year', quizData: { id: 'quiz-1', questions: [{ question: 'Q', options: ['A'], answer: 'A' }] } });
  const noteUri = f.manager.getDownload('note-1').localUri;
  f.files.set('file:///documents/medveda/quizzes/orphan.json', '{"answer":"legacy"}');
  assert.ok(f.manager.getDownload('quiz-1'));
  f.setDeleteError(new Error('storage unavailable'));
  await assert.rejects(f.manager.removeLegacyOfflineQuizzes(), /storage unavailable/);
  assert.equal(f.storage.has('medveda:answer-free-quiz-downloads:v1'), false);
  assert.ok(f.manager.getDownload('quiz-1'));
  f.setDeleteError(undefined);
  await f.manager.removeLegacyOfflineQuizzes();
  assert.equal(f.manager.getDownload('quiz-1'), null);
  assert.equal([...f.files.keys()].some(uri => uri.startsWith('file:///documents/medveda/quizzes/')), false);
  assert.equal(f.files.has(noteUri), true);
  assert.equal(f.manager.getDownload('note-1').status, 'completed');
  await f.manager.removeLegacyOfflineQuizzes();
  assert.equal(f.files.has(noteUri), true);
  assert.equal(f.storage.get('medveda:answer-free-quiz-downloads:v1'), '1');
  f.close();
  console.log('PASS upgrade cleanup removes quiz rows and orphan files, preserves paid notes, and is idempotent');
})().catch(error => { console.error(error); process.exitCode = 1; });
