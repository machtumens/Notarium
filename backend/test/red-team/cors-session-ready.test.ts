// M1.3 — CORS allow-list carries X-Notarium-Session; GET /api/ready.
//
// The V2.0 client sends `X-Notarium-Session: refresh` on login/signup. A
// custom header missing from Access-Control-Allow-Headers makes the browser
// block the request at preflight, so sign-in was unreachable from V2.0. The
// worker ignores the header for now (no refresh tokens in this wave).
//
// /api/ready is the dependency probe deploy checks and monitors use: D1 and
// KV must both answer, and the result must never be cached.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, env } from './helpers';
import { readyCheck } from '../../src/routes/ops';
import type { Env } from '../../src/lib/env';

beforeAll(applySchema);
beforeEach(resetData);

const ORIGIN = 'http://localhost:5173';

describe('CORS — X-Notarium-Session is an allowed request header', () => {
  it('preflight for login lists X-Notarium-Session', async () => {
    const res = await call('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-notarium-session',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/X-Notarium-Session/);
  });

  it('a normal response lists X-Notarium-Session too', async () => {
    const res = await call('/api/health', { headers: { Origin: ORIGIN } });
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/X-Notarium-Session/);
  });

  it('login still works when the client sends the header (it is ignored)', async () => {
    const res = await call('/api/auth/login', {
      body: { email: 'nobody@sekolahkristencalvin.org', password: 'wrong' },
      headers: { 'X-Notarium-Session': 'refresh' },
      ip: '50.0.0.1',
    });
    // Wrong credentials — but the request reached the handler (401, not a CORS
    // block, not a 4xx/5xx from the middleware).
    expect(res.status).toBe(401);
  });
});

// Minimal Env stand-ins for the dependency-failure paths: readyCheck only
// touches DB, RATE_LIMIT and the CORS-origin vars.
function envWith(overrides: Partial<Env>): Env {
  return {
    DB: env.DB,
    RATE_LIMIT: env.RATE_LIMIT,
    JWT_SECRET: env.JWT_SECRET,
    ADMIN_PASSWORD: env.ADMIN_PASSWORD,
    FRONTEND_URL: env.FRONTEND_URL,
    ...overrides,
  } as Env;
}

const brokenDb = {
  prepare: () => ({
    first: async () => {
      throw new Error('D1 unavailable');
    },
  }),
} as unknown as D1Database;

const brokenKv = {
  get: async () => {
    throw new Error('KV unavailable');
  },
} as unknown as KVNamespace;

describe('GET /api/ready', () => {
  it('200 {ok:true, checks} with Cache-Control: no-store when D1 and KV answer', async () => {
    const res = await call('/api/ready', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const body = (await res.json()) as any;
    expect(body).toEqual({ ok: true, checks: { db: true, kv: true } });
  });

  it('503 {ok:false} with checks.db=false when D1 is down (still no-store)', async () => {
    const res = await readyCheck(
      new Request('https://test.local/api/ready'),
      envWith({ DB: brokenDb }),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.checks.db).toBe(false);
    expect(body.checks.kv).toBe(true);
  });

  it('503 {ok:false} with checks.kv=false when KV is down', async () => {
    const res = await readyCheck(
      new Request('https://test.local/api/ready'),
      envWith({ RATE_LIMIT: brokenKv }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body).toEqual({ ok: false, checks: { db: true, kv: false } });
  });

  it('is reachable while maintenance mode is on (a probe must not page during planned downtime)', async () => {
    await env.RATE_LIMIT.put('site:maintenance', 'on');
    const res = await call('/api/ready');
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).ok).toBe(true);
  });

  it('is GET-only', async () => {
    const res = await call('/api/ready', { method: 'POST', body: {} });
    expect(res.status).toBe(404);
  });
});
