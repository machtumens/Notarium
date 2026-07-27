import { describe, it, expect } from 'vitest';
import { computeSm2 } from '../routes/study';

// Baseline unit coverage for the SM-2 spaced-repetition engine. Prior to Phase 1
// `computeSm2` was covered only indirectly via the red-team study suite; this is
// the first dedicated test that exercises the pure computation directly.
describe('computeSm2', () => {
  it('quality=5 (perfect recall) on a fresh item returns a valid interval and ease_factor', () => {
    const result = computeSm2({ ease_factor: 2.5, interval_days: 1, repetitions: 0 }, 5);

    // First successful repetition keeps the interval at 1 day (SM-2 standard).
    expect(result.interval_days).toBe(1);
    // A perfect (quality=5) answer never lowers the ease factor below its start.
    expect(result.ease_factor).toBeGreaterThanOrEqual(2.5);
    // A success increments the repetition counter.
    expect(result.repetitions).toBe(1);
    // due_at is a valid ISO timestamp in the future.
    expect(Number.isNaN(Date.parse(result.due_at))).toBe(false);
  });

  it('quality<3 (failure) resets repetitions and floors the interval at 1 day', () => {
    const result = computeSm2({ ease_factor: 2.5, interval_days: 6, repetitions: 3 }, 2);

    expect(result.interval_days).toBe(1);
    expect(result.repetitions).toBe(0);
    // Ease factor never drops below the SM-2 floor of 1.3.
    expect(result.ease_factor).toBeGreaterThanOrEqual(1.3);
  });
});
