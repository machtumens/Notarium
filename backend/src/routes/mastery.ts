/**
 * GET /api/progress/mastery and GET /api/progress/timeseries.
 *
 * `lib/mastery.ts` holds the definition and the arithmetic; this file is the SQL
 * that feeds it plus the two handlers. Both read the SAME rows through the SAME
 * function, so the number on the card and the last point on the graph are the
 * same number by construction rather than by agreement.
 *
 * Kept out of routes/progress.ts (mock results and badges) because this is the
 * other direction: progress.ts writes a finished test, these only read.
 */
import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getAuthedUser } from '../lib/auth';
import {
  MASTERY_WINDOW_DAYS,
  TIMESERIES_DEFAULT_WEEKS,
  TIMESERIES_MAX_WEEKS,
  bucketEnds,
  masteryPct,
  median,
  type AnswerRow,
} from '../lib/mastery';
import { addLocalDays, isoUtc, localDate, resolveZone, startOfLocalDay } from '../lib/time';

/** Rows are cheap but a class is not a crowd — a ceiling keeps one request bounded. */
const MAX_ANSWER_ROWS = 20000;
/** Classmates considered for the median. A school class is ~30; this is a guard, not a limit anyone meets. */
const MAX_PEERS = 200;

/**
 * Every scored answer for `userIds` at or after `since`, from both sources.
 *
 * `quiz_attempts` has no subject of its own — the question was generated from a
 * note, so the note's subject is the question's subject. A question whose note
 * has since been deleted leaves `subject_id` null: it still counts toward the
 * overall figure and toward no subject's own, which is the honest reading.
 */
async function fetchAnswerRows(env: Env, userIds: number[], since: string): Promise<AnswerRow[]> {
  if (userIds.length === 0) return [];
  const ids = userIds.map(() => '?').join(',');
  const result = await env.DB.prepare(
    `SELECT user_id, subject_id, question_count AS answered, correct_count AS correct, created_at AS at
       FROM test_sessions
      WHERE user_id IN (${ids}) AND created_at >= ?
     UNION ALL
     SELECT qa.user_id, n.subject_id, 1 AS answered,
            CASE WHEN qa.is_correct THEN 1 ELSE 0 END AS correct, qa.answered_at AS at
       FROM quiz_attempts qa
       LEFT JOIN notes n ON n.id = qa.note_id
      WHERE qa.user_id IN (${ids}) AND qa.answered_at >= ?
      LIMIT ${MAX_ANSWER_ROWS}`,
  )
    .bind(...userIds, since, ...userIds, since)
    .all();
  return (result.results ?? []) as unknown as AnswerRow[];
}

/** The window ending with `endDay` (inclusive), as the ISO-UTC half-open pair the rows compare against. */
function windowFor(zone: string, endDay: string): { from: string; to: string } {
  return {
    from: isoUtc(startOfLocalDay(zone, addLocalDays(endDay, -(MASTERY_WINDOW_DAYS - 1)))),
    to: isoUtc(startOfLocalDay(zone, addLocalDays(endDay, 1))),
  };
}

/**
 * GET /api/progress/mastery — current mastery, overall and per subject.
 *
 * Subjects come back weakest first: the point of the number is to say where the
 * next hour should go. A subject the student has answered nothing in is absent
 * rather than reported as 0% (see `masteryPct` on why null is not zero), and
 * `overall` is null for a student who has answered nothing at all — which is
 * exactly what a new account is.
 */
export async function getMastery(request: Request, env: Env) {
  try {
    const user = await getAuthedUser(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const zone = resolveZone(user.timezone);
    const today = localDate(zone);
    const { from, to } = windowFor(zone, today);
    const rows = await fetchAnswerRows(env, [user.id], from);

    const overall = masteryPct(rows, from, to, { user_id: user.id });

    const subjectRows = await env.DB.prepare(`SELECT id, name FROM subjects`).all();
    const subjects = ((subjectRows.results ?? []) as unknown as { id: number; name: string }[])
      .map((s) => ({ s, m: masteryPct(rows, from, to, { user_id: user.id, subject_id: s.id }) }))
      .filter(({ m }) => m.pct !== null)
      .map(({ s, m }) => ({
        subject_id: s.id,
        name: s.name,
        pct: m.pct as number,
        answered: m.answered,
        correct: m.correct,
      }))
      .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));

    return jsonResponse(
      {
        window_days: MASTERY_WINDOW_DAYS,
        as_of: today,
        overall: overall.pct,
        answered: overall.answered,
        correct: overall.correct,
        subjects,
      },
      200,
      env,
    );
  } catch (error: any) {
    console.error('getMastery error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, env);
  }
}

/**
 * GET /api/progress/timeseries?weeks=12&subject_id=3 — mastery week by week,
 * the student against their class median.
 *
 * Each point is the same trailing window evaluated at that week's end, so the
 * line dips when recent answers go badly instead of being anchored by a good
 * September. Points sit seven days apart ending today rather than on calendar
 * weeks: a student looking on a Wednesday should see the week they are in.
 *
 * `klas` is a true median over the classmates who answered anything in that
 * window — NOT a class-wide accuracy, which is a different statistic and would
 * be a lie under this label. It is null when the student has no class recorded,
 * or when no classmate has data for that window.
 */
export async function getProgressTimeseries(request: Request, env: Env) {
  try {
    const user = await getAuthedUser(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const url = new URL(request.url);
    const weeks = Math.max(
      1,
      Math.min(
        TIMESERIES_MAX_WEEKS,
        Math.trunc(Number(url.searchParams.get('weeks'))) || TIMESERIES_DEFAULT_WEEKS,
      ),
    );
    const rawSubject = Math.trunc(Number(url.searchParams.get('subject_id')));
    const subjectId = Number.isFinite(rawSubject) && rawSubject > 0 ? rawSubject : undefined;

    const zone = resolveZone(user.timezone);
    const ends = bucketEnds(localDate(zone), weeks, addLocalDays);

    // Peers include the student: a median of the class is a median of everyone in it.
    let peers: number[] = [user.id];
    if (user.class) {
      const peerRows = await env.DB.prepare(
        `SELECT id FROM users
          WHERE class = ? AND COALESCE(suspended, 0) = 0 AND COALESCE(graduated, 0) = 0
          LIMIT ${MAX_PEERS}`,
      )
        .bind(user.class)
        .all();
      const ids = ((peerRows.results ?? []) as unknown as { id: number }[]).map((r) => r.id);
      if (ids.length > 0) peers = ids.includes(user.id) ? ids : [...ids, user.id];
    }

    // One fetch for the whole span: the earliest point still needs a full window
    // of history behind it, so reach back past the first bucket end.
    const earliest = windowFor(zone, ends[0]).from;
    const rows = await fetchAnswerRows(env, peers, earliest);

    const points = ends.map((end) => {
      const { from, to } = windowFor(zone, end);
      const you = masteryPct(rows, from, to, { user_id: user.id, subject_id: subjectId });
      const peerPcts = peers
        .map((id) => masteryPct(rows, from, to, { user_id: id, subject_id: subjectId }).pct)
        .filter((p): p is number => p !== null);
      return { week_ending: end, you: you.pct, answered: you.answered, klas: median(peerPcts) };
    });

    return jsonResponse(
      {
        window_days: MASTERY_WINDOW_DAYS,
        weeks,
        subject_id: subjectId ?? null,
        class: user.class ?? null,
        peers: peers.length,
        points,
      },
      200,
      env,
    );
  } catch (error: any) {
    console.error('getProgressTimeseries error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, env);
  }
}
