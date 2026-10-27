// The mastery arithmetic, with no database in the way.
//
// These are the cases the SQL cannot get wrong for us: what "no data" means,
// what a window boundary includes, and whether a median is a median.
import { describe, it, expect } from 'vitest';
import {
  MASTERY_WINDOW_DAYS,
  TIMESERIES_MAX_WEEKS,
  bucketEnds,
  masteryPct,
  median,
  type AnswerRow,
} from '../mastery';

const row = (over: Partial<AnswerRow> = {}): AnswerRow => ({
  at: '2026-10-20T08:00:00Z',
  answered: 10,
  correct: 5,
  subject_id: 1,
  user_id: 1,
  ...over,
});

/** Day arithmetic for bucketEnds, UTC and dependency-free — the real caller passes the zone-aware one. */
const addDays = (day: string, delta: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

describe('masteryPct', () => {
  it('is null, not zero, when nothing was answered', () => {
    const out = masteryPct([], '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z');
    expect(out).toEqual({ pct: null, answered: 0, correct: 0 });
  });

  it('distinguishes "answered nothing" from "got everything wrong"', () => {
    const wrong = masteryPct(
      [row({ answered: 4, correct: 0 })],
      '2026-10-01T00:00:00Z',
      '2026-11-01T00:00:00Z',
    );
    expect(wrong.pct).toBe(0);
    expect(wrong.answered).toBe(4);
  });

  it('sums both sources into one percentage', () => {
    // A 10-question mock at 50% plus four single attempts, three of them right:
    // 8 of 14 → 57%.
    const rows = [
      row({ answered: 10, correct: 5 }),
      row({ answered: 1, correct: 1 }),
      row({ answered: 1, correct: 1 }),
      row({ answered: 1, correct: 1 }),
      row({ answered: 1, correct: 0 }),
    ];
    const out = masteryPct(rows, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z');
    expect(out).toEqual({ pct: 57, answered: 14, correct: 8 });
  });

  it('includes the window start and excludes its end', () => {
    const from = '2026-10-10T00:00:00Z';
    const to = '2026-10-20T00:00:00Z';
    expect(masteryPct([row({ at: from })], from, to).answered).toBe(10);
    expect(masteryPct([row({ at: to })], from, to).answered).toBe(0);
    expect(masteryPct([row({ at: '2026-10-09T23:59:59Z' })], from, to).answered).toBe(0);
    expect(masteryPct([row({ at: '2026-10-19T23:59:59Z' })], from, to).answered).toBe(10);
  });

  it('filters by user and by subject independently', () => {
    const rows = [
      row({ user_id: 1, subject_id: 1, answered: 2, correct: 2 }),
      row({ user_id: 1, subject_id: 2, answered: 2, correct: 0 }),
      row({ user_id: 2, subject_id: 1, answered: 2, correct: 1 }),
    ];
    const span = ['2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'] as const;
    expect(masteryPct(rows, ...span, { user_id: 1 }).pct).toBe(50);
    expect(masteryPct(rows, ...span, { user_id: 1, subject_id: 1 }).pct).toBe(100);
    expect(masteryPct(rows, ...span, { user_id: 1, subject_id: 2 }).pct).toBe(0);
    expect(masteryPct(rows, ...span, { user_id: 2 }).pct).toBe(50);
  });

  it('counts a subject-less row (its note was deleted) in the overall but in no subject', () => {
    const rows = [
      row({ subject_id: null, answered: 2, correct: 2 }),
      row({ subject_id: 1, answered: 2, correct: 0 }),
    ];
    const span = ['2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'] as const;
    expect(masteryPct(rows, ...span).answered).toBe(4);
    expect(masteryPct(rows, ...span, { subject_id: 1 }).answered).toBe(2);
  });

  it('never exceeds 100% on a malformed row', () => {
    expect(masteryPct([row({ answered: 2, correct: 9 })], '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z').pct).toBe(100);
  });
});

describe('median', () => {
  it('is null for nobody', () => {
    expect(median([])).toBeNull();
  });

  it('takes the middle of an odd count, unsorted input included', () => {
    expect(median([70, 10, 40])).toBe(40);
  });

  it('averages the two middles of an even count', () => {
    expect(median([10, 40, 60, 70])).toBe(50);
  });

  it('is a median, not a mean — one outlier does not move it', () => {
    expect(median([50, 51, 52, 100000])).toBe(52);
  });
});

describe('bucketEnds', () => {
  it('ends today and steps back a week at a time, oldest first', () => {
    expect(bucketEnds('2026-10-27', 3, addDays)).toEqual(['2026-10-13', '2026-10-20', '2026-10-27']);
  });

  it('returns one point for one week', () => {
    expect(bucketEnds('2026-10-27', 1, addDays)).toEqual(['2026-10-27']);
  });

  it('clamps nonsense rather than returning nothing or everything', () => {
    expect(bucketEnds('2026-10-27', 0, addDays)).toHaveLength(1);
    expect(bucketEnds('2026-10-27', -5, addDays)).toHaveLength(1);
    expect(bucketEnds('2026-10-27', 9999, addDays)).toHaveLength(TIMESERIES_MAX_WEEKS);
  });

  it('crosses a month and a year boundary correctly', () => {
    expect(bucketEnds('2027-01-05', 2, addDays)).toEqual(['2026-12-29', '2027-01-05']);
  });
});

describe('the window constant', () => {
  it('is four weeks — the graph and the card share it', () => {
    expect(MASTERY_WINDOW_DAYS).toBe(28);
  });
});
