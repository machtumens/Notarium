import { describe, it, expect } from 'vitest';
import { computeSm2 } from '../routes/study';

const WIB = 'Asia/Jakarta'; // UTC+7, no DST

// Baseline unit coverage for the SM-2 spaced-repetition engine. Prior to Phase 1
// `computeSm2` was covered only indirectly via the red-team study suite; this is
// the first dedicated test that exercises the pure computation directly.
describe('computeSm2', () => {
  it('quality=5 (perfect recall) on a fresh item returns a valid interval and ease_factor', () => {
    const result = computeSm2({ ease_factor: 2.5, interval_days: 1, repetitions: 0 }, 5, WIB);

    // First successful repetition keeps the interval at 1 day (SM-2 standard).
    expect(result.interval_days).toBe(1);
    // A perfect (quality=5) answer never lowers the ease factor below its start.
    expect(result.ease_factor).toBeGreaterThanOrEqual(2.5);
    // A success increments the repetition counter.
    expect(result.repetitions).toBe(1);
    // due_at is a valid ISO timestamp in the future.
    expect(Number.isNaN(Date.parse(result.due_at))).toBe(false);
    expect(Date.parse(result.due_at)).toBeGreaterThan(Date.now());
  });

  it('quality<3 (failure) resets repetitions and floors the interval at 1 day', () => {
    const result = computeSm2({ ease_factor: 2.5, interval_days: 6, repetitions: 3 }, 2, WIB);

    expect(result.interval_days).toBe(1);
    expect(result.repetitions).toBe(0);
    // Ease factor never drops below the SM-2 floor of 1.3.
    expect(result.ease_factor).toBeGreaterThanOrEqual(1.3);
  });
});

// F2 — due dates are anchored to the start of a local day, not to an instant
// offset from the review. The clock is injected rather than faked so these run
// identically on a machine in Jakarta and on a CI box in UTC.
describe('computeSm2 due dates (F2)', () => {
  const fresh = { ease_factor: 2.5, interval_days: 0, repetitions: 0 };

  it('a 23:00-local review with interval 1 comes due at local midnight, not 23:00 tomorrow', () => {
    const at = new Date('2026-08-03T16:00:00Z'); // Mon 23:00 WIB
    const { due_at, interval_days } = computeSm2(fresh, 5, WIB, at);

    expect(interval_days).toBe(1);
    // Tue 00:00 WIB === Mon 17:00Z — one hour after the review, not 24.
    expect(due_at).toBe('2026-08-03T17:00:00Z');
    // The old behaviour (instant + 1 day) would have produced Tue 23:00 WIB.
    expect(due_at).not.toBe('2026-08-04T16:00:00Z');
  });

  it('is due AT local midnight and not a moment before', () => {
    const at = new Date('2026-08-03T16:00:00Z');
    const { due_at } = computeSm2(fresh, 5, WIB, at);
    const due = Date.parse(due_at);

    // 23:59:59 local on the review day: not yet due.
    expect(Date.parse('2026-08-03T16:59:59Z')).toBeLessThan(due);
    // 00:01 local the next day: due.
    expect(Date.parse('2026-08-03T17:01:00Z')).toBeGreaterThan(due);
  });

  it('the hour of review no longer changes the due date — only the local day does', () => {
    // 06:00 and 23:00 on the SAME local day must schedule identically. Under the
    // old instant-offset rule these differed by seventeen hours, which is how a
    // student studying at a consistent hour drifted later every cycle.
    const morning = computeSm2(fresh, 5, WIB, new Date('2026-08-02T23:00:00Z')); // Mon 06:00 WIB
    const night = computeSm2(fresh, 5, WIB, new Date('2026-08-03T16:00:00Z')); // Mon 23:00 WIB

    expect(morning.due_at).toBe(night.due_at);
  });

  it('the same instant schedules differently for users in different zones', () => {
    const at = new Date('2026-08-03T16:00:00Z');
    const jakarta = computeSm2(fresh, 5, WIB, at); // already Tue 04-Aug? no: Mon 23:00
    const utc = computeSm2(fresh, 5, 'UTC', at); // still Mon 16:00 UTC

    // Both land on "the start of tomorrow", but tomorrow starts at a different
    // instant in each zone — which is the whole point of a per-user timezone.
    expect(jakarta.due_at).toBe('2026-08-03T17:00:00Z'); // Tue 00:00 +07
    expect(utc.due_at).toBe('2026-08-04T00:00:00Z'); // Tue 00:00 UTC
  });
});
