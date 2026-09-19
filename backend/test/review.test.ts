/**
 * Wave 1 follow-up regression suite (W1.11–W1.15): the merged Phase 4 review
 * findings on the Worker. Written RED before each fix; every block asserts the
 * post-fix contract.
 */
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminLogin, api, initTestDatabase, json, signup, uniqueEmail } from './setup';

beforeAll(initTestDatabase);

async function userCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first<{ c: number }>();
  return row?.c ?? 0;
}

let ipCounter = 0;
/** A fresh client IP per test so the KV rate limiter buckets never bleed between tests. */
function freshIp(): string {
  ipCounter += 1;
  return `172.16.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

const adminEmail = () => uniqueEmail('admin').replace('@example.test', '@notarium.site');

// ---------------------------------------------------------------------------
describe('W1.11 — rate limit + constant-time compare on admin-login and admin verify', () => {
  it('POST /api/auth/admin-login: wrong password → 401 and no users row is created', async () => {
    const before = await userCount();
    const res = await api('/api/auth/admin-login', {
      headers: { 'CF-Connecting-IP': freshIp() },
      body: { email: adminEmail(), password: 'not-the-admin-password', class: '10.1' },
    });
    expect(res.status).toBe(401);
    expect(await userCount()).toBe(before);
  });

  it('POST /api/auth/admin-login: 6th attempt from one IP inside the window → 429', async () => {
    const ip = freshIp();
    const email = adminEmail();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await api('/api/auth/admin-login', { headers: { 'CF-Connecting-IP': ip }, body: { email, password: 'wrong', class: '10.1' } });
      expect(res.status, `attempt ${attempt}`).toBe(401);
    }
    const sixth = await api('/api/auth/admin-login', { headers: { 'CF-Connecting-IP': ip }, body: { email, password: env.ADMIN_PASSWORD, class: '10.1' } });
    expect(sixth.status).toBe(429);
    // the right password from the throttled IP still does not get in
    expect((await json(sixth)).error).toBeDefined();
  });

  it('POST /api/admin/verify: wrong password → 401; 6th attempt from one IP → 429', async () => {
    const ip = freshIp();
    const email = adminEmail();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await api('/api/admin/verify', { headers: { 'CF-Connecting-IP': ip }, body: { email, password: 'wrong' } });
      expect(res.status, `attempt ${attempt}`).toBe(401);
      expect((await json(res)).isAdmin).toBe(false);
    }
    const sixth = await api('/api/admin/verify', { headers: { 'CF-Connecting-IP': ip }, body: { email, password: env.ADMIN_PASSWORD } });
    expect(sixth.status).toBe(429);
  });

  it('both endpoints guard the same secret, so they share one bucket per IP', async () => {
    const ip = freshIp();
    const email = adminEmail();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await api('/api/auth/admin-login', { headers: { 'CF-Connecting-IP': ip }, body: { email, password: 'wrong', class: '10.1' } });
    }
    const verify = await api('/api/admin/verify', { headers: { 'CF-Connecting-IP': ip }, body: { email, password: env.ADMIN_PASSWORD } });
    expect(verify.status).toBe(429);
  });

  it('a password that is a prefix / a different length of the real one → 401 (compare is by digest, never by length)', async () => {
    const ip = freshIp();
    const real = env.ADMIN_PASSWORD;
    for (const password of [real.slice(0, -1), `${real}x`, '', real.toUpperCase()]) {
      const res = await api('/api/admin/verify', { headers: { 'CF-Connecting-IP': ip }, body: { email: adminEmail(), password } });
      expect(res.status, JSON.stringify(password)).toBe(401);
    }
  });

  it('a body without an email → 401, not 500', async () => {
    const res = await api('/api/auth/admin-login', { headers: { 'CF-Connecting-IP': freshIp() }, body: { password: 'x' } });
    expect(res.status).toBe(401);
  });

  it('the right password from a fresh IP still logs in (200 + admin JWT)', async () => {
    const session = await adminLogin();
    expect(session.user.role).toBe('admin');
    expect(session.token.split('.')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
describe('W1.12 — role, suspension and existence are re-verified from the DB on every bearer route', () => {
  const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  /** Re-encode the payload with `patch` applied but keep the original header + signature. */
  function tamper(token: string, patch: Record<string, unknown>): string {
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const forged = btoa(JSON.stringify({ ...claims, ...patch })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${header}.${forged}.${signature}`;
  }

  it('admin JWT whose users row was demoted to role=student → 403 on GET /api/admin/users', async () => {
    const admin = await adminLogin();
    expect((await api('/api/admin/users', { token: admin.token })).status).toBe(200);
    await env.DB.prepare("UPDATE users SET role = 'student' WHERE id = ?").bind(admin.user.id).run();
    const res = await api('/api/admin/users', { token: admin.token });
    expect(res.status).toBe(403);
  });

  it("a deleted user's still-valid JWT → 401 on user routes", async () => {
    const ghost = await signup(uniqueEmail('ghost'));
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(ghost.user.id).run();
    expect((await api('/api/notes/my-notes', { token: ghost.token })).status).toBe(401);
    expect((await api('/api/auth/profile', { method: 'PUT', token: ghost.token, body: { display_name: 'back' } })).status).toBe(401);
    expect((await api('/api/user/me', { token: ghost.token })).status).toBe(401);
  });

  it('a suspended user → 403 "Account suspended" on POST /api/notes and POST /api/chat/sessions', async () => {
    const user = await signup(uniqueEmail('suspended'));
    await env.DB.prepare("UPDATE users SET suspended = 1, suspension_end_date = ?, suspension_reason = 'test' WHERE id = ?")
      .bind(inDays(3), user.user.id).run();

    const note = await api('/api/notes', { token: user.token, body: { title: 't', content: 'c', subject_id: 1 } });
    expect(note.status).toBe(403);
    expect((await json(note)).error).toBe('Account suspended');
    const chat = await api('/api/chat/sessions', { token: user.token, body: { subject: 's', topic: 't' } });
    expect(chat.status).toBe(403);
    expect((await json(chat)).error).toBe('Account suspended');
    // the getUserFromToken path (chat ownership gate) is covered by the same check
    expect((await api('/api/chat/sessions/1/messages', { token: user.token })).status).toBe(403);
    const rows = await env.DB.prepare('SELECT COUNT(*) AS c FROM notes WHERE author_id = ?').bind(user.user.id).first<{ c: number }>();
    expect(rows?.c ?? 0).toBe(0);
  });

  it('a suspension whose end date has passed no longer blocks', async () => {
    const user = await signup(uniqueEmail('expired'));
    await env.DB.prepare("UPDATE users SET suspended = 1, suspension_end_date = ? WHERE id = ?").bind(inDays(-1), user.user.id).run();
    expect((await api('/api/chat/sessions', { token: user.token, body: { subject: 's', topic: 't' } })).status).toBe(200);
  });

  it('tampered JWT (payload re-encoded, original signature) → 401 on PUT /api/auth/profile', async () => {
    const victim = await signup(uniqueEmail('victim'), 'Victim');
    const attacker = await signup(uniqueEmail('attacker'));
    const forged = tamper(attacker.token, { id: victim.user.id, role: 'admin' });
    expect(forged.split('.')).toHaveLength(3);
    const res = await api('/api/auth/profile', { method: 'PUT', token: forged, body: { display_name: 'pwned' } });
    expect(res.status).toBe(401);
    expect((await json(await api('/api/auth/me', { token: victim.token }))).user.name).toBe('Victim');
    expect((await api('/api/admin/users', { token: forged })).status).toBe(403);
  });

  it("an admin JWT for user A cannot read user B's chat session → 403 (no admin bypass, intentional)", async () => {
    const admin = await adminLogin();
    const b = await signup(uniqueEmail('b'));
    const created = await api('/api/chat/sessions', { token: b.token, body: { subject: 'Fisika', topic: 'Gaya' } });
    const session = (await json(created)).session as { id: number };
    expect((await api(`/api/chat/sessions/${session.id}/messages`, { token: admin.token })).status).toBe(403);
    expect((await api(`/api/chat/sessions/${session.id}/messages`, { token: admin.token, body: { role: 'user', content: 'x' } })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('W1.13 — no password_hash, encrypted_yw_id or author email in responses', () => {
  it('GET /api/user/me carries neither password_hash nor encrypted_yw_id', async () => {
    const me = await signup(uniqueEmail('me'));
    await env.DB.prepare('UPDATE users SET encrypted_yw_id = ? WHERE id = ?').bind('yw-secret-me-1', me.user.id).run();
    const res = await api('/api/user/me', { token: me.token });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('$2'); // bcrypt marker
    expect(text).not.toContain('encrypted_yw_id');
    expect(text).not.toContain('yw-secret-me-1');
    const { user } = JSON.parse(text);
    expect(user.id).toBe(me.user.id);
    expect(user.email).toBe(me.user.email);
    expect(user.role).toBe('student');
  });

  it('GET /api/auth/me carries neither password_hash nor encrypted_yw_id', async () => {
    const me = await signup(uniqueEmail('me'));
    await env.DB.prepare('UPDATE users SET encrypted_yw_id = ? WHERE id = ?').bind('yw-secret-me-2', me.user.id).run();
    const res = await api('/api/auth/me', { token: me.token });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('$2');
    expect(text).not.toContain('encrypted_yw_id');
    expect(text).not.toContain('yw-secret-me-2');
  });

  it('GET /api/notes/search drops author_email (F11)', async () => {
    const author = await signup(uniqueEmail('author'), 'Search Author');
    const marker = `zq${Date.now().toString(36)}`;
    const created = await api('/api/notes', { token: author.token, body: { title: `Note ${marker}`, content: 'body', subject_id: 1 } });
    expect(created.status).toBe(200);

    const reader = await signup(uniqueEmail('reader'));
    const res = await api(`/api/notes/search?q=${marker}`, { token: reader.token });
    expect(res.status).toBe(200);
    const text = await res.text();
    const { notes } = JSON.parse(text) as { notes: Record<string, unknown>[] };
    expect(notes.length).toBeGreaterThan(0);
    expect(text).not.toContain('author_email');
    expect(text).not.toContain(author.user.email);
    expect(notes[0].author_name).toBe('Search Author');
  });
});

// ---------------------------------------------------------------------------
describe('W1.14 — non-destructive user update; profile photo parity; description cap; chat + suspend/warn validation', () => {
  const dataUrl = (chars: number, mime = 'png') => `data:image/${mime};base64,${'A'.repeat(chars)}`;

  it('POST /api/user/update with {display_name} leaves email (and the other fields) intact; email is not writable', async () => {
    const me = await signup(uniqueEmail('keep'), 'Before');
    await env.DB.prepare("UPDATE users SET photo_url = 'https://cdn.example.test/a.png', description = 'bio' WHERE id = ?").bind(me.user.id).run();

    const res = await api('/api/user/update', { token: me.token, body: { display_name: 'After' } });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT display_name, email, photo_url, description FROM users WHERE id = ?').bind(me.user.id).first<any>();
    expect(row).toMatchObject({ display_name: 'After', email: me.user.email, photo_url: 'https://cdn.example.test/a.png', description: 'bio' });

    const hijack = await api('/api/user/update', { token: me.token, body: { email: 'other@example.test', display_name: 'X' } });
    expect(hijack.status).toBe(200);
    const after = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(me.user.id).first<{ email: string }>();
    expect(after?.email).toBe(me.user.email);
  });

  it('PUT /api/auth/profile accepts the old frontend\'s base64 avatar (1.9 MB data URL, the D1 row limit) and stores it', async () => {
    const me = await signup(uniqueEmail('avatar'));
    // D1 caps any string/row at 2,000,000 bytes — 1.9 MB is the largest avatar that can be stored at all.
    const photo = dataUrl(1_900_000 - 'data:image/png;base64,'.length);
    const res = await api('/api/auth/profile', { method: 'PUT', token: me.token, body: { photo_url: photo } });
    expect(res.status).toBe(200);
    const stored = await env.DB.prepare('SELECT photo_url FROM users WHERE id = ?').bind(me.user.id).first<{ photo_url: string }>();
    expect(stored?.photo_url).toBe(photo);
    expect((await json(await api('/api/auth/me', { token: me.token }))).user.photo_url).toBe(photo);
  });

  it('PUT /api/auth/profile photo_url: https URL ≤500 → 200; http, gif, oversized data URL, bare junk → 400', async () => {
    const me = await signup(uniqueEmail('avatar'));
    const ok = await api('/api/auth/profile', { method: 'PUT', token: me.token, body: { photo_url: 'https://cdn.example.test/me.webp' } });
    expect(ok.status).toBe(200);
    for (const [label, photo_url] of [
      ['http url', 'http://cdn.example.test/me.png'],
      ['https over 500 chars', `https://cdn.example.test/${'a'.repeat(500)}`],
      ['gif data url', dataUrl(64, 'gif')],
      ['data url over the 1.9 MB cap (would hit SQLITE_TOOBIG)', dataUrl(1_900_001)],
      ['not a url', 'not a url'],
    ] as const) {
      const res = await api('/api/auth/profile', { method: 'PUT', token: me.token, body: { photo_url } });
      expect(res.status, label).toBe(400);
    }
    const stored = await env.DB.prepare('SELECT photo_url FROM users WHERE id = ?').bind(me.user.id).first<{ photo_url: string }>();
    expect(stored?.photo_url).toBe('https://cdn.example.test/me.webp');
  });

  it('POST /api/notes with a 1200-char description succeeds and stores the first 1000 chars', async () => {
    const me = await signup(uniqueEmail('long'));
    const description = 'd'.repeat(1200);
    const res = await api('/api/notes', { token: me.token, body: { title: 'Long description', content: 'c', subject_id: 1, description } });
    expect(res.ok).toBe(true);
    const body = await json(res);
    expect(body.success).toBe(true);
    const stored = await env.DB.prepare('SELECT description FROM notes WHERE id = ?').bind(body.note.id).first<{ description: string }>();
    expect(stored?.description.length).toBe(1000);
    expect(stored?.description).toBe('d'.repeat(1000));
  });

  it('PUT /api/notes/:id keeps rejecting a description over 1000 (no silent truncation on edits)', async () => {
    const me = await signup(uniqueEmail('edit'));
    const created = await json(await api('/api/notes', { token: me.token, body: { title: 't', content: 'c', subject_id: 1 } }));
    expect((await api(`/api/notes/${created.note.id}`, { method: 'PUT', token: me.token, body: { description: 'd'.repeat(1000) } })).status).toBe(200);
    expect((await api(`/api/notes/${created.note.id}`, { method: 'PUT', token: me.token, body: { description: 'd'.repeat(1001) } })).status).toBe(400);
  });

  it('POST /api/chat/sessions validates subject and topic (1–200 chars) → 400 otherwise', async () => {
    const me = await signup(uniqueEmail('chat'));
    for (const body of [{}, { subject: 'Fisika' }, { subject: '', topic: 'Gaya' }, { subject: 'Fisika', topic: 'x'.repeat(201) }, { subject: 1, topic: 'Gaya' }, { subject: 'Fisika', topic: null }]) {
      const res = await api('/api/chat/sessions', { token: me.token, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await json(res)).error).toBe('Invalid input');
    }
    const ok = await api('/api/chat/sessions', { token: me.token, body: { subject: 'Fisika', topic: 'x'.repeat(200) } });
    expect(ok.status).toBe(200);
    const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM chat_sessions WHERE user_id = ?').bind(me.user.id).first<{ c: number }>();
    expect(count?.c).toBe(1);
  });

  it('POST /api/chat/sessions/:id/ai-response clamps message to the chatMessageSchema bound → 400 over it, nothing saved', async () => {
    const me = await signup(uniqueEmail('ai'));
    const session = (await json(await api('/api/chat/sessions', { token: me.token, body: { subject: 'Fisika', topic: 'Gaya' } }))).session as { id: number };
    for (const body of [{ message: 'x'.repeat(10001) }, { message: '' }, { message: 123 }, {}]) {
      const res = await api(`/api/chat/sessions/${session.id}/ai-response`, { token: me.token, body });
      expect(res.status, JSON.stringify(body).slice(0, 30)).toBe(400);
    }
    const rows = await env.DB.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?').bind(session.id).first<{ c: number }>();
    expect(rows?.c ?? 0).toBe(0);
  });

  it('POST /api/admin/suspend/:id: days must be an int 1–365 (default 7), reason ≤ 500 → 400 otherwise, never 500', async () => {
    const admin = await adminLogin();
    const target = await signup(uniqueEmail('target'));
    for (const body of [{ days: 'abc' }, { days: 0 }, { days: 366 }, { days: 7.5 }, { days: 3, reason: 'r'.repeat(501) }, { days: 3, reason: 42 }]) {
      const res = await api(`/api/admin/suspend/${target.user.id}`, { token: admin.token, body });
      expect(res.status, JSON.stringify(body).slice(0, 30)).toBe(400);
    }
    const untouched = await env.DB.prepare('SELECT suspended FROM users WHERE id = ?').bind(target.user.id).first<{ suspended: number }>();
    expect(untouched?.suspended ?? 0).toBe(0);

    const ok = await api(`/api/admin/suspend/${target.user.id}`, { token: admin.token, body: { days: 3, reason: 'spam' } });
    expect(ok.status).toBe(200);
    const end = new Date((await json(ok)).suspension_end_date).getTime() - Date.now();
    expect(end).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
    expect(end).toBeLessThan(3.1 * 24 * 60 * 60 * 1000);

    const defaults = await api(`/api/admin/suspend/${target.user.id}`, { token: admin.token, body: {} });
    expect(defaults.status).toBe(200);
    const end7 = new Date((await json(defaults)).suspension_end_date).getTime() - Date.now();
    expect(end7).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
  });

  it('POST /api/admin/warn/:id: message must be a string ≤ 500 → 400 otherwise', async () => {
    const admin = await adminLogin();
    const target = await signup(uniqueEmail('target'));
    for (const body of [{ message: 'm'.repeat(501) }, { message: 123 }]) {
      const res = await api(`/api/admin/warn/${target.user.id}`, { token: admin.token, body });
      expect(res.status, JSON.stringify(body).slice(0, 30)).toBe(400);
    }
    const ok = await api(`/api/admin/warn/${target.user.id}`, { token: admin.token, body: { message: 'be nice' } });
    expect(ok.status).toBe(200);
    const row = await env.DB.prepare('SELECT warning, warning_message FROM users WHERE id = ?').bind(target.user.id).first<any>();
    expect(row).toMatchObject({ warning: 1, warning_message: 'be nice' });
  });
});
