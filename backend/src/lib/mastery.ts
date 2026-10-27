/**
 * Mastery: one definition, used everywhere.
 *
 * Mastery is the share of questions answered correctly in a trailing window —
 * nothing else. It is deliberately not an SM-2 ease factor or a hidden score:
 * the product tells students that "questions answered and tutor feedback" move
 * it, and a number a student can recompute by hand is a number they can trust.
 *
 * Both answer sources count, because both are the student answering questions:
 *   - `test_sessions` carries `question_count` / `correct_count` per subject.
 *   - `quiz_attempts` carries one row per question, whose subject comes from the
 *     note it was generated from.
 *
 * The window is what makes it current rather than a lifetime average: a student
 * who was weak in September and is strong now should read as strong. The same
 * window, evaluated at successive week ends, is the progress timeseries — so the
 * graph and the number under it can never disagree.
 *
 * Everything here is pure. The SQL lives in routes/progress.ts; this file is the
 * arithmetic, so it can be tested without a database.
 */

/** Trailing days that count toward mastery. Four weeks: long enough to survive one bad day, short enough to be current. */
export const MASTERY_WINDOW_DAYS = 28;

/** Weeks of history the timeseries returns by default. */
export const TIMESERIES_DEFAULT_WEEKS = 12;
export const TIMESERIES_MAX_WEEKS = 52;

/** One scored event: a finished mock, or a single answered question. */
export interface AnswerRow {
  /** ISO-UTC instant, `2026-10-27T01:23:45Z` — the same fixed-width Z form every timestamp column uses, so string compare is time compare. */
  at: string;
  answered: number;
  correct: number;
  subject_id: number | null;
  user_id: number;
}

/**
 * Accuracy over `[from, to)`, as a whole percent, or null when the student
 * answered nothing in it. Null is not zero: "no data" and "got everything wrong"
 * must not render as the same bar.
 */
export function masteryPct(
  rows: readonly AnswerRow[],
  from: string,
  to: string,
  filter?: { user_id?: number; subject_id?: number },
): { pct: number | null; answered: number; correct: number } {
  let answered = 0;
  let correct = 0;
  for (const r of rows) {
    if (r.at < from || r.at >= to) continue;
    if (filter?.user_id !== undefined && r.user_id !== filter.user_id) continue;
    if (filter?.subject_id !== undefined && r.subject_id !== filter.subject_id) continue;
    answered += r.answered;
    correct += r.correct;
  }
  if (answered <= 0) return { pct: null, answered: 0, correct: 0 };
  // Clamped: a malformed row (correct > answered) must not produce 120%.
  const pct = Math.round((Math.min(correct, answered) / answered) * 100);
  return { pct, answered, correct };
}

/** Middle value, averaging the two middles on an even count. Null for an empty set. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Bucket ends, oldest first: `weeks` dates seven days apart, the last being
 * today in the student's own zone.
 *
 * These are rolling seven-day marks, NOT calendar weeks — a student looking at
 * the graph on a Wednesday should see a point for the week they are in, not wait
 * until Sunday for the line to move. Caller supplies `today` as a local
 * `YYYY-MM-DD` and the day arithmetic that produced it, so this stays pure.
 */
export function bucketEnds(
  today: string,
  weeks: number,
  addDays: (day: string, delta: number) => string,
): string[] {
  const count = Math.max(1, Math.min(TIMESERIES_MAX_WEEKS, Math.trunc(weeks) || 0));
  const ends: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) ends.push(addDays(today, -7 * i));
  return ends;
}
