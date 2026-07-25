// OFFLINE MODE - records a finished quiz attempt locally FIRST (so
// submitting a test never fails just because the student has no
// signal), then queues it for syncEngine to push to Supabase's
// `quiz_scores` table whenever connectivity returns.
//
// IMPORTANT (Supabase side): `quiz_scores` needs an `id text primary
// key` column (client-generated) for the sync engine's
// `.upsert(payload, { onConflict: 'id' })` to be idempotent - otherwise
// a retried sync after a dropped connection can insert the same
// attempt twice. Add it if it isn't already there:
//   alter table quiz_scores add column if not exists id text primary key;

import { getDb } from "../config/database";
import { queueForSync } from "./syncEngine";

export interface QuizAttemptInput {
  quizId: string;
  quizTitle: string;
  subjectId: string;
  subjectTitle: string;
  userId?: string;
  userEmail?: string;
  score: number;
  totalQuestions: number;
  answers: (number | null)[];
}

export function recordQuizAttempt(input: QuizAttemptInput): string {
  const db = getDb();
  const attemptId = `qa_${input.quizId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const takenAt = Date.now();
  const percentage = Math.round((input.score / input.totalQuestions) * 100);

  db.runSync(
    `INSERT INTO quiz_attempts_local
      (attempt_id, quiz_id, chapter_id, score, total_questions, answers_json, taken_at, synced)
     VALUES (?,?,?,?,?,?,?,0);`,
    [
      attemptId,
      input.quizId,
      "", // quizzes are subject-scoped, not chapter-scoped in this app
      input.score,
      input.totalQuestions,
      JSON.stringify(input.answers),
      takenAt,
    ]
  );

  // Matches the exact columns the old direct supabase.from("quiz_scores")
  // insert used, plus the id needed for idempotent upserts.
  queueForSync("quiz_attempt", "upsert", {
    id: attemptId,
    user_id: input.userId,
    email: input.userEmail,
    subject_id: input.subjectId,
    subject_title: input.subjectTitle,
    test_id: input.quizId,
    test_title: input.quizTitle,
    score: input.score,
    total: input.totalQuestions,
    percentage,
  });

  return attemptId;
}

/** Every quiz attempt taken on this device, newest first - offline-safe history/review. */
export function getLocalQuizAttempts(quizId?: string) {
  const db = getDb();
  const rows = quizId
    ? db.getAllSync(
        `SELECT * FROM quiz_attempts_local WHERE quiz_id = ? ORDER BY taken_at DESC;`,
        [quizId]
      )
    : db.getAllSync(`SELECT * FROM quiz_attempts_local ORDER BY taken_at DESC;`);

  return rows.map((row: any) => ({
    attemptId: row.attempt_id,
    quizId: row.quiz_id,
    score: row.score,
    totalQuestions: row.total_questions,
    answers: JSON.parse(row.answers_json) as (number | null)[],
    takenAt: row.taken_at,
    synced: Boolean(row.synced),
  }));
}
