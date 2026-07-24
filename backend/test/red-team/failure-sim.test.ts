// Production Failure Simulation
// "Weird stuff on production" — degraded dependencies, corrupt KV, partial DB
// failure. The invariant: the Worker degrades gracefully (structured JSON error,
// security headers intact, no crash/hang, data not corrupted), never a raw 5xx
// that leaks internals or takes the process down.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('Failure sim: rate-limit KV degraded', () => {
  it('corrupt KV no longer disables the limiter — the DO enforces it independently', async () => {
    const ip = '20.0.0.1';
    // Poison the exact key the KV fallback would read. The DO limiter ignores KV,
    // so a corrupt KV value can no longer silently disable rate limiting.
    await env.RATE_LIMIT.put(`ratelimit:login:${ip}`, 'definitely-not-json{');
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      codes.push(
        (
          await call('/api/auth/login', {
            body: { email: 'x@sekolahkristencalvin.org', password: 'y' },
            ip,
          })
        ).status,
      );
    }
    // The DO still throttles the burst despite the corrupt KV value (5/window)...
    expect(codes.some((c) => c === 429)).toBe(true);
    // ...and never returns a 5xx.
    expect(codes.every((c) => c < 500)).toBe(true);
  });
});

describe('Failure sim: AI provider unavailable (no key / rotated / down)', () => {
  it('auto-tags degrades to safe default tags instead of erroring the request', async () => {
    const u = await seedUser();
    const res = await call('/api/gemini/auto-tags', {
      token: u.token,
      body: { title: 'Bio', content: 'cells' },
      ip: '20.0.0.2',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(Array.isArray(json.tags)).toBe(true);
    expect(json.tags.length).toBeGreaterThan(0); // fell back to defaults, no crash
  });

  it('a summarize call with the provider down leaves the note row intact (journey 8 essence)', async () => {
    const u = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(u.id, subj, { title: 'Keep me', content: 'important' });
    // No AI key configured -> endpoint either falls back or errors, but must not
    // delete/mutate the note.
    const res = await call(`/api/notes/${noteId}/summary`, {
      method: 'POST',
      token: u.token,
      body: { content: 'important', title: 'Keep me' },
    });
    expect(res.status).toBeLessThanOrEqual(500);
    const row = (await env.DB.prepare('SELECT id, title FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;
    expect(row).not.toBeNull();
    expect(row.title).toBe('Keep me');
  });
});

describe('Failure sim: partial D1 failure', () => {
  it('a missing table mid-request yields a structured 5xx, and the Worker recovers on the next call', async () => {
    const owner = await seedUser();
    const liker = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj, { likes: 0 });

    // Simulate a broken/partial schema: drop the table the like path writes to.
    await env.DB.prepare('DROP TABLE IF EXISTS note_likes').run();
    const broken = await call(`/api/notes/${noteId}/like`, { method: 'POST', token: liker.token });
    // Graceful failure: a 5xx with a JSON body, NOT a hang or an HTML stack trace.
    expect(broken.status).toBeGreaterThanOrEqual(500);
    const ct = broken.headers.get('Content-Type') || '';
    expect(ct).toContain('application/json');
    const body = await broken.text();
    expect(body).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no raw stack frames leaked

    // Recover the table so the Worker (and later tests) are healthy again.
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS note_likes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         note_id INTEGER NOT NULL,
         user_id INTEGER NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    ).run();
    const healthy = await call('/api/leaderboard', { ip: '20.0.0.3' });
    expect(healthy.status).toBe(200);
  });
});

describe('Failure sim: error-path hardening', () => {
  it('error responses still carry the security headers (defence-in-depth is not skipped on failure)', async () => {
    const res = await call('/api/auth/login', {
      body: { email: 'x', password: 'y' },
      ip: '20.0.0.4',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
  });

  it('an unknown route degrades cleanly (no 5xx, structured or empty body)', async () => {
    const res = await call('/api/totally/unknown/route', { ip: '20.0.0.5' });
    expect(res.status).toBeLessThan(500);
  });
});
