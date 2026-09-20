/**
 * W4.2 — GET /api/health (liveness, touches no binding) and GET /api/ready (D1 `SELECT 1` +
 * a KV read; 503 with the per-binding verdicts when one fails). No `initTestDatabase()`:
 * neither route needs a table, and /api/health must answer on an empty database.
 */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { BASE, json } from './setup';

describe('W4.2 — GET /api/health', () => {
  it('answers {ok, version, env} from the bundle vars alone, uncached, with the security headers', async () => {
    const prepare = vi.spyOn(env.DB, 'prepare');
    const kvGet = vi.spyOn(env.RATE_LIMIT, 'get');
    try {
      const res = await SELF.fetch(`${BASE}/api/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(await json(res)).toEqual({ ok: true, version: 'test-sha', env: 'development' });
      expect(prepare, 'health never touches D1').not.toHaveBeenCalled();
      expect(kvGet, 'health never touches KV').not.toHaveBeenCalled();
    } finally {
      prepare.mockRestore();
      kvGet.mockRestore();
    }
  });

  it('is GET-only', async () => {
    const res = await SELF.fetch(`${BASE}/api/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(404);
  });
});

describe('W4.2 — GET /api/ready', () => {
  it('200 {ok:true, checks:{d1:ok, kv:ok}} when both bindings answer, uncached', async () => {
    const res = await SELF.fetch(`${BASE}/api/ready`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await json(res)).toEqual({ ok: true, checks: { d1: 'ok', kv: 'ok' } });
  });

  it('503 {ok:false, checks:{d1:fail, kv:ok}} when D1 throws — and the error text stays out of the body', async () => {
    const original = env.DB.prepare.bind(env.DB);
    const prepare = vi.spyOn(env.DB, 'prepare').mockImplementation((query: string) => {
      if (/SELECT 1/.test(query)) {
        return { first: () => Promise.reject(new Error('D1_ERROR: internal error SQLITE_IOERR secret-detail')) } as unknown as D1PreparedStatement;
      }
      return original(query);
    });
    try {
      const res = await SELF.fetch(`${BASE}/api/ready`);
      expect(res.status).toBe(503);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ ok: false, checks: { d1: 'fail', kv: 'ok' } });
      expect(text).not.toContain('secret-detail');
    } finally {
      prepare.mockRestore();
    }
  });

  it('503 {ok:false, checks:{d1:ok, kv:fail}} when KV throws', async () => {
    const kvGet = vi.spyOn(env.RATE_LIMIT, 'get').mockRejectedValue(new Error('KV_ERROR: unavailable') as never);
    try {
      const res = await SELF.fetch(`${BASE}/api/ready`);
      expect(res.status).toBe(503);
      expect(await json(res)).toEqual({ ok: false, checks: { d1: 'ok', kv: 'fail' } });
    } finally {
      kvGet.mockRestore();
    }
  });

  it('is GET-only', async () => {
    const res = await SELF.fetch(`${BASE}/api/ready`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(404);
  });
});
