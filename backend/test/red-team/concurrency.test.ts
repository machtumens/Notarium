// Concurrency tests — the "weird stuff on production" surface. Notes/likes use
// read-modify-write over D1 without transactions, so these probe for lost updates
// and duplicate rows under simultaneous access.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  applySchema,
  resetData,
  call,
  seedUser,
  seedSubject,
  seedNote,
  uniqueEmail,
  env,
} from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('Concurrency & consistency', () => {
  it('N distinct users liking one note concurrently: like count stays consistent with rows', async () => {
    const owner = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj, { likes: 0 });
    const likers = await Promise.all(Array.from({ length: 20 }, () => seedUser()));
    await Promise.all(
      likers.map((u) => call(`/api/notes/${noteId}/like`, { method: 'POST', token: u.token })),
    );
    const note = (await env.DB.prepare('SELECT likes FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;
    const rows = (await env.DB.prepare('SELECT COUNT(*) AS c FROM note_likes WHERE note_id = ?')
      .bind(noteId)
      .first()) as any;
    // The denormalised `likes` counter should match the number of like rows. A gap
    // here is a lost-update finding from the non-atomic UPDATE ... SET likes = likes + 1.
    expect(note.likes, `counter=${note.likes} rows=${rows.c}`).toBe(rows.c);
  });

  it('the same user liking a note 10x concurrently must not create 10 like rows (idempotent)', async () => {
    const owner = await seedUser();
    const liker = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj, { likes: 0 });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        call(`/api/notes/${noteId}/like`, { method: 'POST', token: liker.token }),
      ),
    );
    const rows = (await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM note_likes WHERE note_id = ? AND user_id = ?',
    )
      .bind(noteId, liker.id)
      .first()) as any;
    // Toggle semantics under a race can leave 0 or 1 rows but never >1.
    expect(rows.c).toBeLessThanOrEqual(1);
  });

  it('simultaneous signup with the SAME email admits at most one account', async () => {
    const email = uniqueEmail('race');
    const bodies = Array.from({ length: 5 }, (_, i) => ({
      name: 'R',
      email,
      password: 'ValidPass123',
      ip: `13.0.0.${i}`,
    }));
    const results = await Promise.all(
      bodies.map((b) =>
        call('/api/auth/signup', {
          body: { name: b.name, email: b.email, password: b.password },
          ip: b.ip,
        }),
      ),
    );
    const created = results.filter((r) => r.status === 201).length;
    const rows = (await env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE email = ?')
      .bind(email)
      .first()) as any;
    // The UNIQUE(email) constraint must guarantee exactly one row regardless of the
    // race. `created` may briefly show >1 successful responses if the existence check
    // races the insert — but the DB must still hold only one row.
    expect(rows.c, `unique constraint should hold (created responses=${created})`).toBe(1);
  });

  it('concurrent delete of the same note by its owner never 5xx-crashes', async () => {
    const owner = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        call(`/api/notes/${noteId}`, { method: 'DELETE', token: owner.token }),
      ),
    );
    expect(results.every((r) => r.status < 500)).toBe(true);
  });
});
