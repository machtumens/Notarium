// Gap-closing suite: D64/70/71, F93/94/99-102/104/108, G114/115/119.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

const badLogin = (ip: string) =>
  call('/api/auth/login', {
    body: { email: 'nobody@sekolahkristencalvin.org', password: 'x' },
    ip,
  });

describe('D64/70/71 — rate-limit window, KV outage, missing IP', () => {
  it('D64: once the window’s timestamps age out, the counter effectively resets', async () => {
    const ip = '41.0.0.1';
    // Pre-seed the KV key with 5 timestamps from well beyond the 900s window.
    const old = Math.floor(Date.now() / 1000) - 5000;
    await env.RATE_LIMIT.put(`ratelimit:login:${ip}`, JSON.stringify([old, old, old, old, old]));
    // Those are filtered out as stale, so a fresh attempt is admitted (not 429).
    expect((await badLogin(ip)).status).not.toBe(429);
  });

  it('D70 FINDING: a throwing KV binding fails OPEN (login still served, never 5xx)', async () => {
    const realKv = env.RATE_LIMIT;
    // Swap in a KV stub whose .get throws, mimicking a KV outage.
    (env as any).RATE_LIMIT = {
      get: () => {
        throw new Error('KV down');
      },
      put: async () => {},
      list: async () => ({ keys: [] }),
      delete: async () => {},
    };
    try {
      const res = await badLogin('41.0.0.2');
      expect(res.status).not.toBe(429); // fail-open: request proceeds
      expect(res.status).toBeLessThan(500);
    } finally {
      (env as any).RATE_LIMIT = realKv;
    }
  });

  it('D71: a request with no CF-Connecting-IP is handled (falls back to "unknown", no crash)', async () => {
    const res = await call('/api/auth/login', {
      body: { email: 'x@sekolahkristencalvin.org', password: 'y' },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe('F93/94 — published visible, drafts hidden in subject listings', () => {
  it('F93: a published note appears in its subject listing', async () => {
    const author = await seedUser();
    const reader = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(author.id, subj, { title: 'Pub', status: 'published' });
    const res = await call(`/api/notes/subject/${subj}`, { token: reader.token });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).notes.map((n: any) => n.id)).toContain(id);
  });

  it('F94: a draft note is NOT listed under its subject (status filter = published only)', async () => {
    const author = await seedUser();
    const reader = await seedUser();
    const subj = await seedSubject();
    const draftId = await seedNote(author.id, subj, { title: 'Draft', status: 'draft' });
    const res = await call(`/api/notes/subject/${subj}`, { token: reader.token });
    expect(((await res.json()) as any).notes.map((n: any) => n.id)).not.toContain(draftId);
  });
});

describe('F99-102 — soft-delete / restore lifecycle (documents the half-built feature)', () => {
  it('F99 FINDING: no user/admin endpoint sets deleted_at — deletes are HARD (soft-delete SET path is absent)', async () => {
    const owner = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(owner.id, subj);
    await call(`/api/notes/${id}`, { method: 'DELETE', token: owner.token });
    // The row is gone entirely (hard delete), not merely flagged with deleted_at.
    const row = await env.DB.prepare('SELECT id, deleted_at FROM notes WHERE id = ?')
      .bind(id)
      .first();
    expect(row).toBeNull();
  });

  it('F101/102: admin restore clears deleted_at and preserves likes (restore path works)', async () => {
    const admin = await seedUser({ role: 'admin', admin_role: 'super' });
    const owner = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(owner.id, subj, { likes: 4 });
    // Put it into the soft-deleted state manually (the only way, since no setter exists).
    await env.DB.prepare('UPDATE notes SET deleted_at = datetime("now") WHERE id = ?')
      .bind(id)
      .run();
    const res = await call(`/api/admin/notes/${id}/restore`, {
      method: 'POST',
      token: admin.token,
    });
    expect(res.status).toBeLessThan(300);
    const row = (await env.DB.prepare('SELECT deleted_at, likes FROM notes WHERE id = ?')
      .bind(id)
      .first()) as any;
    expect(row.deleted_at).toBeNull(); // F101 restore clears
    expect(row.likes).toBe(4); // F102 likes preserved
  });
});

describe('F104/105/108 — publish + concurrent edit', () => {
  it('F105: publishing a draft flips status to published and clears any schedule', async () => {
    const owner = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(owner.id, subj, { status: 'draft' });
    await env.DB.prepare(
      'UPDATE notes SET scheduled_publish_at = datetime("now","+1 day") WHERE id = ?',
    )
      .bind(id)
      .run();
    const res = await call(`/api/notes/${id}/publish`, { method: 'POST', token: owner.token });
    expect(res.status).toBeLessThan(300);
    const row = (await env.DB.prepare('SELECT status, scheduled_publish_at FROM notes WHERE id = ?')
      .bind(id)
      .first()) as any;
    expect(row.status).toBe('published');
    expect(row.scheduled_publish_at).toBeNull();
  });

  it('F104: a scheduled (future) draft is not listed publicly until published', async () => {
    const author = await seedUser();
    const reader = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(author.id, subj, { status: 'draft' });
    await env.DB.prepare(
      'UPDATE notes SET scheduled_publish_at = datetime("now","+1 day") WHERE id = ?',
    )
      .bind(id)
      .run();
    const res = await call(`/api/notes/subject/${subj}`, { token: reader.token });
    expect(((await res.json()) as any).notes.map((n: any) => n.id)).not.toContain(id);
  });

  it('F108: concurrent edits by the owner never 5xx and leave a consistent title', async () => {
    const owner = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(owner.id, subj, { title: 'orig' });
    const results = await Promise.all(
      ['A', 'B', 'C', 'D'].map((t) =>
        call(`/api/notes/${id}`, { method: 'PUT', token: owner.token, body: { title: t } }),
      ),
    );
    expect(results.every((r) => r.status < 500)).toBe(true);
    const row = (await env.DB.prepare('SELECT title FROM notes WHERE id = ?')
      .bind(id)
      .first()) as any;
    expect(['A', 'B', 'C', 'D', 'orig']).toContain(row.title); // one writer won, no corruption
  });
});

describe('G114/115/119 — like-deleted, hidden-note, admin override', () => {
  it('G114: liking a hard-deleted note does not succeed as a normal like', async () => {
    const owner = await seedUser();
    const liker = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(owner.id, subj);
    await call(`/api/notes/${id}`, { method: 'DELETE', token: owner.token }); // hard delete
    const res = await call(`/api/notes/${id}/like`, { method: 'POST', token: liker.token });
    // note row is gone; the like must not report a real toggled like on a missing note
    const json = res.ok ? ((await res.json()) as any) : null;
    expect(res.status >= 400 || json?.liked !== true).toBe(true);
  });

  it('G115: a draft note by another user is not exposed via the subject listing', async () => {
    const author = await seedUser();
    const attacker = await seedUser();
    const subj = await seedSubject();
    const draftId = await seedNote(author.id, subj, { status: 'draft' });
    const res = await call(`/api/notes/subject/${subj}`, { token: attacker.token });
    expect(((await res.json()) as any).notes.map((n: any) => n.id)).not.toContain(draftId);
  });

  it('G119: an admin CAN delete another user’s note (ownership override by design)', async () => {
    const admin = await seedUser({ role: 'admin', admin_role: 'super' });
    const owner = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(owner.id, subj);
    const res = await call(`/api/admin/notes/${id}`, { method: 'DELETE', token: admin.token });
    expect(res.status).toBeLessThan(300);
    expect(await env.DB.prepare('SELECT id FROM notes WHERE id = ?').bind(id).first()).toBeNull();
  });
});
