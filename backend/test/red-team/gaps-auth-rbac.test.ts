// Gap-closing suite: A15, B33/B34, C46/47/52/55/57/60.
// Fills the numbered scenarios that the primary A/B/C files consolidated away.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, env, TEST_SECRETS } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('A15 — password reset lifecycle (admin-driven)', () => {
  it('after an admin resets a password, the old one fails and the new one works', async () => {
    const admin = await seedUser({ role: 'admin', admin_role: 'super' });
    const user = await seedUser({ password: 'OldPass123' });

    // Admin sets a new password (emergency-password-fix, requireAdmin).
    const reset = await call('/api/admin/emergency-password-fix', {
      method: 'POST',
      token: admin.token,
      body: { email: user.email, newPassword: 'BrandNew456' },
    });
    expect(reset.status).toBe(200);

    // Old password no longer works; the new one does.
    const oldTry = await call('/api/auth/login', {
      body: { email: user.email, password: 'OldPass123' },
      ip: '40.1.0.1',
    });
    expect(oldTry.status).not.toBe(200);
    const newTry = await call('/api/auth/login', {
      body: { email: user.email, password: 'BrandNew456' },
      ip: '40.1.0.2',
    });
    expect(newTry.status).toBe(200);
  });
});

describe('B33/B34 — token vs account state, statelessness', () => {
  it('B33 FINDING: a suspended user’s token is still accepted by /api/auth/me (suspension not enforced token-side)', async () => {
    const u = await seedUser({ suspended: true });
    const res = await call('/api/auth/me', { token: u.token });
    // Login blocks suspended users, but /me only re-loads the row and does not
    // re-check `suspended`. If this is 200, an already-issued token keeps working
    // for a user suspended after issuance — documented finding.
    expect(res.status).toBe(200);
  });

  it('B34: JWTs are stateless — the same token authenticates across independent requests (survives "restart")', async () => {
    const u = await seedUser();
    // There is no server-side session to lose on restart; the HS256 token verifies
    // purely from JWT_SECRET. Repeated independent calls all succeed.
    for (let i = 0; i < 3; i++) {
      expect((await call('/api/auth/me', { token: u.token })).status).toBe(200);
    }
  });
});

describe('C46/47 — technical-tier routes (/api/ops/*, requireTechnical)', () => {
  const OPS = '/api/ops/metrics';
  it('C46: a technical admin reaches an ops route', async () => {
    const tech = await seedUser({ role: 'admin', admin_role: 'technical' });
    expect((await call(OPS, { token: tech.token })).status).toBe(200);
  });
  it('a super admin also reaches ops routes', async () => {
    const sup = await seedUser({ role: 'admin', admin_role: 'super' });
    expect((await call(OPS, { token: sup.token })).status).toBe(200);
  });
  it('C47: a moderator is denied a technical-only ops route (403)', async () => {
    const mod = await seedUser({ role: 'admin', admin_role: 'moderator' });
    expect((await call(OPS, { token: mod.token })).status).toBe(403);
  });
  it('a student is denied ops routes', async () => {
    const s = await seedUser();
    expect((await call(OPS, { token: s.token })).status).toBe(403);
  });
});

describe('C52/57 — admin user-edit privilege guard', () => {
  it('C52: a MODERATOR cannot escalate a user to admin (role field is silently skipped)', async () => {
    const mod = await seedUser({ role: 'admin', admin_role: 'moderator' });
    const victim = await seedUser(); // student
    const res = await call(`/api/admin/user/${victim.id}`, {
      method: 'PUT',
      token: mod.token,
      body: { display_name: 'Renamed', role: 'admin' },
    });
    expect(res.status).toBeLessThan(300); // request succeeds (display_name applied)...
    const row = (await env.DB.prepare('SELECT role FROM users WHERE id = ?')
      .bind(victim.id)
      .first()) as any;
    expect(row.role).toBe('student'); // ...but the role escalation is NOT applied
  });

  it('C57: admin_role is never settable via this endpoint, even by a super admin', async () => {
    const superA = await seedUser({ role: 'admin', admin_role: 'super' });
    const victim = await seedUser();
    await call(`/api/admin/user/${victim.id}`, {
      method: 'PUT',
      token: superA.token,
      body: { role: 'admin', admin_role: 'super' }, // super MAY promote role...
    });
    const row = (await env.DB.prepare('SELECT role, admin_role FROM users WHERE id = ?')
      .bind(victim.id)
      .first()) as any;
    expect(row.role).toBe('admin'); // ...role promotion by super is by-design
    expect(row.admin_role ?? null).toBeNull(); // ...but admin_role is never written here
  });

  it('C57b: demotion to student is always allowed (role downgrade enforced/available)', async () => {
    const superA = await seedUser({ role: 'admin', admin_role: 'super' });
    const target = await seedUser({ role: 'admin', admin_role: 'moderator' });
    await call(`/api/admin/user/${target.id}`, {
      method: 'PUT',
      token: superA.token,
      body: { role: 'student' },
    });
    const row = (await env.DB.prepare('SELECT role FROM users WHERE id = ?')
      .bind(target.id)
      .first()) as any;
    expect(row.role).toBe('student');
  });
});

describe('C55/C60 — a student cannot perform or leave a trace of admin actions', () => {
  it('C55: a student cannot restore a note (403)', async () => {
    const s = await seedUser();
    const res = await call('/api/admin/notes/1/restore', { method: 'POST', token: s.token });
    expect(res.status).toBe(403);
  });

  it('C60: a denied escalation attempt writes NO admin activity-log row (no state from a rejected action)', async () => {
    const s = await seedUser();
    const victim = await seedUser();
    const before = (await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM admin_activity_log',
    ).first()) as any;
    await call(`/api/admin/suspend/${victim.id}`, {
      method: 'POST',
      token: s.token,
      body: { reason: 'x' },
    });
    const after = (await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM admin_activity_log',
    ).first()) as any;
    expect(after.c).toBe(before.c); // rejected before any logging/side effect
  });
});

// Referenced so TEST_SECRETS stays imported if the suite is trimmed later.
void TEST_SECRETS;
