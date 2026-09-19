/**
 * Wave 1 security regression suite (AUDIT/security.md F1–F5, api-contract.md §4).
 * Written RED before the fixes; every block asserts the post-fix contract.
 */
import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { BASE, adminLogin, api, initTestDatabase, json, signup, uniqueEmail } from './setup';

beforeAll(initTestDatabase);

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

async function userCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first<{ c: number }>();
  return row?.c ?? 0;
}

// A 1x1 PNG so the note carries an image chunk; pass `images: undefined` for a text-only note.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function createNote(token: string, overrides: Record<string, unknown> = {}) {
  const res = await api('/api/notes', {
    token,
    body: { title: 'Owned note', content: 'Body text', description: 'Desc', subject_id: 1, status: 'published', visibility: 'everyone', images: [TINY_PNG], ...overrides },
  });
  expect(res.status).toBe(200);
  const body = await json(res);
  return body.note as { id: number };
}

async function createChatSession(token: string) {
  const res = await api('/api/chat/sessions', { token, body: { subject: 'Fisika', topic: 'Gaya' } });
  expect(res.status).toBe(200);
  return (await json(res)).session as { id: number };
}

// ---------------------------------------------------------------------------
describe('S2 — unauthenticated admin password reset is gone (F1)', () => {
  it('POST /api/auth/admin-reset-password → 404 and the target password is unchanged', async () => {
    // The old handler answered 404 for unknown emails too, so the target must exist.
    const victim = await signup(uniqueEmail('victim'));
    const res = await api('/api/auth/admin-reset-password', { body: { email: victim.user.email, newPassword: 'attacker-chosen-pw' } });
    expect(res.status).toBe(404);

    const hijacked = await api('/api/auth/login', { body: { email: victim.user.email, password: 'attacker-chosen-pw' } });
    expect(hijacked.status).toBe(401);
    const legit = await api('/api/auth/login', { body: { email: victim.user.email, password: 'password-123' } });
    expect(legit.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('S3a — PUT /api/auth/profile verifies the JWT (F2)', () => {
  it('forged base64 JSON "token" naming a victim id → 401 and the victim row is untouched', async () => {
    const victim = await signup(uniqueEmail('victim'), 'Victim Name');
    const forged = btoa(JSON.stringify({ id: victim.user.id, email: victim.user.email }));
    const res = await api('/api/auth/profile', { method: 'PUT', token: forged, body: { display_name: 'pwned' } });
    expect(res.status).toBe(401);

    const me = await json(await api('/api/auth/me', { token: victim.token }));
    expect(me.user.name).toBe('Victim Name');
  });

  it('real JWT → 200 and only that user\'s row changes', async () => {
    const alice = await signup(uniqueEmail('alice'), 'Alice');
    const bob = await signup(uniqueEmail('bob'), 'Bob');

    const res = await api('/api/auth/profile', { method: 'PUT', token: alice.token, body: { display_name: 'Alice Renamed', description: 'hi' } });
    expect(res.status).toBe(200);
    expect((await json(res)).user.display_name).toBe('Alice Renamed');

    expect((await json(await api('/api/auth/me', { token: alice.token }))).user.name).toBe('Alice Renamed');
    expect((await json(await api('/api/auth/me', { token: bob.token }))).user.name).toBe('Bob');
  });

  it('profileUpdateSchema violations → 400', async () => {
    const { token } = await signup();
    for (const body of [{ display_name: '' }, { photo_url: 'not a url' }, { class: 'x'.repeat(51) }, { description: 'd'.repeat(501) }]) {
      const res = await api('/api/auth/profile', { method: 'PUT', token, body });
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
  });

  it('no token → 401', async () => {
    const res = await api('/api/auth/profile', { method: 'PUT', body: { display_name: 'x' } });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('S3b / S6 — emergency, debug and migration endpoints are gone (F2, F5, F9)', () => {
  it.each([
    '/api/admin/emergency-password-fix',
    '/api/debug/verify-update',
    '/api/admin/migrate-passwords',
  ])('POST %s → 404', async (path) => {
    const res = await api(path, { body: { email: 'x@example.test', newPassword: 'p', userId: 1, name: 'n', adminPassword: 'x' } });
    expect(res.status).toBe(404);
  });

  it('POST /api/debug/ping → 404 when ENVIRONMENT=production', async () => {
    const res = await worker.fetch(new Request(`${BASE}/api/debug/ping`, { method: 'POST' }), { ...env, ENVIRONMENT: 'production' });
    expect(res.status).toBe(404);
  });

  it('POST /api/debug/ping → 200 outside production', async () => {
    const res = await api('/api/debug/ping', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('S4 — chat session messages require the owning bearer user (F3)', () => {
  // Decision: a session that exists but belongs to someone else is 403 (matches the
  // existing ownership convention in userUpdateNote/userDeleteNote); unknown id is 404.
  it('user B cannot read user A\'s session → 403', async () => {
    const a = await signup(uniqueEmail('a'));
    const b = await signup(uniqueEmail('b'));
    const session = await createChatSession(a.token);
    const res = await api(`/api/chat/sessions/${session.id}/messages`, { token: b.token });
    expect(res.status).toBe(403);
  });

  it('user B cannot post into user A\'s session → 403', async () => {
    const a = await signup(uniqueEmail('a'));
    const b = await signup(uniqueEmail('b'));
    const session = await createChatSession(a.token);
    const res = await api(`/api/chat/sessions/${session.id}/messages`, { token: b.token, body: { role: 'user', content: 'injected' } });
    expect(res.status).toBe(403);
    const rows = await env.DB.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?').bind(session.id).first<{ c: number }>();
    expect(rows?.c ?? 0).toBe(0);
  });

  it('no token → 401 on GET and POST', async () => {
    const a = await signup(uniqueEmail('a'));
    const session = await createChatSession(a.token);
    expect((await api(`/api/chat/sessions/${session.id}/messages`)).status).toBe(401);
    expect((await api(`/api/chat/sessions/${session.id}/messages`, { body: { role: 'user', content: 'x' } })).status).toBe(401);
  });

  it('owner with a body that fails chatMessageSchema → 400', async () => {
    const a = await signup(uniqueEmail('a'));
    const session = await createChatSession(a.token);
    for (const body of [{}, { role: 'user' }, { role: 'system', content: 'x' }, { role: 'user', content: '' }]) {
      const res = await api(`/api/chat/sessions/${session.id}/messages`, { token: a.token, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('owner happy path: POST then GET → 200', async () => {
    const a = await signup(uniqueEmail('a'));
    const session = await createChatSession(a.token);
    const post = await api(`/api/chat/sessions/${session.id}/messages`, { token: a.token, body: { role: 'user', content: 'hello' } });
    expect(post.status).toBe(200);
    expect((await json(post)).message.content).toBe('hello');

    const get = await api(`/api/chat/sessions/${session.id}/messages`, { token: a.token });
    expect(get.status).toBe(200);
    expect((await json(get)).messages.map((m: { content: string }) => m.content)).toEqual(['hello']);
  });

  it('POST /api/chat/sessions/:id/ai-response is gated the same way (F3 names all three handlers)', async () => {
    const a = await signup(uniqueEmail('a'));
    const b = await signup(uniqueEmail('b'));
    const session = await createChatSession(a.token);
    expect((await api(`/api/chat/sessions/${session.id}/ai-response`, { body: { message: 'm' } })).status).toBe(401);
    expect((await api(`/api/chat/sessions/${session.id}/ai-response`, { token: b.token, body: { message: 'm' } })).status).toBe(403);
    const rows = await env.DB.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?').bind(session.id).first<{ c: number }>();
    expect(rows?.c ?? 0).toBe(0);
  });

  it('unknown session id → 404 for the owner', async () => {
    const a = await signup(uniqueEmail('a'));
    expect((await api('/api/chat/sessions/999999/messages', { token: a.token })).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('S5a — public leaderboard leaks nothing identifying (F4)', () => {
  it('no email, no encrypted_yw_id, no data:image; still has the scoreboard fields', async () => {
    const legacy = await signup(uniqueEmail('legacy'), 'Legacy User');
    await env.DB.prepare('UPDATE users SET encrypted_yw_id = ?, photo_url = ?, notes_uploaded = 3 WHERE id = ?')
      .bind('legacy-yw-id-1', 'data:image/png;base64,AAAA', legacy.user.id).run();

    const res = await api('/api/leaderboard');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('email');
    expect(text).not.toContain('encrypted_yw_id');
    expect(text).not.toContain('legacy-yw-id-1');
    expect(text).not.toContain('data:image');

    const { leaderboard } = JSON.parse(text) as { leaderboard: Record<string, unknown>[] };
    const row = leaderboard.find((r) => r.display_name === 'Legacy User');
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(['class', 'display_name', 'notes_uploaded', 'points', 'total_admin_upvotes', 'total_likes']);
    expect(row!.points).toBe(3);
  });
});

// ---------------------------------------------------------------------------
describe('S5b — X-Encrypted-Yw-ID is no longer an identity (F4, F10)', () => {
  // Distinct from S5a's 'legacy-yw-id-1': users.encrypted_yw_id is UNIQUE.
  const HEADER = { 'X-Encrypted-Yw-ID': 'legacy-yw-id-2' };

  it('a harvested id on former fallback routes → 401, and no user is created', async () => {
    const legacy = await signup(uniqueEmail('legacy'));
    await env.DB.prepare('UPDATE users SET encrypted_yw_id = ? WHERE id = ?').bind('legacy-yw-id-2', legacy.user.id).run();
    const before = await userCount();

    const attempts: Array<[string, { method?: string; body?: unknown }]> = [
      ['/api/notes/my-notes', {}],
      ['/api/notes', { body: { title: 't', content: 'c', subject_id: 1 } }],
      ['/api/chat/sessions', { body: { subject: 's', topic: 't' } }],
      ['/api/chat/sessions', { method: 'GET' }],
      ['/api/notes/1/like', { method: 'POST' }],
      ['/api/notes/subject/1', {}],
      ['/api/notes/search?q=x', {}],
      ['/api/notes/1', { method: 'PUT', body: { title: 't' } }],
      ['/api/notes/1/publish', { method: 'POST' }],
      ['/api/notes/1', { method: 'DELETE' }],
      ['/api/chat/sessions/1/ai-response', { body: { message: 'm' } }],
      ['/api/user/me', {}],
      ['/api/user/update', { body: { display_name: 'x' } }],
      ['/api/user/class', { method: 'PUT', body: { class: '10.2' } }],
    ];
    for (const [path, opts] of attempts) {
      const res = await api(path, { ...opts, headers: HEADER });
      expect(res.status, `${opts.method ?? (opts.body ? 'POST' : 'GET')} ${path}`).toBe(401);
    }
    // an unknown id must not auto-create an account either
    const res = await api('/api/notes/my-notes', { headers: { 'X-Encrypted-Yw-ID': 'brand-new-id' } });
    expect(res.status).toBe(401);
    expect(await userCount()).toBe(before);
  });

  it('with a bearer token the same routes work as before', async () => {
    const { token } = await signup();
    expect((await api('/api/notes/my-notes', { token })).status).toBe(200);
    expect((await api('/api/chat/sessions', { token, body: { subject: 's', topic: 't' } })).status).toBe(200);
    expect((await api('/api/notes/subject/1', { token })).status).toBe(200);
    expect((await api('/api/user/me', { token })).status).toBe(200);
  });

  it('GET /api/subjects stays a public catalogue and never creates users', async () => {
    // Decision: the subject list is public (V2.0 guests read it); it is served without
    // an identity and must not create a user row for the header value.
    const before = await userCount();
    const anon = await api('/api/subjects');
    expect(anon.status).toBe(200);
    expect((await json(anon)).subjects.length).toBeGreaterThan(0);
    const withHeader = await api('/api/subjects', { headers: { 'X-Encrypted-Yw-ID': 'brand-new-id' } });
    expect(withHeader.status).toBe(200);
    expect(await userCount()).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe('S7 — real admin check on upvote; owner/admin on note summary (gaps 1, 2, 9)', () => {
  it('POST /api/admin/upvote/:id with {isAdmin:true} from a normal user → 403; no token → 401; real admin → 200', async () => {
    const owner = await signup(uniqueEmail('owner'));
    const note = await createNote(owner.token);
    const before = (await env.DB.prepare('SELECT admin_upvotes FROM notes WHERE id = ?').bind(note.id).first<{ admin_upvotes: number }>())!.admin_upvotes;

    expect((await api(`/api/admin/upvote/${note.id}`, { token: owner.token, body: { isAdmin: true } })).status).toBe(403);
    expect((await api(`/api/admin/upvote/${note.id}`, { body: { isAdmin: true } })).status).toBe(401);
    const after = (await env.DB.prepare('SELECT admin_upvotes FROM notes WHERE id = ?').bind(note.id).first<{ admin_upvotes: number }>())!.admin_upvotes;
    expect(after).toBe(before);

    const admin = await adminLogin();
    expect((await api(`/api/admin/upvote/${note.id}`, { token: admin.token, body: {} })).status).toBe(200);
    const final = (await env.DB.prepare('SELECT admin_upvotes FROM notes WHERE id = ?').bind(note.id).first<{ admin_upvotes: number }>())!.admin_upvotes;
    expect(final).toBe(before + 1);
  });

  it('PUT /api/notes/:id/summary: no token → 401, non-owner → 403, owner → 200, admin → 200', async () => {
    const owner = await signup(uniqueEmail('owner'));
    const other = await signup(uniqueEmail('other'));
    const note = await createNote(owner.token);

    expect((await api(`/api/notes/${note.id}/summary`, { method: 'PUT', body: { summary: 's' } })).status).toBe(401);
    expect((await api(`/api/notes/${note.id}/summary`, { method: 'PUT', token: other.token, body: { summary: 'hijack' } })).status).toBe(403);
    expect((await api(`/api/notes/${note.id}/summary`, { method: 'PUT', token: owner.token, body: { summary: 'mine' } })).status).toBe(200);
    const admin = await adminLogin();
    expect((await api(`/api/notes/${note.id}/summary`, { method: 'PUT', token: admin.token, body: { summary: 'admin' } })).status).toBe(200);
    const row = await env.DB.prepare('SELECT summary FROM notes WHERE id = ?').bind(note.id).first<{ summary: string }>();
    expect(row?.summary).toBe('admin');
  });

  it('POST /api/notes/:id/summary (AI generate): no token → 401, non-owner → 403', async () => {
    const owner = await signup(uniqueEmail('owner'));
    const other = await signup(uniqueEmail('other'));
    const note = await createNote(owner.token);
    expect((await api(`/api/notes/${note.id}/summary`, { body: { content: 'c', title: 't' } })).status).toBe(401);
    expect((await api(`/api/notes/${note.id}/summary`, { token: other.token, body: { content: 'c', title: 't' } })).status).toBe(403);
    // owner happy path not asserted here: it calls the external AI provider.
  });
});

// ---------------------------------------------------------------------------
describe('S9 — zod on note mutations (gap 11)', () => {
  it('POST /api/notes without title → 400 from noteSchema (not the manual check)', async () => {
    const { token } = await signup();
    const res = await api('/api/notes', { token, body: { content: 'c', subject_id: 1 } });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe('Invalid input');
    expect(Array.isArray(body.details)).toBe(true);
    expect(JSON.stringify(body.details)).toContain('title');
  });

  it('POST /api/notes with a non-numeric subject_id → 400', async () => {
    const { token } = await signup();
    const res = await api('/api/notes', { token, body: { title: 't', content: 'c', subject_id: 'abc' } });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe('Invalid input');
  });

  it('PUT /api/notes/:id with an over-long title → 400 (partial noteSchema)', async () => {
    const owner = await signup(uniqueEmail('owner'));
    const note = await createNote(owner.token);
    const res = await api(`/api/notes/${note.id}`, { method: 'PUT', token: owner.token, body: { title: 'x'.repeat(201) } });
    expect(res.status).toBe(400);
  });

  it('POST /api/notes with an oversized body → 413', async () => {
    const { token } = await signup();
    const res = await api('/api/notes', { token, rawBody: JSON.stringify({ title: 't', subject_id: 1, content: 'x'.repeat(10 * 1024 * 1024 + 1024) }) });
    expect(res.status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
describe('C1 — my-notes returns content, description, author_name', () => {
  it('a text-only note comes back with its body', async () => {
    const me = await signup(uniqueEmail('writer'), 'Writer');
    // Text-only, no images — exactly what V2.0's Create screen sends.
    await createNote(me.token, { title: 'Text only', content: 'Only text, no OCR', description: 'A short description', images: undefined });
    const res = await api('/api/notes/my-notes', { token: me.token });
    expect(res.status).toBe(200);
    const note = (await json(res)).notes.find((n: { title: string }) => n.title === 'Text only');
    expect(note).toBeDefined();
    expect(note.content).toBe('Only text, no OCR');
    expect(note.description).toBe('A short description');
    expect(note.author_name).toBe('Writer');
  });
});

// ---------------------------------------------------------------------------
describe('W1.9 — security headers, CORS allow-list, body size cap', () => {
  it.each([
    ['GET /api/leaderboard (200, public)', () => api('/api/leaderboard')],
    ['GET /api/subjects (200, public)', () => api('/api/subjects')],
    ['GET /api/notes/my-notes without token (401)', () => api('/api/notes/my-notes')],
    ['GET /nope (404)', () => api('/nope')],
    ['GET /test (200, env-less jsonResponse)', () => api('/test')],
    ['POST /api/auth/login with an unparseable body (error path)', () => api('/api/auth/login', { rawBody: '{not json' })],
  ])('%s carries the security headers', async (_label, call) => {
    const res = await call();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name), name).toBe(value);
    }
  });

  const corsEnv = { ...env, FRONTEND_URL: 'https://app.example.test', EXTRA_ORIGINS: 'https://extra.example.test, https://second.example.test' };
  const fetchWithOrigin = (origin: string | null, method = 'GET') =>
    worker.fetch(new Request(`${BASE}/api/leaderboard`, { method, headers: origin ? { Origin: origin } : {} }), corsEnv);

  it.each([
    ['FRONTEND_URL', 'https://app.example.test'],
    ['EXTRA_ORIGINS entry', 'https://extra.example.test'],
    ['second EXTRA_ORIGINS entry (trimmed)', 'https://second.example.test'],
    ['local Vite dev server', 'http://localhost:5173'],
  ])('allow-listed origin (%s) is echoed in Access-Control-Allow-Origin', async (_label, origin) => {
    const res = await fetchWithOrigin(origin);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it.each([
    ['unknown origin', 'https://evil.example'],
    ['same host, different scheme', 'http://app.example.test'],
    ['prefix attack', 'https://app.example.test.evil.example'],
  ])('%s gets no Access-Control-Allow-Origin', async (_label, origin) => {
    const res = await fetchWithOrigin(origin);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('no Origin header → no Access-Control-Allow-Origin', async () => {
    const res = await fetchWithOrigin(null);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('preflight follows the same allow-list', async () => {
    const ok = await fetchWithOrigin('https://app.example.test', 'OPTIONS');
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.test');
    expect(ok.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    const bad = await fetchWithOrigin('https://evil.example', 'OPTIONS');
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('the wrangler.toml development env still allows http://localhost:5173 via SELF', async () => {
    const res = await SELF.fetch(`${BASE}/api/leaderboard`, { headers: { Origin: 'http://localhost:5173' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('a 2 MB JSON body to POST /api/chat/sessions → 413', async () => {
    const { token } = await signup();
    const res = await api('/api/chat/sessions', { token, rawBody: JSON.stringify({ subject: 'x'.repeat(2 * 1024 * 1024), topic: 't' }) });
    expect(res.status).toBe(413);
    expect((await json(res)).error).toBeDefined();
  });

  it('a streamed 2 MB body with no Content-Length → 413 too (cap cannot be skipped via chunked encoding)', async () => {
    const { token } = await signup();
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 2 * 1024 * 1024) { controller.close(); return; }
        controller.enqueue(chunk);
        sent += chunk.byteLength;
      },
    });
    const res = await SELF.fetch(`${BASE}/api/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: stream,
    });
    expect(res.status).toBe(413);
  });

  it('a small streamed body without Content-Length still reaches the route', async () => {
    const { token } = await signup();
    const bytes = new TextEncoder().encode(JSON.stringify({ subject: 'Fisika', topic: 'Gaya' }));
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
    const res = await SELF.fetch(`${BASE}/api/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: stream,
    });
    expect(res.status).toBe(200);
  });
});
