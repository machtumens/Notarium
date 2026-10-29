// K. Security hardening, 29 Oct 2026 — one regression per finding in
// docs/security/SECURITY_AUDIT.md (IDs in each describe). Every case asserts
// the server refuses, not that a UI hides something.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { applySchema, resetData, call, seedUser, env } from './helpers';
import { isReservedAdminEmail } from '../../src/lib/auth';

beforeAll(applySchema);
beforeEach(resetData);

/** A real HS256 token for `user`, issued `ageSec` seconds ago. */
async function tokenIssuedAgo(user: { id: number; email: string; role: string }, ageSec: number) {
  const iat = Math.floor(Date.now() / 1000) - ageSec;
  return await new SignJWT({ id: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(iat + 24 * 3600)
    .sign(new TextEncoder().encode(env.JWT_SECRET));
}

async function seedRefreshRow(userId: number) {
  await env.DB.prepare(
    `INSERT INTO refresh_tokens (user_id, token, family, expires_at) VALUES (?, ?, 'fam', '2999-01-01T00:00:00Z')`,
  )
    .bind(userId, `hash-${userId}-${Math.random()}`)
    .run();
}

async function refreshRows(userId: number): Promise<number> {
  const r = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = ?`)
    .bind(userId)
    .first()) as { n: number };
  return r.n;
}

describe('SEC-01 — reserved admin domains cannot be claimed', () => {
  it('signup on @notariumadmin.com is refused', async () => {
    const res = await call('/api/auth/signup', {
      body: { name: 'x', email: 'boss@notariumadmin.com', password: 'ValidPass123' },
      ip: '50.0.0.1',
    });
    expect(res.status).toBe(400);
  });

  it('signup on @notarium.internal is refused, case-insensitively', async () => {
    const res = await call('/api/auth/signup', {
      body: { name: 'x', email: 'Admin@Notarium.Internal', password: 'ValidPass123' },
      ip: '50.0.0.2',
    });
    expect(res.status).toBe(400);
  });

  it('the reserved-domain check the OAuth callback uses matches both domains only', () => {
    expect(isReservedAdminEmail('a@notariumadmin.com')).toBe(true);
    expect(isReservedAdminEmail(' A@NOTARIUM.INTERNAL ')).toBe(true);
    expect(isReservedAdminEmail('a@gmail.com')).toBe(false);
    expect(isReservedAdminEmail('a@notariumadmin.com.evil.org')).toBe(false);
  });
});

describe('SEC-02 — the shared admin password cannot be guessed by rotating emails', () => {
  it('a 6th wrong guess from one IP is refused even on a never-seen address', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await call('/api/auth/login', {
        body: { email: `guess${i}@notariumadmin.com`, password: 'wrong-guess' },
        ip: '50.1.0.1',
      });
      expect(res.status).toBe(401);
    }
    const sixth = await call('/api/auth/login', {
      body: { email: 'fresh-address@notariumadmin.com', password: 'wrong-guess' },
      ip: '50.1.0.1',
    });
    expect(sixth.status).toBe(429);
  });
});

describe('SEC-03 — a bearer token alone cannot switch 2FA off', () => {
  it('2fa/setup on an account with 2FA on is refused and leaves 2FA on', async () => {
    const u = await seedUser();
    await env.DB.prepare(
      `UPDATE users SET totp_enabled = 1, totp_secret = 'JBSWY3DPEHPK3PXP' WHERE id = ?`,
    )
      .bind(u.id)
      .run();
    const res = await call('/api/auth/2fa/setup', { method: 'POST', token: u.token });
    expect(res.status).toBe(409);
    const row = (await env.DB.prepare(`SELECT totp_enabled, totp_secret FROM users WHERE id = ?`)
      .bind(u.id)
      .first()) as { totp_enabled: number; totp_secret: string };
    expect(row.totp_enabled).toBe(1);
    expect(row.totp_secret).toBe('JBSWY3DPEHPK3PXP');
  });

  it('2fa/setup still works for an account without 2FA', async () => {
    const u = await seedUser();
    const res = await call('/api/auth/2fa/setup', { method: 'POST', token: u.token });
    expect(res.status).toBe(200);
  });

  it('2fa/disable stops answering wrong passwords after 5 tries', async () => {
    const u = await seedUser();
    for (let i = 0; i < 5; i++) {
      const res = await call('/api/auth/2fa/disable', {
        token: u.token,
        body: { password: `wrong-${i}` },
      });
      expect(res.status).toBe(400);
    }
    const sixth = await call('/api/auth/2fa/disable', {
      token: u.token,
      body: { password: u.password },
    });
    expect(sixth.status).toBe(429);
  });
});

describe('SEC-04 — set-password needs a fresh sign-in', () => {
  it('a token issued an hour ago cannot set a password', async () => {
    const u = await seedUser({ password: 'OriginalPass1' });
    const stale = await tokenIssuedAgo(u, 3600);
    const res = await call('/api/auth/set-password', {
      token: stale,
      body: { newPassword: 'AttackerPass9' },
    });
    expect(res.status).toBe(401);
    const login = await call('/api/auth/login', {
      body: { email: u.email, password: 'OriginalPass1' },
      ip: '50.4.0.1',
    });
    expect(login.status).toBe(200);
  });

  it('a fresh token can, and every refresh chain of that account ends', async () => {
    const u = await seedUser();
    await seedRefreshRow(u.id);
    const fresh = await tokenIssuedAgo(u, 30);
    const res = await call('/api/auth/set-password', {
      token: fresh,
      body: { newPassword: 'NewPass12345' },
    });
    expect(res.status).toBe(200);
    expect(await refreshRows(u.id)).toBe(0);
  });
});

describe('SEC-05 — only a super admin may set another user’s password', () => {
  const routes = [
    ['/api/auth/admin-reset-password', (email: string) => ({ email, newPassword: 'Taken0ver!' })],
    [
      '/api/admin/emergency-password-fix',
      (email: string) => ({ email, newPassword: 'Taken0ver!' }),
    ],
    ['/api/admin/migrate-passwords', () => ({})],
  ] as const;

  for (const sub of ['moderator', 'technical'] as const) {
    for (const [path, body] of routes) {
      it(`${sub} is refused on ${path}`, async () => {
        const admin = await seedUser({ role: 'admin', admin_role: sub });
        const victim = await seedUser({ password: 'VictimPass1' });
        const res = await call(path, { token: admin.token, body: body(victim.email) });
        expect(res.status).toBe(403);
      });
    }
  }

  it('a student is refused too', async () => {
    const student = await seedUser();
    const victim = await seedUser();
    const res = await call('/api/admin/emergency-password-fix', {
      token: student.token,
      body: { email: victim.email, newPassword: 'Taken0ver!' },
    });
    expect(res.status).toBe(403);
  });

  it('super succeeds, the reset is logged, and the target’s refresh chains end', async () => {
    const admin = await seedUser({ role: 'admin', admin_role: 'super' });
    const victim = await seedUser();
    await seedRefreshRow(victim.id);
    const res = await call('/api/admin/emergency-password-fix', {
      token: admin.token,
      body: { email: victim.email, newPassword: 'ResetPass123' },
    });
    expect(res.status).toBe(200);
    expect(await refreshRows(victim.id)).toBe(0);
    const log = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM admin_activity_log WHERE action_type = 'reset_password' AND target_id = ?`,
    )
      .bind(victim.id)
      .first();
    expect((log as { n: number }).n).toBe(1);
  });
});

describe('SEC-06 — a suspension takes effect on tokens already issued', () => {
  it('a suspended user’s live token is refused on row-loading routes', async () => {
    const u = await seedUser({ suspended: true });
    const res = await call('/api/notes/my-notes', { token: u.token });
    expect(res.status).toBe(401);
  });

  it('…and on token-only routes', async () => {
    const u = await seedUser({ suspended: true });
    const res = await call('/api/reviews/due', { token: u.token });
    expect(res.status).toBe(401);
  });

  it('a suspension whose end date has passed no longer blocks', async () => {
    const u = await seedUser({ suspended: true });
    await env.DB.prepare(
      `UPDATE users SET suspension_end_date = '2000-01-01T00:00:00Z' WHERE id = ?`,
    )
      .bind(u.id)
      .run();
    const res = await call('/api/reviews/due', { token: u.token });
    expect(res.status).toBe(200);
  });
});

describe('SEC-07 — changing a password ends other devices’ refresh chains', () => {
  it('change-password clears refresh_tokens for the account', async () => {
    const u = await seedUser({ password: 'CurrentPass1' });
    await seedRefreshRow(u.id);
    const res = await call('/api/auth/change-password', {
      token: u.token,
      body: { currentPassword: 'CurrentPass1', newPassword: 'NextPass1234' },
    });
    expect(res.status).toBe(200);
    expect(await refreshRows(u.id)).toBe(0);
  });
});

describe('SEC-09 — note-based AI routes share the per-user AI budget', () => {
  it('a 6th note quiz call inside the window is refused', async () => {
    const u = await seedUser();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await call('/api/notes/1/quiz', { method: 'POST', token: u.token, body: {} });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });
});

describe('SEC-08 — the admin-password oracle is gone', () => {
  it('POST /api/admin/verify is a 404', async () => {
    const res = await call('/api/admin/verify', {
      body: { email: 'x@notarium.site', password: 'anything' },
    });
    expect(res.status).toBe(404);
  });
});
