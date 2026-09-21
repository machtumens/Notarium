import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getAuthedUser } from '../lib/auth';
import { completeTestSchema, parseBody } from '../lib/validation';

// Test history + badges.
//
// Badges are COMPUTED from counters on every read rather than stored in a
// badges table with an award job. Two reasons: there is no backfill problem for
// existing users, and a badge can never drift out of sync with the number it
// claims to represent — the failure mode `subjects.note_count` already
// demonstrates in this codebase.

export interface BadgeState {
  key: string;
  label: string;
  hint: string;
  earned: boolean;
  /** Present when the badge is progress-based, so the UI can show "7 / 10". */
  progress?: { have: number; need: number };
  /** Set when the badge cannot be earned yet because the feature is unbuilt. */
  unavailable?: string;
}

/** POST /api/tests/complete — record a finished mock and return the previous one. */
export async function completeTest(request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const body = await parseBody(request, completeTestSchema, env);
  if (body instanceof Response) return body;

  const questionCount = Number(body.question_count);
  const correctCount = Number(body.correct_count);
  if (!Number.isFinite(questionCount) || questionCount <= 0) {
    return jsonResponse({ error: 'question_count must be a positive number' }, 400, env);
  }
  if (!Number.isFinite(correctCount) || correctCount < 0 || correctCount > questionCount) {
    return jsonResponse({ error: 'correct_count must be between 0 and question_count' }, 400, env);
  }

  const scorePct = Math.round((correctCount / questionCount) * 100);
  const sourceType =
    body.source_type === 'note' || body.source_type === 'subject'
      ? (body.source_type as string)
      : null;
  const sourceId = Number.isFinite(Number(body.source_id)) ? Number(body.source_id) : null;
  const durationSec = Number.isFinite(Number(body.duration_sec)) ? Number(body.duration_sec) : null;

  // Read the previous session BEFORE inserting this one, so "last time" never
  // compares the test against itself.
  const previous = await env.DB.prepare(
    `SELECT score_pct, correct_count, question_count, created_at
       FROM test_sessions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
  )
    .bind(user.id)
    .first();

  await env.DB.prepare(
    `INSERT INTO test_sessions
       (user_id, subject_id, source_type, source_id, question_count, correct_count, score_pct, duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      user.id,
      sourceType === 'subject' ? sourceId : null,
      sourceType,
      sourceId,
      questionCount,
      correctCount,
      scorePct,
      durationSec,
    )
    .run();

  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM test_sessions WHERE user_id = ?`,
  )
    .bind(user.id)
    .all();
  const total = Number((results?.[0] as { n?: number } | undefined)?.n ?? 0);

  return jsonResponse(
    {
      success: true,
      score_pct: scorePct,
      tests_completed: total,
      previous: previous
        ? {
            score_pct: Number((previous as { score_pct: number }).score_pct),
            created_at: (previous as { created_at: string }).created_at,
            delta: scorePct - Number((previous as { score_pct: number }).score_pct),
          }
        : null,
    },
    200,
    env,
  );
}

/** GET /api/badges — every badge with its earned state, computed live. */
export async function getBadges(request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const row = await env.DB.prepare(
    `SELECT learning_points, longest_streak, notes_uploaded FROM users WHERE id = ?`,
  )
    .bind(user.id)
    .first<{ learning_points: number; longest_streak: number; notes_uploaded: number }>();

  const points = Number(row?.learning_points ?? 0);
  const longest = Number(row?.longest_streak ?? 0);
  const notes = Number(row?.notes_uploaded ?? 0);

  const mocksRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM test_sessions WHERE user_id = ?`)
    .bind(user.id)
    .first<{ n: number }>();
  const mocks = Number(mocksRow?.n ?? 0);

  // Distinct students actually taught — counted from attended bookings on the
  // caller's own completed sessions, so opening empty rooms earns nothing here
  // either. Tolerates the tutor tables being absent on an un-migrated database.
  let helped = 0;
  try {
    const helpedRow = await env.DB.prepare(
      `SELECT COUNT(DISTINCT b.student_id) AS n
         FROM tutor_bookings b
         JOIN tutor_sessions ts ON ts.id = b.session_id
         JOIN tutor_profiles tp ON tp.id = ts.tutor_profile_id
        WHERE tp.user_id = ? AND b.status = 'attended' AND ts.status = 'completed'`,
    )
      .bind(user.id)
      .first<{ n: number }>();
    helped = Number(helpedRow?.n ?? 0);
  } catch {
    // Tutor tables absent on an un-migrated database. Nobody taught anyone,
    // which is the honest answer here, and `helped` is already 0.
  }

  // Rank is computed the same way the leaderboard orders, so the "Top 3" badge
  // and the visible ranking can never disagree.
  const rankRow = await env.DB.prepare(
    `SELECT COUNT(*) + 1 AS rank FROM users
      WHERE COALESCE(learning_points, 0) > ?
        AND COALESCE(suspended, 0) = 0`,
  )
    .bind(points)
    .first<{ rank: number }>();
  const rank = Number(rankRow?.rank ?? 0);

  const badges: BadgeState[] = [
    {
      key: 'first_100',
      label: 'First 100',
      hint: 'Earn 100 learning points',
      earned: points >= 100,
      progress: { have: Math.min(points, 100), need: 100 },
    },
    {
      key: 'note_author',
      label: 'Note author',
      hint: 'Publish a note to the community',
      earned: notes >= 1,
      progress: { have: Math.min(notes, 1), need: 1 },
    },
    {
      key: 'ten_mocks',
      label: '10 mocks',
      hint: 'Finish 10 timed mock tests',
      earned: mocks >= 10,
      progress: { have: Math.min(mocks, 10), need: 10 },
    },
    {
      key: 'streak_30',
      label: '30 day streak',
      hint: 'Study 30 days in a row',
      earned: longest >= 30,
      progress: { have: Math.min(longest, 30), need: 30 },
    },
    {
      key: 'top_3',
      label: 'Top 3',
      hint: 'Reach the top 3 by learning points',
      earned: rank > 0 && rank <= 3,
    },
    {
      key: 'helped_5',
      label: 'Helped 5',
      hint: 'Tutor five different classmates',
      earned: helped >= 5,
      progress: { have: Math.min(helped, 5), need: 5 },
    },
  ];

  return jsonResponse({ badges, rank, tests_completed: mocks }, 200, env);
}
