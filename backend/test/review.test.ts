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
