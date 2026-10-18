#!/usr/bin/env node
// Interactive T1 runner. Credentials and sessions stay in process memory only.
const { createRequire } = require('node:module');
const { Writable } = require('node:stream');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const mobileRequire = createRequire(path.join(root, 'mobile-app/package.json'));
const { createClient } = mobileRequire('@supabase/supabase-js');
const expectedUrl = 'https://xbvenkfmesugrbjuufyw.supabase.co';

function expoConfig() {
  const values = {};
  for (const line of readFileSync(path.join(root, 'mobile-app/.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(EXPO_PUBLIC_SUPABASE_URL|EXPO_PUBLIC_SUPABASE_ANON_KEY)\s*=\s*(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^("|')(.*)\1$/, '$2');
  }
  if (values.EXPO_PUBLIC_SUPABASE_URL !== expectedUrl || !values.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('BLOCKED: Expo URL/key missing or URL does not match the approved project');
  }
  return values;
}

const maskedOutput = new Writable({ write(_chunk, _encoding, done) {
  if (!maskedOutput.muted) process.stdout.write(_chunk);
  done();
} });
const terminal = readline.createInterface({ input: process.stdin, output: maskedOutput, terminal: true });
let maskedLabel = '';
process.stdin.on('keypress', () => {
  if (!maskedOutput.masked) return;
  // Readline has already updated its line. Draw only its length, never its contents.
  process.stdout.write(`\r${maskedLabel}${'*'.repeat([...terminal.line].length)}\x1b[0K`);
});
function ask(label, hidden = false, masked = false) {
  process.stdout.write(label);
  maskedLabel = masked ? label : '';
  maskedOutput.muted = hidden || masked;
  maskedOutput.masked = masked;
  return new Promise((resolve) => terminal.question('', answer => {
    maskedOutput.muted = false;
    maskedOutput.masked = false;
    maskedLabel = '';
    if (hidden || masked) process.stdout.write('\n');
    resolve(masked ? answer : answer.trim());
  }));
}
function requireOk(condition, message) {
  if (!condition) throw new Error(`BLOCKED: ${message}`);
}
async function account(label, url, key) {
  const email = await ask(`${label} email: `);
  const password = await ask(`${label} password: `, true, true);
  requireOk(email && password, `${label} credentials are missing`);
  const client = createClient(url, key, { auth: {
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
  } });
  const signed = await client.auth.signInWithPassword({ email, password });
  requireOk(!signed.error && signed.data.session, `${label} Supabase Auth sign-in failed`);
  const identity = await client.auth.getUser();
  requireOk(!identity.error && identity.data.user?.id === signed.data.user?.id,
    `${label} Auth identity could not be verified`);
  return { client, id: identity.data.user.id };
}
async function rpcBool(client, name) {
  const { data, error } = await client.rpc(name);
  requireOk(!error && typeof data === 'boolean', `${name} role check failed`);
  return data;
}
async function activeProfile(account, label) {
  const { data, error } = await account.client.from('profiles').select('id,blocked').eq('id', account.id).single();
  requireOk(!error && data?.id === account.id && data.blocked !== true,
    `${label} has no available unblocked profile`);
}
async function main() {
  requireOk(process.stdin.isTTY && process.stdout.isTTY, 'run this from an interactive terminal');
  const config = expoConfig();
  console.log('Expo URL and anon key are present; using the existing project.');
  const students = [];
  for (let i = 1; i <= 2; i++) {
    const student = await account(`Student ${i}`, config.EXPO_PUBLIC_SUPABASE_URL, config.EXPO_PUBLIC_SUPABASE_ANON_KEY);
    await activeProfile(student, `student ${i}`);
    requireOk(!(await rpcBool(student.client, 'is_admin_account')), `student ${i} is an admin account`);
    students.push(student);
  }
  const admin = await account('Admin', config.EXPO_PUBLIC_SUPABASE_URL, config.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  requireOk(new Set([...students.map(s => s.id), admin.id]).size === 3, 'three distinct accounts are required');
  await activeProfile(admin, 'admin');
  requireOk(await rpcBool(admin.client, 'is_admin_account'), 'admin account role is missing');
  if (!(await rpcBool(admin.client, 'am_i_admin'))) {
    const assurance = await admin.client.auth.mfa.getAuthenticatorAssuranceLevel();
    requireOk(!assurance.error && assurance.data.nextLevel === 'aal2', 'admin session lacks required MFA');
    const factors = await admin.client.auth.mfa.listFactors();
    const factor = factors.data?.totp?.[0];
    requireOk(!factors.error && factor, 'admin has no verified TOTP factor');
    const code = await ask('Admin authenticator code: ', true);
    const verified = await admin.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    requireOk(!verified.error && await rpcBool(admin.client, 'am_i_admin'), 'admin MFA verification failed');
  }
  console.log('Three distinct Auth identities and student/admin roles verified.');

  const { data: candidates, error: listError } = await students[0].client.from('quiz_tests')
    .select('id,title').eq('active', true).limit(100);
  requireOk(!listError && Array.isArray(candidates), 'active quiz listing failed');
  console.log('Active quiz candidates (select only an existing dedicated controlled fixture):');
  for (const quiz of candidates) console.log(`${quiz.id}  ${quiz.title}`);
  const quizId = await ask('Existing controlled quiz UUID: ');
  requireOk(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quizId),
    'controlled quiz UUID is missing or invalid');
  const { data: quiz, error: quizError } = await students[0].client.from('quiz_tests')
    .select('id,active,question_revision,questions,subject_id,year_id,course_id')
    .eq('id', quizId).single();
  requireOk(!quizError && quiz?.active && Number.isSafeInteger(quiz.question_revision),
    'selected quiz is unavailable or inactive');
  requireOk(Array.isArray(quiz.questions) && quiz.questions.length >= 1 && quiz.questions.length <= 100 &&
    quiz.questions.every(q => Array.isArray(q.options) && q.options.length >= 2 &&
      typeof q.answer === 'string' && q.options.includes(q.answer)),
  'quiz questions are unsuitable for the scoring RPC');
  const { data: subject, error: subjectError } = await students[0].client.from('subjects')
    .select('id,year_id,course_id').eq('id', quiz.subject_id).single();
  requireOk(!subjectError && subject?.year_id === quiz.year_id && subject?.course_id === quiz.course_id,
    'quiz subject/course/year linkage is invalid');
  const controlled = await ask('Confirm this is an existing dedicated controlled quiz (type CONTROLLED): ');
  requireOk(controlled === 'CONTROLLED', 'controlled fixture designation was not confirmed');

  const jwt = async account => {
    const { data, error } = await account.client.auth.getSession();
    requireOk(!error && data.session?.access_token && data.session.expires_at * 1000 > Date.now() + 120000,
      'authenticated session is missing or near expiry');
    return data.session.access_token;
  };
  const childEnv = {
    PATH: process.env.PATH || '',
    TEST_ANON_KEY: config.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    TEST_STUDENT_1_JWT: await jwt(students[0]),
    TEST_STUDENT_2_JWT: await jwt(students[1]),
    TEST_ADMIN_JWT: await jwt(admin),
    TEST_QUIZ_ID: quizId,
    MEDVEDA_HOSTED_P1_APPROVAL: 'APPROVED_CONTROLLED_QUIZ_ATTEMPTS',
  };
  // One invocation only: retrying after a partial failure could add more attempts.
  console.log('Preflight PASS. Running approved T1 once; two intended attempt rows.');
  terminal.close();
  const run = spawnSync('deno', ['run', '--allow-env', '--allow-net',
    path.join(__dirname, 'hosted_quiz_controlled_test.ts')],
  { cwd: root, env: childEnv, stdio: 'inherit' });
  requireOk(run.status === 0, 'T1 failed; do not rerun before reviewing permanent attempt rows');
  console.log('P1 T1 PASS');
}

main().catch(error => {
  // Auth/API errors can contain response details; print only our controlled messages.
  console.error(error.message?.startsWith('BLOCKED:') ? error.message : 'BLOCKED: local T1 runner failed');
  terminal.close();
  process.exitCode = 1;
});
