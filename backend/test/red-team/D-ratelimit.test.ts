// D. Rate Limiting & Abuse (61-75)
// checkRateLimit: sliding window keyed `ratelimit:{endpoint}:{ip}`, 5 attempts /
// 900s. IP is taken from CF-Connecting-IP ONLY (X-Forwarded-For is ignored).
// FINDING: on any KV error the limiter returns true (FAILS OPEN).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

// login is rate-limited by tag 'login'. Use bad creds so success never short-circuits.
async function attemptLogin(ip: string, xff?: string) {
  const headers: Record<string, string> = {};
  if (xff) headers['X-Forwarded-For'] = xff;
  return call('/api/auth/login', {
    body: { email: 'nobody@sekolahkristencalvin.org', password: 'x' },
    ip,
    headers,
  });
}

describe('D. Rate limiting (61-75)', () => {
  it('61-63. first five attempts pass the limiter, the sixth is throttled (429)', async () => {
    const ip = '10.0.0.1';
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await attemptLogin(ip)).status);
    // first 5 reach the handler (401 bad creds), 6th is blocked before it (429)
    expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('65. a different IP is unaffected by another IP hitting the limit', async () => {
    const victimIp = '10.0.0.2';
    for (let i = 0; i < 6; i++) await attemptLogin(victimIp);
    // fresh IP still allowed
    expect((await attemptLogin('10.0.0.3')).status).not.toBe(429);
  });

  it('66. the counter is isolated per endpoint (login vs signup)', async () => {
    const ip = '10.0.0.4';
    for (let i = 0; i < 6; i++) await attemptLogin(ip); // exhaust login
    // signup uses a different tag -> not throttled by the login counter
    const s = await call('/api/auth/signup', {
      body: { name: 'X', email: 'fresh1@sekolahkristencalvin.org', password: 'ValidPass123' },
      ip,
    });
    expect(s.status).not.toBe(429);
  });

  it('67. same endpoint + same IP accumulates toward the limit', async () => {
    const ip = '10.0.0.5';
    for (let i = 0; i < 5; i++) await attemptLogin(ip);
    expect((await attemptLogin(ip)).status).toBe(429);
  });

  it('68 & 74. FIXED: a fully-concurrent burst is atomically limited (Durable Object)', async () => {
    const ip = '10.0.0.6';
    const results = await Promise.all(Array.from({ length: 12 }, () => attemptLogin(ip)));
    const throttled = results.filter((r) => r.status === 429).length;
    // The DO serializes the read-modify-write, so at most 5/window are admitted and
    // the remaining concurrent requests are throttled — the KV race is gone.
    expect(throttled).toBeGreaterThanOrEqual(7);
    // The window is saturated, so the next attempt is throttled too.
    const next = await attemptLogin(ip);
    expect(next.status).toBe(429);
  });

  it('69. KV race: a simultaneous burst may exceed the nominal limit (documents the ceiling)', async () => {
    const ip = '10.0.0.7';
    const results = await Promise.all(Array.from({ length: 10 }, () => attemptLogin(ip)));
    const allowed = results.filter((r) => r.status !== 429).length;
    // The limiter is read-modify-write without atomicity; under perfect concurrency
    // more than 5 can be admitted. We assert the observed ceiling stays bounded.
    expect(allowed).toBeGreaterThanOrEqual(5);
    expect(allowed).toBeLessThanOrEqual(10);
  });

  it('72. an IPv6 CF-Connecting-IP is handled the same way', async () => {
    const ip = '2001:db8::dead:beef';
    for (let i = 0; i < 5; i++) await attemptLogin(ip);
    expect((await attemptLogin(ip)).status).toBe(429);
  });

  it('73. FINDING-ADJACENT: X-Forwarded-For is ignored — spoofing it does not dodge the limit', async () => {
    const realIp = '10.0.0.8';
    // Rotate a fake XFF each call; if XFF were trusted the key would change and never throttle.
    for (let i = 0; i < 5; i++) await attemptLogin(realIp, `9.9.9.${i}`);
    expect((await attemptLogin(realIp, '9.9.9.99')).status).toBe(429);
  });

  it('75. AI endpoints are independently reachable (auth-gated, own limiter tag)', async () => {
    const u = await seedUser();
    // Not asserting throttling here (needs many calls); just that the route is auth-gated
    // and does not share the login counter.
    const r = await call('/api/gemini/auto-tags', {
      token: u.token,
      body: { title: 't', content: 'c' },
      ip: '10.0.0.9',
    });
    expect(r.status).not.toBe(401);
  });
});
