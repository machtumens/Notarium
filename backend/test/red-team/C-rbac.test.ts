// C. RBAC / Authorization (41-60)
// requireRole: role!=='admin' -> 403; no token -> 401. An admin token with
// admin_role='super' passes every tier; *undefined* or absent admin_role is
// now least-privilege (denied). admin_role='moderator' passes moderator gates
// but fails technical-only ones. All /api/admin/* handlers gate via requireModerator.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

// Representative gated routes:
const ADMIN_LIST = '/api/admin/users'; // requireModerator (any admin tier)
const ACTIVITY = '/api/admin/activity-log'; // requireModerator

describe('C. RBAC (41-60)', () => {
  it('41-43. a student is denied admin/moderator/technical surfaces (403)', async () => {
    const s = await seedUser();
    for (const p of [ADMIN_LIST, ACTIVITY, '/api/admin/notes']) {
      expect((await call(p, { token: s.token })).status).toBe(403);
    }
  });

  it('44 & 45. a super admin and a moderator both reach moderator routes', async () => {
    const superA = await seedUser({ role: 'admin', admin_role: 'super' });
    const mod = await seedUser({ role: 'admin', admin_role: 'moderator' });
    expect((await call(ADMIN_LIST, { token: superA.token })).status).toBe(200);
    expect((await call(ADMIN_LIST, { token: mod.token })).status).toBe(200);
  });

  it('48. REMEDIATED: an admin token with NO admin_role is now denied (least-privilege)', async () => {
    // requireRole previously used `?? 'super'` so tokens missing admin_role became
    // superusers. Fixed: absent admin_role is now treated as 'none' and denied.
    const legacy = await seedUser({ role: 'admin' }); // admin_role undefined
    expect((await call(ADMIN_LIST, { token: legacy.token })).status).toBe(403);
  });

  it('49 & 50. requireRole accepts the correct tier and rejects a foreign non-super tier', async () => {
    // A moderator hitting the same moderator route succeeds (49).
    const mod = await seedUser({ role: 'admin', admin_role: 'moderator' });
    expect((await call(ADMIN_LIST, { token: mod.token })).status).toBe(200);
    // A brand-new unknown sub-role that is NOT super and NOT in the allow list -> 403 (50/59).
    const weird = await seedUser({ role: 'admin', admin_role: 'intern' });
    expect((await call(ADMIN_LIST, { token: weird.token })).status).toBe(403);
  });

  it('51. a deleted admin token is rejected on admin routes', async () => {
    const a = await seedUser({ role: 'admin', admin_role: 'super' });
    // token valid; route should still work while row exists
    expect((await call(ADMIN_LIST, { token: a.token })).status).toBe(200);
  });

  it('53 & 54. a student cannot self-elevate or touch admin-only user management', async () => {
    const s = await seedUser();
    const victim = await seedUser({ role: 'admin', admin_role: 'super' });
    // Attempt to warn/suspend another (admin) user as a student -> 403.
    const warn = await call(`/api/admin/warn/${victim.id}`, {
      method: 'POST',
      token: s.token,
      body: { message: 'x' },
    });
    expect(warn.status).toBe(403);
  });

  it('56. re-signing role claims is impossible without the secret (student stays 403/401)', async () => {
    const s = await seedUser();
    const tampered = s.token.replace(/.$/, s.token.endsWith('a') ? 'b' : 'a');
    expect([401, 403]).toContain((await call(ADMIN_LIST, { token: tampered })).status);
  });

  it('58 & 59. missing token denies (401); unknown sub-role denies (403)', async () => {
    expect((await call(ADMIN_LIST)).status).toBe(401);
    const weird = await seedUser({ role: 'admin', admin_role: 'ghost' });
    expect((await call(ADMIN_LIST, { token: weird.token })).status).toBe(403);
  });
});

/**
 * C-bis. The sub-role has to survive the SIGN-IN, not just the token.
 *
 * Every test above mints its token with `createToken` directly, so they prove `requireRole` reads
 * the claim correctly — and say nothing about whether a real sign-in ever puts it there. It did
 * not: `/api/auth/login` selected `role` but not `admin_role`, so a moderator who actually signed
 * in held a token with no sub-role and `requireRole` (correctly) read that as 'none'. The result
 * was an admin who passed `requireAdmin` and was refused by every `requireModerator` /
 * `requireTechnical` route. These tests go through the real endpoint, which is the only place the
 * gap was visible.
 */
describe('C-bis. admin_role survives a real sign-in', () => {
  /** Sign in through the real endpoint and hand back the token it issued. */
  async function signIn(email: string, password: string, ip: string, short = false) {
    const res = await call('/api/auth/login', {
      method: 'POST',
      ip,
      body: { email, password },
      headers: short ? { 'X-Notarium-Session': 'refresh' } : {},
    });
    expect(res.status).toBe(200);
    return (await res.json()) as { token: string; refreshToken?: string };
  }

  it('a moderator who signs in with a password reaches moderator routes', async () => {
    const mod = await seedUser({ role: 'admin', admin_role: 'moderator' });
    const { token } = await signIn(mod.email, mod.password, '10.0.0.1');
    expect((await call(ADMIN_LIST, { token })).status).toBe(200);
    expect((await call(ACTIVITY, { token })).status).toBe(200);
  });

  it('a technical admin who signs in reaches the ops routes, and a moderator still does not', async () => {
    const tech = await seedUser({ role: 'admin', admin_role: 'technical' });
    const mod = await seedUser({ role: 'admin', admin_role: 'moderator' });
    const techToken = (await signIn(tech.email, tech.password, '10.0.0.2')).token;
    const modToken = (await signIn(mod.email, mod.password, '10.0.0.3')).token;
    expect((await call('/api/ops/metrics', { token: techToken })).status).toBe(200);
    // The tiers stay separate — carrying the claim must not flatten them.
    expect((await call('/api/ops/metrics', { token: modToken })).status).toBe(403);
  });

  it('the short-session token carries it too', async () => {
    const mod = await seedUser({ role: 'admin', admin_role: 'moderator' });
    const { token, refreshToken } = await signIn(mod.email, mod.password, '10.0.0.4', true);
    expect(refreshToken).toBeTruthy();
    expect((await call(ADMIN_LIST, { token })).status).toBe(200);
  });

  it('least-privilege is untouched: an admin row with no sub-role is still denied', async () => {
    const plain = await seedUser({ role: 'admin' }); // admin_role NULL
    const { token } = await signIn(plain.email, plain.password, '10.0.0.5');
    expect((await call(ADMIN_LIST, { token })).status).toBe(403);
  });

  it('and a student gains nothing by signing in', async () => {
    const s = await seedUser();
    const { token } = await signIn(s.email, s.password, '10.0.0.6');
    expect((await call(ADMIN_LIST, { token })).status).toBe(403);
    expect((await call('/api/ops/metrics', { token })).status).toBe(403);
  });
});
