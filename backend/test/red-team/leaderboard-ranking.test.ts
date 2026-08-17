// Leaderboard ranking order — Paperloop Phase 3. Proves the /api/leaderboard
// endpoint returns users ordered by learning_points DESC (the learning-first
// ranking swap), NOT the legacy notes+likes+upvotes contributor formula.
//
// seedUser() does not accept learning_points, so we seed 3 users then set
// distinct learning_points directly via env.DB — the same direct-DB mutation
// idiom used elsewhere in this suite (journeys.test.ts:121 `UPDATE notes SET
// deleted_at ...`, gaps-study-admin.test.ts:48, gaps-ratelimit-notes-idor.test.ts).
// The endpoint's SELECT does not return `id` or a distinct display_name per user
// (all seeded students share 'Student User'), so seeded rows are located back by
// their distinct learning_points values, which ARE returned.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('Leaderboard ranking: ORDER BY learning_points DESC', () => {
  it('returns users ordered by learning_points descending', async () => {
    // Seed 3 students, then assign distinct learning_points out of natural order
    // (low seeded first, high second, mid third) so a stable-insert-order bug
    // could not accidentally pass this test.
    const low = await seedUser();
    const high = await seedUser();
    const mid = await seedUser();

    await env.DB.prepare('UPDATE users SET learning_points = ? WHERE id = ?')
      .bind(10, low.id)
      .run();
    await env.DB.prepare('UPDATE users SET learning_points = ? WHERE id = ?')
      .bind(50, high.id)
      .run();
    await env.DB.prepare('UPDATE users SET learning_points = ? WHERE id = ?')
      .bind(30, mid.id)
      .run();

    const res = await call('/api/leaderboard', { ip: '40.0.0.1' });
    expect(res.status).toBe(200);
    const board = ((await res.json()) as any).leaderboard as any[];

    // learning_points in the exact order the endpoint returned them.
    const returnedPoints = board.map((r) => r.learning_points as number);

    // Global invariant: the ORDER BY must yield a non-increasing sequence across
    // every returned row.
    for (let i = 1; i < returnedPoints.length; i++) {
      expect(
        returnedPoints[i - 1],
        'leaderboard must be sorted by learning_points descending',
      ).toBeGreaterThanOrEqual(returnedPoints[i]);
    }

    // And specifically: our 3 seeded users (the only non-admin rows this test
    // creates) come back highest-first — 50, then 30, then 10.
    expect(returnedPoints).toEqual([50, 30, 10]);
  });
});
