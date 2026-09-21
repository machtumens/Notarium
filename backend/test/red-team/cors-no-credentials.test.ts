// M2.2 — no Access-Control-Allow-Credentials.
//
// The app is bearer-only: the token travels in the Authorization header,
// nothing is cookie-based, and neither frontend calls fetch with
// `credentials: 'include'`. Advertising `Allow-Credentials: true` bought
// nothing and would turn any future allow-list mistake into a
// credentialed cross-site request. The header must be absent on every
// response shape the worker produces: preflight, a normal 200, the 404
// fallback (built without env) and the maintenance 503.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

const ORIGIN = 'http://localhost:5173';
const CREDENTIALS = 'Access-Control-Allow-Credentials';

describe('CORS — Access-Control-Allow-Credentials is never sent', () => {
  it('absent on a preflight, which still answers the origin and headers', async () => {
    const res = await call('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/Authorization/);
    expect(res.headers.get(CREDENTIALS)).toBeNull();
  });

  it('absent on a normal 200', async () => {
    const res = await call('/api/health', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get(CREDENTIALS)).toBeNull();
  });

  it('absent on the 404 fallback (a response built without env)', async () => {
    const res = await call('/api/no-such-route', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get(CREDENTIALS)).toBeNull();
  });

  it('absent on the maintenance 503', async () => {
    await env.RATE_LIMIT.put('site:maintenance', 'on');
    const res = await call('/api/subjects', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(503);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get(CREDENTIALS)).toBeNull();
  });
});
