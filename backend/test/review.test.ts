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
