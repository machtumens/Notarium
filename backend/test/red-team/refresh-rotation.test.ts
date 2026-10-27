// Rotating refresh tokens: POST /api/auth/refresh and POST /api/auth/logout.
//
// The V2.0 client has shipped the other half of this since Wave 2 and kept it
// dormant (`X-Notarium-Session: refresh` opt-in, refresh-once-then-replay,
// logout), so these tests are written against ITS contract:
//   - sign-in with the header  → { token, refreshToken }
//   - sign-in without it       → { token } and no refreshToken key at all
//   - POST /api/auth/refresh { refreshToken } → { token, refreshToken }
//   - POST /api/auth/logout   → { success: true }
//
// The adversarial half is what rotation is for: a refresh token must be
// spendable exactly once, must not double as an access token, and a replay must
// cost the attacker the family rather than handing out a fresh pair.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, signupBody, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

const SHORT = { 'X-Notarium-Session': 'refresh' };

/** Sign in over HTTP so the opt-in header goes through the real handler. */
async function signIn(
  email: string,
  password: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; token?: string; refreshToken?: string; keys: string[] }> {
  const res = await call('/api/auth/login', {
    body: { email, password },
    headers,
    // Per-account login limit is 5 per window; a fresh IP per call keeps the
    // suite from rate-limiting itself.
    ip: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`,
  });
  const body = (await res.json()) as Record<string, unknown>;
  return {
    status: res.status,
    token: body.token as string | undefined,
    refreshToken: body.refreshToken as string | undefined,
    keys: Object.keys(body),
  };
}

const refresh = (refreshToken: string) => call('/api/auth/refresh', { body: { refreshToken } });

const rows = async (userId: number) =>
  (
    (await env.DB.prepare(`SELECT token, family FROM refresh_tokens WHERE user_id = ?`)
      .bind(userId)
      .all()) as unknown as { results: { token: string; family: string }[] }
  ).results;

describe('opt-in: a sign-in only gets a refresh token when it asks', () => {
  it('login without the header answers exactly as before — token, no refreshToken', async () => {
    const user = await seedUser();
    const out = await signIn(user.email, user.password);
    expect(out.status).toBe(200);
    expect(out.token).toBeTruthy();
    // Absent, not null: the client clears a stale stored token when the key is missing.
    expect(out.keys).not.toContain('refreshToken');
    expect(await rows(user.id)).toHaveLength(0);
  });

  it('login with the header answers with a pair and stores one row', async () => {
    const user = await seedUser();
    const out = await signIn(user.email, user.password, SHORT);
    expect(out.status).toBe(200);
    expect(out.token).toBeTruthy();
    expect(out.refreshToken).toBeTruthy();
    const stored = await rows(user.id);
    expect(stored).toHaveLength(1);
    // The raw token must never be readable from the table.
    expect(stored[0].token).not.toBe(out.refreshToken);
    expect(stored[0].token).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0].family).toBeTruthy();
  });

  it('signup with the header answers with a pair too', async () => {
    const res = await call('/api/auth/signup', {
      body: signupBody(),
      headers: SHORT,
      ip: '10.9.9.9',
    });
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.token).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });
});

describe('rotation', () => {
  it('trades the token for a new pair that works, and the spent one stops working', async () => {
    const user = await seedUser();
    const first = await signIn(user.email, user.password, SHORT);

    const res = await refresh(first.refreshToken!);
    expect(res.status).toBe(200);
    const next = (await res.json()) as { token: string; refreshToken: string };
    expect(next.token).toBeTruthy();
    expect(next.refreshToken).toBeTruthy();
    expect(next.refreshToken).not.toBe(first.refreshToken);

    // The new access token is a real session.
    const me = await call('/api/auth/me', { token: next.token });
    expect(me.status).toBe(200);

    // Exactly one live row — the spent one was deleted, not kept alongside.
    expect(await rows(user.id)).toHaveLength(1);
  });

  it('keeps the family across a rotation, so the chain stays one device', async () => {
    const user = await seedUser();
    const first = await signIn(user.email, user.password, SHORT);
    const familyBefore = (await rows(user.id))[0].family;

    const res = await refresh(first.refreshToken!);
    expect(res.status).toBe(200);
    expect((await rows(user.id))[0].family).toBe(familyBefore);
  });

  it('a replayed token is refused AND takes its family down with it', async () => {
    const user = await seedUser();
    const first = await signIn(user.email, user.password, SHORT);

    const good = (await (await refresh(first.refreshToken!)).json()) as { refreshToken: string };

    // Someone else replays the token we already spent.
    const replay = await refresh(first.refreshToken!);
    expect(replay.status).toBe(401);

    // The legitimate holder loses the session too — that is the point: we cannot
    // tell the thief from the victim, so the family ends and both sign in again.
    expect(await rows(user.id)).toHaveLength(0);
    expect((await refresh(good.refreshToken)).status).toBe(401);
  });

  it('one device signing in twice gets two independent families', async () => {
    const user = await seedUser();
    const a = await signIn(user.email, user.password, SHORT);
    const b = await signIn(user.email, user.password, SHORT);
    const stored = await rows(user.id);
    expect(stored).toHaveLength(2);
    expect(stored[0].family).not.toBe(stored[1].family);

    // Burning A's family must not touch B.
    await refresh(a.refreshToken!);
    await refresh(a.refreshToken!); // replay → A's family dies
    expect((await refresh(b.refreshToken!)).status).toBe(200);
  });

  it('refuses a forged token, an access token, and junk — without touching stored rows', async () => {
    const user = await seedUser();
    const live = await signIn(user.email, user.password, SHORT);

    for (const candidate of [
      'not-a-jwt',
      `${live.refreshToken}tampered`,
      live.token!, // a valid ACCESS token is not a refresh token
    ]) {
      expect((await refresh(candidate)).status).toBe(401);
    }
    // None of that was a replay, so the real session survives.
    expect(await rows(user.id)).toHaveLength(1);
    expect((await refresh(live.refreshToken!)).status).toBe(200);
  });

  it('rejects a body with no refreshToken as a 400, not a 500', async () => {
    const res = await call('/api/auth/refresh', { body: {} });
    expect(res.status).toBe(400);
  });
});

describe('a refresh token is not an access token', () => {
  it('cannot be used as a bearer token on /api/auth/me', async () => {
    const user = await seedUser();
    const out = await signIn(user.email, user.password, SHORT);
    const me = await call('/api/auth/me', { token: out.refreshToken });
    expect(me.status).toBe(401);
  });

  it('cannot reach an authenticated note route either', async () => {
    const user = await seedUser();
    const out = await signIn(user.email, user.password, SHORT);
    const res = await call('/api/notes/my-notes', { token: out.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('logout', () => {
  it('with a refresh token, ends that family and leaves the other device signed in', async () => {
    const user = await seedUser();
    const laptop = await signIn(user.email, user.password, SHORT);
    const phone = await signIn(user.email, user.password, SHORT);

    const res = await call('/api/auth/logout', {
      token: laptop.token,
      body: { refreshToken: laptop.refreshToken },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).success).toBe(true);

    expect((await refresh(laptop.refreshToken!)).status).toBe(401);
    expect((await refresh(phone.refreshToken!)).status).toBe(200);
  });

  it('with no refresh token, ends every session the caller has', async () => {
    const user = await seedUser();
    const laptop = await signIn(user.email, user.password, SHORT);
    const phone = await signIn(user.email, user.password, SHORT);

    const res = await call('/api/auth/logout', { token: laptop.token, body: {} });
    expect(res.status).toBe(200);
    expect(await rows(user.id)).toHaveLength(0);
    expect((await refresh(phone.refreshToken!)).status).toBe(401);
  });

  it('still works once the access token has expired, using the refresh token as proof', async () => {
    const user = await seedUser();
    const out = await signIn(user.email, user.password, SHORT);
    // No Authorization header at all — the 15-minute access token is gone.
    const res = await call('/api/auth/logout', { body: { refreshToken: out.refreshToken } });
    expect(res.status).toBe(200);
    expect(await rows(user.id)).toHaveLength(0);
  });

  it('401s when neither token identifies anyone', async () => {
    const res = await call('/api/auth/logout', { body: {} });
    expect(res.status).toBe(401);
  });

  it("cannot end someone else's family with their refresh token and one's own access token", async () => {
    const victim = await seedUser();
    const attacker = await seedUser();
    const victimSession = await signIn(victim.email, victim.password, SHORT);
    const attackerSession = await signIn(attacker.email, attacker.password, SHORT);

    const res = await call('/api/auth/logout', {
      token: attackerSession.token,
      body: { refreshToken: victimSession.refreshToken },
    });
    // Answered, but scoped to the caller: the victim keeps their session.
    expect(res.status).toBe(200);
    expect((await refresh(victimSession.refreshToken!)).status).toBe(200);
  });

  it('a logged-out client that keeps refreshing never gets back in', async () => {
    const user = await seedUser();
    const out = await signIn(user.email, user.password, SHORT);
    await call('/api/auth/logout', { token: out.token, body: { refreshToken: out.refreshToken } });
    expect((await refresh(out.refreshToken!)).status).toBe(401);
    expect((await refresh(out.refreshToken!)).status).toBe(401);
  });
});

describe('the long-session path is untouched', () => {
  it('a 24-hour token still authenticates and no refresh row exists for it', async () => {
    const user = await seedUser();
    const out = await signIn(user.email, user.password); // no opt-in header
    const me = await call('/api/auth/me', { token: out.token });
    expect(me.status).toBe(200);
    expect(await rows(user.id)).toHaveLength(0);
  });

  it('a seeded long token (what every existing client holds) keeps working', async () => {
    const user = await seedUser();
    const me = await call('/api/auth/me', { token: user.token });
    expect(me.status).toBe(200);
  });
});
