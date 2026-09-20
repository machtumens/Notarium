/**
 * Wave 2 session-integrity suite (AUDIT/MASTER-ENGINEERING-PLAN.md W2.1): short-lived
 * access tokens, refresh rotation with reuse detection, logout. Written RED before the
 * implementation; every block asserts the post-change contract.
 */
import { env } from 'cloudflare:test';
import { SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminLogin as adminLoginWith, api, initTestDatabase, json, REFRESH_SESSION_HEADERS, signup as signupWith, uniqueEmail } from './setup';

beforeAll(initTestDatabase);

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const BASE64URL = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, unpadded

let ipCounter = 0;
/** Fresh client IP per call: /api/auth/refresh shares login's 5-per-15-min bucket per IP. */
function freshIp(): string {
  ipCounter += 1;
  return `192.168.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

const decodeClaims = (jwt: string) => JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { id: number; iat: number; exp: number };

/** A JWT signed with the real test secret whose `exp` is already in the past. */
async function expiredAccessToken(user: { id: number; email: string; role: string }): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ id: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now - 3600)
    .setExpirationTime(now - 60)
    .sign(secret);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const refresh = (refreshToken: unknown, ip = freshIp()) =>
  api('/api/auth/refresh', { headers: { 'CF-Connecting-IP': ip }, body: { refreshToken } });

/** Every sign-in in this suite opts in to the short-session contract (W2.3a): 15-minute JWT + refresh token. */
const signup = (email?: string) => signupWith(email, 'Test User', { refresh: true });
const adminLogin = () => adminLoginWith(undefined, { refresh: true });
const login = (email: string, headers: Record<string, string> = REFRESH_SESSION_HEADERS) =>
  api('/api/auth/login', { headers: { 'CF-Connecting-IP': freshIp(), ...headers }, body: { email, password: 'password-123' } });

// ---------------------------------------------------------------------------
describe('W2.1a — access tokens live 15 minutes', () => {
  it('with the opt-in header, login, signup and admin-login mint a JWT whose exp − iat is exactly 15 minutes', async () => {
    const created = await signup(uniqueEmail('ttl'));
    const loggedIn = await json(await login(created.user.email));
    const admin = await adminLogin();
    for (const jwt of [created.token, loggedIn.token, admin.token]) {
      const { iat, exp } = decodeClaims(jwt);
      expect(exp - iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
    }
  });

  it('an expired access token → 401 on GET /api/auth/me and on a bearer route', async () => {
    const user = await signup(uniqueEmail('expired'));
    const stale = await expiredAccessToken({ id: user.user.id, email: user.user.email, role: 'student' });
    expect(stale.split('.')).toHaveLength(3);
    expect((await api('/api/auth/me', { token: stale })).status).toBe(401);
    expect((await api('/api/notes/my-notes', { token: stale })).status).toBe(401);
    // the live token still works, so the 401 is about expiry, not the account
    expect((await api('/api/auth/me', { token: user.token })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('W2.3a — short sessions are opt-in', () => {
  const LEGACY_TTL_SECONDS = 24 * 60 * 60;
  const ttl = (jwt: string) => { const { iat, exp } = decodeClaims(jwt); return exp - iat; };
  const liveRows = async (userId: number) =>
    (await env.DB.prepare('SELECT COUNT(*) AS c FROM refresh_tokens WHERE user_id = ?').bind(userId).first<{ c: number }>())?.c ?? -1;

  it('without the header: login, signup and admin-login mint a 24-hour JWT and no refreshToken (the deployed frontend keeps working)', async () => {
    const created = await signupWith(uniqueEmail('legacy'));
    const loggedIn = await json(await login(created.user.email, {}));
    const admin = await adminLoginWith();
    for (const jwt of [created.token, loggedIn.token, admin.token]) expect(ttl(jwt)).toBe(LEGACY_TTL_SECONDS);
    expect(loggedIn).toMatchObject({ success: true, user: { id: created.user.id } });
    expect(loggedIn).not.toHaveProperty('refreshToken');
    expect(created.refreshToken).toBe('');
    expect(admin.refreshToken).toBe('');
    expect(await liveRows(created.user.id)).toBe(0);
    expect(await liveRows(admin.user.id)).toBe(0);
    // the 24-hour token is a working bearer
    expect((await api('/api/auth/me', { token: loggedIn.token })).status).toBe(200);
  });

  it('with X-Notarium-Session: refresh → 15-minute JWT + refresh token; body session: "refresh" opts in too', async () => {
    const created = await signup(uniqueEmail('optin'));
    expect(ttl(created.token)).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(created.refreshToken).toMatch(BASE64URL);
    const viaBody = await json(await api('/api/auth/login', {
      headers: { 'CF-Connecting-IP': freshIp() },
      body: { email: created.user.email, password: 'password-123', session: 'refresh' },
    }));
    expect(ttl(viaBody.token)).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(viaBody.refreshToken).toMatch(BASE64URL);
    const admin = await adminLogin();
    expect(ttl(admin.token)).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(admin.refreshToken).toMatch(BASE64URL);
    expect(await liveRows(created.user.id)).toBe(2);
  });

  it('anything but an exact opt-in is the legacy contract', async () => {
    const created = await signupWith(uniqueEmail('almost'));
    const wrongHeader = await json(await login(created.user.email, { 'X-Notarium-Session': 'yes' }));
    expect(ttl(wrongHeader.token)).toBe(LEGACY_TTL_SECONDS);
    expect(wrongHeader).not.toHaveProperty('refreshToken');
    const wrongBody = await json(await api('/api/auth/login', {
      headers: { 'CF-Connecting-IP': freshIp() },
      body: { email: created.user.email, password: 'password-123', session: true },
    }));
    expect(ttl(wrongBody.token)).toBe(LEGACY_TTL_SECONDS);
    expect(wrongBody).not.toHaveProperty('refreshToken');
    expect(await liveRows(created.user.id)).toBe(0);
  });

  it('the CORS preflight allows the opt-in header (the V2.0 app sends it cross-origin)', async () => {
    const res = await api('/api/auth/login', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-notarium-session' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/\bX-Notarium-Session\b/i);
  });
});

// ---------------------------------------------------------------------------
describe('W2.1a — login, signup and admin-login issue a refresh token', () => {
  it('signup → 201 with {token, refreshToken, user}; the refresh token is 32 random bytes base64url', async () => {
    const res = await api('/api/auth/signup', {
      headers: { 'CF-Connecting-IP': freshIp(), ...REFRESH_SESSION_HEADERS },
      body: { name: 'Refresh User', email: uniqueEmail('rt'), password: 'password-123', class: '10.1' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.refreshToken).toMatch(BASE64URL);
    expect(body.user.email).toBeDefined();
  });

  it('login keeps success/token/user and adds refreshToken; each login gets a different one', async () => {
    const user = await signup(uniqueEmail('login'));
    const first = await json(await login(user.user.email));
    const second = await json(await login(user.user.email));
    expect(first).toMatchObject({ success: true });
    expect(first.user.id).toBe(user.user.id);
    expect(first.refreshToken).toMatch(BASE64URL);
    expect(second.refreshToken).toMatch(BASE64URL);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.refreshToken).not.toBe(user.refreshToken);
  });

  it('admin-login → {token, refreshToken, user}', async () => {
    const admin = await adminLogin();
    expect(admin.refreshToken).toMatch(BASE64URL);
    expect(decodeClaims(admin.token).id).toBe(admin.user.id);
  });

  it('the database holds sha256(token) in a family, never the token itself', async () => {
    const user = await signup(uniqueEmail('hash'));
    const rows = await env.DB.prepare('SELECT token, family, revoked_at, expires_at FROM refresh_tokens WHERE user_id = ?')
      .bind(user.user.id).all<{ token: string; family: string | null; revoked_at: string | null; expires_at: string }>();
    expect(rows.results).toHaveLength(1);
    const [row] = rows.results;
    expect(row.token).not.toBe(user.refreshToken);
    expect(row.token).toBe(await sha256Hex(user.refreshToken));
    expect(row.family).toBeTruthy();
    expect(row.revoked_at).toBeNull();
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
describe('W2.1a — POST /api/auth/refresh rotates', () => {
  it('happy path: → 200 {token, refreshToken}; the new access token works; the old refresh token is now 401', async () => {
    const user = await signup(uniqueEmail('rotate'));
    const res = await refresh(user.refreshToken);
    expect(res.status).toBe(200);
    const next = await json(res);
    expect(next.token.split('.')).toHaveLength(3);
    expect(next.refreshToken).toMatch(BASE64URL);
    expect(next.refreshToken).not.toBe(user.refreshToken);
    expect(decodeClaims(next.token).id).toBe(user.user.id);
    expect(exp(next.token)).toBe(ACCESS_TOKEN_TTL_SECONDS);

    const me = await api('/api/auth/me', { token: next.token });
    expect(me.status).toBe(200);
    expect((await json(me)).user.id).toBe(user.user.id);

    // the rotated row is retired, the new one lives in the same family
    const rows = await env.DB.prepare('SELECT family, revoked_at FROM refresh_tokens WHERE user_id = ? ORDER BY id')
      .bind(user.user.id).all<{ family: string; revoked_at: string | null }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0].revoked_at).not.toBeNull();
    expect(rows.results[1].revoked_at).toBeNull();
    expect(rows.results[1].family).toBe(rows.results[0].family);

    // presenting the old token again is a replay → 401 (and, by design, it retires the family)
    expect((await refresh(user.refreshToken)).status).toBe(401);
  });

  function exp(jwt: string): number {
    const { iat, exp: e } = decodeClaims(jwt);
    return e - iat;
  }

  it('the new refresh token can itself be rotated (a chain): one family, one live row, every hop mints a working JWT', async () => {
    const user = await signup(uniqueEmail('chain'));
    let current = user.refreshToken;
    for (let hop = 1; hop <= 3; hop += 1) {
      const res = await refresh(current);
      expect(res.status, `hop ${hop}`).toBe(200);
      const next = await json(res);
      expect((await api('/api/auth/me', { token: next.token })).status, `jwt from hop ${hop}`).toBe(200);
      current = next.refreshToken as string;
    }
    const rows = await env.DB.prepare('SELECT family, revoked_at FROM refresh_tokens WHERE user_id = ? ORDER BY id')
      .bind(user.user.id).all<{ family: string; revoked_at: string | null }>();
    expect(rows.results).toHaveLength(4);
    expect(new Set(rows.results.map((r) => r.family)).size).toBe(1);
    expect(rows.results.filter((r) => r.revoked_at === null)).toHaveLength(1);
    expect(rows.results[3].revoked_at).toBeNull();

    // replaying the very first token now retires the whole chain, the live one included
    expect((await refresh(user.refreshToken)).status).toBe(401);
    expect((await refresh(current)).status).toBe(401);
  });

  it('reuse of a rotated token revokes the whole family: the newest token stops working too', async () => {
    const user = await signup(uniqueEmail('reuse'));
    const rotated = await json(await refresh(user.refreshToken));
    expect(rotated.refreshToken).toMatch(BASE64URL);

    // an attacker (or a stale tab) replays the old token
    expect((await refresh(user.refreshToken)).status).toBe(401);
    // ...so the legitimate successor is dead as well
    expect((await refresh(rotated.refreshToken)).status).toBe(401);
    const live = await env.DB.prepare('SELECT COUNT(*) AS c FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL')
      .bind(user.user.id).first<{ c: number }>();
    expect(live?.c ?? -1).toBe(0);
  });

  it('a reuse only kills its own family: a second device (its own login) keeps refreshing', async () => {
    const user = await signup(uniqueEmail('families'));
    const phone = await json(await login(user.user.email));
    const laptopNext = await json(await refresh(user.refreshToken));
    expect((await refresh(user.refreshToken)).status).toBe(401); // reuse on the laptop family
    expect((await refresh(laptopNext.refreshToken)).status).toBe(401);
    expect((await refresh(phone.refreshToken)).status).toBe(200);
  });

  it('two concurrent refreshes with the same token: exactly one wins, the other is 401', async () => {
    const user = await signup(uniqueEmail('race'));
    const [a, b] = await Promise.all([refresh(user.refreshToken), refresh(user.refreshToken)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('an expired refresh token → 401 and does not rotate', async () => {
    const user = await signup(uniqueEmail('stale'));
    await env.DB.prepare('UPDATE refresh_tokens SET expires_at = ? WHERE user_id = ?')
      .bind(new Date(Date.now() - 60_000).toISOString(), user.user.id).run();
    expect((await refresh(user.refreshToken)).status).toBe(401);
    const rows = await env.DB.prepare('SELECT COUNT(*) AS c FROM refresh_tokens WHERE user_id = ?').bind(user.user.id).first<{ c: number }>();
    expect(rows?.c).toBe(1);
  });

  it('an unknown token → 401; a missing or non-string token → 400', async () => {
    expect((await refresh('a'.repeat(43))).status).toBe(401);
    expect((await refresh(undefined)).status).toBe(400);
    expect((await refresh(42)).status).toBe(400);
    expect((await refresh('')).status).toBe(400);
    const raw = await api('/api/auth/refresh', { headers: { 'CF-Connecting-IP': freshIp() }, rawBody: 'not json' });
    expect(raw.status).toBe(400);
  });

  it("a deleted user's refresh token → 401", async () => {
    const ghost = await signup(uniqueEmail('ghost'));
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(ghost.user.id).run();
    expect((await refresh(ghost.refreshToken)).status).toBe(401);
  });

  it("a suspended user's refresh token → 401 while the suspension is in force", async () => {
    const user = await signup(uniqueEmail('suspended'));
    const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("UPDATE users SET suspended = 1, suspension_end_date = ?, suspension_reason = 'test' WHERE id = ?")
      .bind(inDays(3), user.user.id).run();
    expect((await refresh(user.refreshToken)).status).toBe(401);
    // an expired suspension no longer blocks
    await env.DB.prepare('UPDATE users SET suspension_end_date = ? WHERE id = ?').bind(inDays(-1), user.user.id).run();
    expect((await refresh(user.refreshToken)).status).toBe(200);
  });

  it('6th attempt from one IP inside the window → 429, even with a valid token', async () => {
    const user = await signup(uniqueEmail('limited'));
    const ip = freshIp();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await refresh('b'.repeat(43), ip);
      expect(res.status, `attempt ${attempt}`).toBe(401);
    }
    const sixth = await refresh(user.refreshToken, ip);
    expect(sixth.status).toBe(429);
    expect((await json(sixth)).error).toBeDefined();
    // the throttle is per IP, and the valid token was not consumed
    expect((await refresh(user.refreshToken)).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('W2.1a — POST /api/auth/logout revokes', () => {
  it('no bearer → 401; nothing is revoked', async () => {
    const user = await signup(uniqueEmail('anon'));
    expect((await api('/api/auth/logout', { body: { refreshToken: user.refreshToken } })).status).toBe(401);
    expect((await refresh(user.refreshToken)).status).toBe(200);
  });

  it('with {refreshToken} → 200 and that family is dead; another device of the same user survives', async () => {
    const user = await signup(uniqueEmail('logout'));
    const phone = await json(await login(user.user.email));
    const res = await api('/api/auth/logout', { token: user.token, body: { refreshToken: user.refreshToken } });
    expect(res.status).toBe(200);
    expect((await json(res)).success).toBe(true);
    expect((await refresh(user.refreshToken)).status).toBe(401);
    expect((await refresh(phone.refreshToken)).status).toBe(200);
  });

  it('with no body → 200 and every refresh token of the user is dead', async () => {
    const user = await signup(uniqueEmail('logout-all'));
    const phone = await json(await login(user.user.email));
    expect((await api('/api/auth/logout', { method: 'POST', token: user.token })).status).toBe(200);
    expect((await refresh(user.refreshToken)).status).toBe(401);
    expect((await refresh(phone.refreshToken)).status).toBe(401);
  });

  it("presenting another user's refresh token revokes nothing of theirs", async () => {
    const alice = await signup(uniqueEmail('alice'));
    const mallory = await signup(uniqueEmail('mallory'));
    const res = await api('/api/auth/logout', { token: mallory.token, body: { refreshToken: alice.refreshToken } });
    expect(res.status).toBe(200);
    expect((await refresh(alice.refreshToken)).status).toBe(200);
  });

  it('the access token keeps working until it expires (logout revokes refresh, the JWT is stateless)', async () => {
    const user = await signup(uniqueEmail('stateless'));
    await api('/api/auth/logout', { token: user.token, body: { refreshToken: user.refreshToken } });
    expect((await api('/api/auth/me', { token: user.token })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('W2.1a — refresh tokens never reach the logs', () => {
  const lines: string[] = [];
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    }));
  afterEach(() => { lines.length = 0; });

  it('signup, login, refresh (ok, reused, unknown) and logout log neither a refresh token nor its hash', async () => {
    lines.length = 0;
    const user = await signup(uniqueEmail('quiet'));
    const loggedIn = await json(await login(user.user.email));
    const rotated = await json(await refresh(user.refreshToken));
    await refresh(user.refreshToken); // reuse → family revoked
    await refresh('c'.repeat(43)); // unknown
    await api('/api/auth/logout', { token: loggedIn.token, body: { refreshToken: loggedIn.refreshToken } });

    expect(spies.some((s) => s.mock.calls.length > 0)).toBe(true);
    const joined = lines.join('\n');
    const secrets = [user.refreshToken, loggedIn.refreshToken, rotated.refreshToken];
    for (const secret of secrets) {
      expect(joined, 'a refresh token leaked into a log line').not.toContain(secret);
      expect(joined, 'a refresh token hash leaked into a log line').not.toContain(await sha256Hex(secret));
    }
    expect(joined).not.toContain(user.token);
  });
});

// ---------------------------------------------------------------------------
describe('W2.1c — expiry + rotation matrix', () => {
  /** Re-encode the payload with `patch` applied but keep the original header + signature. */
  function tamper(jwt: string, patch: Record<string, unknown>): string {
    const [header, payload, signature] = jwt.split('.');
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const forged = btoa(JSON.stringify({ ...claims, ...patch })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${header}.${forged}.${signature}`;
  }

  it('the runtime creates refresh_tokens with the 0008 shape plus family/revoked_at, and its indexes', async () => {
    const columns = await env.DB.prepare('PRAGMA table_info(refresh_tokens)').all<{ name: string; notnull: number }>();
    const names = columns.results.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['id', 'user_id', 'token', 'expires_at', 'created_at', 'family', 'revoked_at']));
    expect(columns.results.find((c) => c.name === 'token')?.notnull).toBe(1);
    const indexes = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'refresh_tokens'").all<{ name: string }>();
    expect(indexes.results.map((i) => i.name)).toEqual(expect.arrayContaining([
      'idx_refresh_tokens_user_id', 'idx_refresh_tokens_token', 'idx_refresh_tokens_expires_at', 'idx_refresh_tokens_family',
    ]));
  });

  it('a JWT whose exp was pushed into the future without re-signing → 401', async () => {
    const user = await signup(uniqueEmail('forged-exp'));
    const stale = await expiredAccessToken({ id: user.user.id, email: user.user.email, role: 'student' });
    const extended = tamper(stale, { exp: Math.floor(Date.now() / 1000) + 3600 });
    expect((await api('/api/auth/me', { token: extended })).status).toBe(401);
    expect((await api('/api/auth/me', { token: tamper(user.token, { exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 }) })).status).toBe(401);
  });

  it('refresh mints the JWT from the current users row: a demoted admin gets a student token', async () => {
    const admin = await adminLogin();
    expect(JSON.parse(atob(admin.token.split('.')[1])).role).toBe('admin');
    await env.DB.prepare("UPDATE users SET role = 'student' WHERE id = ?").bind(admin.user.id).run();
    const rotated = await json(await refresh(admin.refreshToken));
    expect(JSON.parse(atob(rotated.token.split('.')[1])).role).toBe('student');
    expect((await api('/api/admin/users', { token: rotated.token })).status).toBe(403);
  });

  it('a refresh token is bound to one user: rows of user A never mint a token for user B', async () => {
    const a = await signup(uniqueEmail('a'));
    const b = await signup(uniqueEmail('b'));
    const rotated = await json(await refresh(a.refreshToken));
    expect(decodeClaims(rotated.token).id).toBe(a.user.id);
    expect(decodeClaims(rotated.token).id).not.toBe(b.user.id);
    const me = await json(await api('/api/auth/me', { token: rotated.token }));
    expect(me.user.email).toBe(a.user.email);
  });
});
