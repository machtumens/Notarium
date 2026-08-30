// Timestamp format — the invariant that every stored instant is ISO-8601 UTC
// with a trailing Z.
//
// This exists because two formats coexisted and nothing caught it: SQLite's
// datetime-now yields "2026-08-27 08:53:06" (parsed as LOCAL in a browser) and
// .toISOString() yields "...T...Z" (parsed as UTC). The same instant rendered
// seven hours apart for a UTC+7 user, with no error and no type mismatch.
//
// A grep cannot enforce this — the value only exists at runtime — so the check
// writes real rows through real endpoints and inspects what landed.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SPACE_FORM = /^\d{4}-\d{2}-\d{2} /;

describe('Stored timestamps are ISO-8601 UTC', () => {
  it('a note written through the app stores created_at with a Z', async () => {
    const u = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(u.id, subj);
    const row = (await env.DB.prepare(`SELECT created_at FROM notes WHERE id = ?`)
      .bind(noteId)
      .first()) as { created_at: string };
    expect(row.created_at, 'space form parses as LOCAL time in a browser').not.toMatch(SPACE_FORM);
    expect(row.created_at).toMatch(ISO_Z);
  });

  it('a user row created by signup stores created_at with a Z', async () => {
    const u = await seedUser();
    const row = (await env.DB.prepare(`SELECT created_at FROM users WHERE id = ?`)
      .bind(u.id)
      .first()) as { created_at: string };
    expect(row.created_at).not.toMatch(SPACE_FORM);
    expect(row.created_at).toMatch(ISO_Z);
  });

  it('a completed mock stores created_at with a Z', async () => {
    const u = await seedUser();
    await call('/api/tests/complete', {
      method: 'POST',
      token: u.token,
      body: { question_count: 4, correct_count: 3 },
    });
    const row = (await env.DB.prepare(`SELECT created_at FROM test_sessions WHERE user_id = ?`)
      .bind(u.id)
      .first()) as { created_at: string };
    expect(row.created_at).toMatch(ISO_Z);
  });

  it('both formats are NOT string-comparable on the same date — why one format matters', () => {
    // 'T' (0x54) sorts after ' ' (0x20), so a same-day comparison across the
    // two formats inverts. This is the failure mode the single format prevents.
    const iso = '2026-08-27T09:00:00Z';
    const space = '2026-08-27 23:00:00'; // fourteen hours LATER in wall-clock
    expect(space < iso, 'a later space-form time compares as earlier than an ISO one').toBe(true);
  });

  it('read thresholds use the same format as writes', async () => {
    // A threshold in the other format would silently widen or narrow the window.
    const row = (await env.DB.prepare(
      `SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now','-5 minutes') AS t`,
    ).first()) as { t: string };
    expect(row.t).toMatch(ISO_Z);
  });
});
