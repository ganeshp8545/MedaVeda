// Real SQL authorization + actual Edge handlers; Auth and Storage transport are fixture doubles.
// A disposable database clone is dropped in finally. No hosted API, PDF, or billing call is made.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('../../mobile-app/node_modules/typescript');
const template = process.env.TEMPLATE_DB;
if (!template || !/^[a-zA-Z0-9_]+$/.test(template)) throw new Error('TEMPLATE_DB must name a disposable migrated database');
const database = `publication_urls_${process.pid}`;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const run = (sql, db = database) => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const student = 'eda00000-0000-0000-0000-000000000001';
const buyer = 'eda00000-0000-0000-0000-000000000002';
const admin = 'eda00000-0000-0000-0000-000000000003';
const tokens = { student, buyer, admin_aal1: admin, admin_aal2: admin };
let assertions = 0;
function setup(kind, { rpcError = false } = {}) {
  let handler;
  const calls = { sign: 0, read: 0, rpc: [] };
  const mocks = {
    '../_shared/cors.ts': { handleOptions: () => null, jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), { status }) },
    '../_shared/rateLimit.ts': { withinLimit: async () => true },
    '../_shared/supabaseAdmin.ts': {
      aalFromAuthHeader: req => req.headers.get('Authorization') === 'Bearer admin_aal2' ? 'aal2' : 'aal1',
      getUserFromAuthHeader: async req => {
        const id = tokens[req.headers.get('Authorization')?.replace(/^Bearer /, '')];
        return id ? { id } : null;
      },
      supabaseAdmin: {
        rpc: async (name, args) => {
          calls.rpc.push({ name, args });
          if (rpcError) return { data: null, error: { code: 'fixture_db_error' } };
          const id = kind === 'note' ? args.p_note_id : args.p_video_id;
          const allowed = run(`begin read only; set local role service_role; select public.${name}(${quote(args.p_user)}::uuid,${quote(id)},${quote(args.p_aal)}); rollback;`) === 't';
          return { data: allowed, error: null };
        },
        from: table => ({
          select() { return this; },
          eq(_column, id) { this.id = id; return this; },
          async maybeSingle() {
            calls.read++;
            const column = table === 'notes' ? 'pdf_url' : 'youtube_url';
            const result = run(`begin read only; set local role service_role; select json_build_object('${column}',${column}) from public.${table} where id=${quote(this.id)}; rollback;`);
            return { data: result ? JSON.parse(result) : null };
          },
        }),
        storage: { from: bucket => ({ createSignedUrl: async (path, seconds) => {
          assert.equal(bucket, 'notes'); assert.equal(seconds, 120);
          calls.sign++;
          return { data: { signedUrl: `https://storage.fixture.invalid/${path}?fixture=1` }, error: null };
        } }) },
      },
    },
  };
  const code = ts.transpileModule(fs.readFileSync(`supabase/functions/get-${kind}-url/index.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports: {}, require: name => {
    if (!(name in mocks)) throw new Error(`Unexpected import ${name}`);
    return mocks[name];
  }, Deno: { serve: fn => { handler = fn; } }, console: { ...console, error() {} } });
  return { calls, invoke: (token, id, extra = {}, method = 'POST') => handler(new Request('https://fixture.invalid', {
    method, headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(method === 'POST' ? { body: JSON.stringify({ [`${kind}Id`]: id, ...extra }) } : {}),
  })) };
}
async function expect(kind, token, id, status, options = {}) {
  const fixture = setup(kind, options);
  const response = await fixture.invoke(token, id, options.body);
  assert.equal(response.status, status, `${kind}/${token}/${id}`);
  const result = await response.json();
  assert.equal(fixture.calls.sign, kind === 'note' && status === 200 ? 1 : 0, 'only authorized notes may be signed');
  assert.equal(fixture.calls.read, status === 200 ? 1 : 0, 'denial precedes service content read');
  if (status !== 200) assert.equal(result.url, undefined, 'denial never returns a URL');
  if (kind === 'note' && status === 200) assert.equal(result.expiresIn, 120);
  if (fixture.calls.rpc.length) assert.equal(fixture.calls.rpc[0].args.p_user, tokens[token], 'identity comes from Auth, not request body');
  if (fixture.calls.rpc.length) assert.equal(fixture.calls.rpc[0].args.p_aal, token === 'admin_aal2' ? 'aal2' : 'aal1', 'AAL comes from verified token');
  assertions++;
}
(async () => {
  run(`create database ${database} template ${template}`, 'postgres');
  try {
    run(`
      insert into auth.users(id,email) values (${quote(student)},'url-student@example.test'),(${quote(buyer)},'url-buyer@example.test'),(${quote(admin)},'url-admin@example.test');
      insert into public.admins(id,email) values (${quote(admin)},'url-admin@example.test');
      insert into public.courses(id,name,code) values ('url_course','URL course','URL_C'),('url_other','Other','URL_O');
      insert into public.years(id,title,course_id) values ('url_y1','Registered year','url_course'),('url_y2','Browsing year','url_course'),('url_foreign_y','Other year','url_other');
      insert into public.subjects(id,title,year_id) values ('url_s','Subject','url_y2'),('url_foreign_s','Other','url_foreign_y');
      insert into public.chapters(id,title,subject_id) values ('url_c','Chapter','url_s'),('url_foreign_c','Other','url_foreign_s');
      insert into public.notes(id,title,chapter_id,pdf_url,is_free_preview) values
        ('url_note','Paid note','url_c','https://fixture.invalid/storage/v1/object/public/notes/url.pdf',false),
        ('url_preview','Preview','url_c','preview.pdf',true),('url_foreign_preview','Other preview','url_foreign_c','other.pdf',true);
      insert into public.videos(id,title,subject_id,youtube_url) values ('url_video','Video','url_s','https://youtu.be/fixture'),('url_foreign_video','Other','url_foreign_s','https://youtu.be/other');
      select set_config('app.allow_profile_admin_fields','true',false);
      update public.profiles set course_id='url_course',year_id='url_y1' where id in (${quote(student)},${quote(buyer)});
      select set_config('app.allow_profile_admin_fields','false',false);
      insert into public.purchases(id,user_id,scope,status,course_id,year_id) values ('url_purchase',${quote(buyer)},'year','success','url_course','url_y2');
    `);
    for (const kind of ['note', 'video']) {
      await expect(kind, null, `url_${kind}`, 401);
      await expect(kind, 'buyer', '', 400);
      await expect(kind, 'buyer', 'url_missing', 403);
      await expect(kind, 'buyer', `url_${kind}`, 500, { rpcError: true });
    }
    await expect('note', 'student', 'url_note', 403, { body: { userId: buyer, unlocked: true, yearId: 'url_y2' } });
    await expect('note', 'buyer', 'url_note', 200);
    await expect('note', 'student', 'url_preview', 200);
    await expect('video', 'student', 'url_video', 200);
    await expect('note', 'buyer', 'url_foreign_preview', 403);
    await expect('video', 'buyer', 'url_foreign_video', 403);
    run('update public.admin_settings set require_mfa=true where id');
    await expect('note', 'admin_aal1', 'url_note', 403);
    await expect('video', 'admin_aal1', 'url_video', 403);
    await expect('note', 'admin_aal2', 'url_note', 200);
    await expect('video', 'admin_aal2', 'url_video', 200);
    run('update public.admin_settings set require_mfa=false where id');
    for (const [table, id] of [['courses','url_course'],['years','url_y2'],['subjects','url_s'],['chapters','url_c'],['notes','url_note'],['videos','url_video']]) {
      run(`update public.${table} set active=false where id=${quote(id)}`);
      await expect('note', 'buyer', 'url_note', table === 'videos' ? 200 : 403);
      await expect('note', 'student', 'url_preview', ['courses','years','subjects','chapters'].includes(table) ? 403 : 200);
      await expect('video', 'student', 'url_video', ['courses','years','subjects','videos'].includes(table) ? 403 : 200);
      run(`update public.${table} set active=true where id=${quote(id)}`);
      await expect('note', 'buyer', 'url_note', 200);
    }
    run("update public.purchases set status='refunded' where id='url_purchase'");
    await expect('note', 'buyer', 'url_note', 403);
    run(`update public.profiles set blocked=true where id=${quote(buyer)}`);
    await expect('note', 'buyer', 'url_preview', 403);
    await expect('video', 'buyer', 'url_video', 403);
    console.log(`PASS content URL publication handlers: ${assertions} cases with real service-role SQL authorization; Auth/Storage mocked`);
  } finally {
    run(`drop database if exists ${database}`, 'postgres');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
