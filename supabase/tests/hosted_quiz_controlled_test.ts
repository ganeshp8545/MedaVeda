// Approval-gated hosted test. Creates two permanent verified attempts for a
// dedicated student. Never use a customer account or a production quiz fixture
// whose answers should not be exposed to the controlled tester.
const project = "https://xbvenkfmesugrbjuufyw.supabase.co";
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (env("MEDVEDA_HOSTED_P1_APPROVAL") !== "APPROVED_CONTROLLED_QUIZ_ATTEMPTS") {
  throw new Error("Separate owner approval is required for hosted attempt writes");
}
const key = env("TEST_ANON_KEY");
const student1 = env("TEST_STUDENT_1_JWT");
const student2 = env("TEST_STUDENT_2_JWT");
const admin = env("TEST_ADMIN_JWT");
const testId = env("TEST_QUIZ_ID");

function userId(jwt: string): string {
  const payload = jwt.split(".")[1];
  if (!payload) throw new Error("Invalid test JWT");
  const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  if (claims.role !== "authenticated" || !claims.sub || claims.exp * 1000 <= Date.now()) {
    throw new Error("Controlled account JWT must be authenticated and unexpired");
  }
  return claims.sub;
}
const ids = [student1, student2, admin].map(userId);
if (new Set(ids).size !== 3) throw new Error("Use three distinct controlled accounts");

async function api(jwt: string, route: string, method = "GET", body?: unknown) {
  const response = await fetch(`${project}/rest/v1/${route}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let value: unknown;
  try { value = JSON.parse(text); } catch { value = text; }
  return { status: response.status, value };
}
function assert(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
  console.log(`PASS ${message}`);
}
const quiz = await api(student1, `quiz_tests?id=eq.${encodeURIComponent(testId)}&select=id,active,question_revision,questions`);
if (quiz.status !== 200 || !Array.isArray(quiz.value) || quiz.value.length !== 1) {
  throw new Error("Controlled student cannot read the selected quiz");
}
const test = quiz.value[0] as { active: boolean; question_revision: number; questions: { options: string[]; answer: string }[] };
if (!test.active || !Array.isArray(test.questions) || !test.questions.length) {
  throw new Error("Select an active controlled quiz with questions");
}
const correct = test.questions.map((q) => q.options.indexOf(q.answer));
if (correct.some((index) => index < 0)) throw new Error("Quiz has an answer outside its options");
const unanswered = correct.map(() => null);
const attempt1 = `controlled_${crypto.randomUUID()}`;
const attempt2 = `controlled_${crypto.randomUUID()}`;
const submit = (jwt: string, id: string, answers: unknown) => api(jwt, "rpc/submit_quiz_attempt", "POST", {
  p_attempt_id: id,
  p_test_id: testId,
  p_question_revision: test.question_revision,
  p_answers: answers,
});
const first = await submit(student1, attempt1, correct);
assert(first.status === 200 && (first.value as Record<string, unknown>)?.score === correct.length, "server scores correct answers");
const duplicate = await submit(student1, attempt1, correct);
assert(duplicate.status === 200 && JSON.stringify(duplicate.value) === JSON.stringify(first.value), "same submission is idempotent");
const changed = await submit(student1, attempt1, unanswered);
assert(changed.status >= 400, "changed duplicate is rejected");
const cross = await submit(student2, attempt1, correct);
assert(cross.status >= 400, "cross-user duplicate is rejected");
const second = await submit(student1, attempt2, unanswered);
assert(second.status === 200 && (second.value as Record<string, unknown>)?.score === 0, "server scores unanswered attempt zero");
const ownerRead = await api(student1, `verified_quiz_attempts?id=eq.${attempt1}&select=id,score`);
const otherRead = await api(student2, `verified_quiz_attempts?id=eq.${attempt1}&select=id,score`);
const adminRead = await api(admin, `verified_quiz_attempts?id=eq.${attempt1}&select=id,score`);
assert(ownerRead.status === 200 && Array.isArray(ownerRead.value) && ownerRead.value.length === 1, "owner reads own result");
assert(otherRead.status === 200 && Array.isArray(otherRead.value) && otherRead.value.length === 0, "other student cannot read result");
assert(adminRead.status === 200 && Array.isArray(adminRead.value) && adminRead.value.length === 1, "admin reads result");
const forgery = await api(student1, "verified_quiz_attempts", "POST", {
  id: `forged_${crypto.randomUUID()}`, user_id: ids[0], test_id: testId,
  test_title: "forged", question_revision: test.question_revision,
  answers: correct, score: correct.length, total: correct.length, percentage: 100,
});
assert(forgery.status >= 400, "direct score forgery is denied");
console.log(JSON.stringify({ attempt1, attempt2, status: "PASS", note: "Permanent controlled attempts; no cleanup performed" }));
