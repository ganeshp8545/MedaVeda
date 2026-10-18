// OFFLINE MODE - records a finished quiz attempt locally FIRST (so
// submitting a test never fails just because the student has no
// signal), then queues answers for the server-scored submit_quiz_attempt RPC.
// Existing client scores remain local practice results, never trusted scores.

import { getDb, OFFLINE_DB_SUPPORTED } from "../config/database";
import { queueForSync } from "./syncEngine";
import { logDebug } from "../utils/logger";

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
  questionRevision?: number;
}

export function recordQuizAttempt(input: QuizAttemptInput): string {
  const attemptId = `qa_${input.quizId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (!OFFLINE_DB_SUPPORTED) return attemptId;
  const db = getDb();
  const takenAt = Date.now();

  const canVerify = !!input.userId && Number.isSafeInteger(input.questionRevision) &&
    (input.questionRevision ?? 0) > 0;
  db.runSync(
    `INSERT INTO quiz_attempts_local
      (attempt_id, quiz_id, chapter_id, score, total_questions, answers_json, taken_at, synced, verification_status)
     VALUES (?,?,?,?,?,?,?,0,?);`,
    [
      attemptId,
      input.quizId,
      "", // quizzes are subject-scoped, not chapter-scoped in this app
      input.score,
      input.totalQuestions,
      JSON.stringify(input.answers),
      takenAt,
      canVerify ? "unverified" : "legacy",
    ]
  );

  if (canVerify) {
    queueForSync("quiz_attempt", "upsert", {
      attempt_id: attemptId,
      user_id: input.userId,
      test_id: input.quizId,
      question_revision: input.questionRevision,
      answers: input.answers,
    });
  }

  return attemptId;
}

/** Every quiz attempt taken on this device, newest first - offline-safe history/review. */
export function getLocalQuizAttempts(quizId?: string) {
  if (!OFFLINE_DB_SUPPORTED) return [];
  const db = getDb();
  const rows = quizId
    ? db.getAllSync(
        `SELECT * FROM quiz_attempts_local WHERE quiz_id = ? ORDER BY taken_at DESC;`,
        [quizId]
      )
    : db.getAllSync(`SELECT * FROM quiz_attempts_local ORDER BY taken_at DESC;`);

  return rows.map((row: any) => {
    let answers: (number | null)[] = [];
    try {
      answers = JSON.parse(row.answers_json) as (number | null)[];
    } catch {
      // Corrupted local row (e.g. app killed mid-write) - surface it as
      // an empty answer set rather than throwing and taking the whole
      // attempt history screen down with it.
      logDebug(`quiz_attempts_local row ${row?.attempt_id} has corrupt answers_json`);
    }
    return {
      attemptId: row.attempt_id,
      quizId: row.quiz_id,
      score: row.score,
      totalQuestions: row.total_questions,
      answers,
      takenAt: row.taken_at,
      synced: Boolean(row.synced),
      verificationStatus: row.verification_status as "legacy" | "unverified" | "verified" | "stale" | "rejected",
    };
  });
}
