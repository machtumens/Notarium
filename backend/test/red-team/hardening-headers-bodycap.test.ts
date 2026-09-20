// M1.4 — defence-in-depth the master audit has and main lacked.
//
// F14: jsonResponse() called without `env` (most error paths, the 404
// fallback, /test) omitted SECURITY_HEADERS. The outer fetch() now stamps them
// on every response, and a throw that escapes _handle becomes a JSON 500
// with the same headers instead of a bare runtime error.
//
// Body cap: validateRequestSize() ran on signup/login only and trusted the
// Content-Length header. Every /api/ request with a body is now capped at
// MAX_REQUEST_SIZE — by header first, then on the bytes actually streamed.
//
// password_hash: never appeared in a response (audit §3); the assertions below
// only lock that in. They were green before this change.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, env, SELF } from './helpers';
import worker from '../../src/index';
import { MAX_REQUEST_SIZE } from '../../src/lib/env';

beforeAll(applySchema);
beforeEach(resetData);

function expectSecurityHeaders(res: Response) {
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
  expect(res.headers.get('Referrer-Policy')).toBeTruthy();
}

describe('F14 — security headers on every response', () => {
  it('the 404 fallback carries them', async () => {
    const res = await call('/api/does/not/exist');
    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });

  it('a 401 built without env (my-notes, no token) carries them', async () => {
    const res = await call('/api/notes/my-notes');
    expect(res.status).toBe(401);
    expectSecurityHeaders(res);
  });

  it('the /test route carries them', async () => {
    const res = await call('/test');
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });

  it('a throw that escapes _handle becomes a JSON 500 with the headers (outer catch)', async () => {
    const crashing = {
      ...worker,
      _handle: async () => {
        throw new Error('simulated unhandled failure');
      },
    };
    const res = await crashing.fetch(
      new Request('https://test.local/api/subjects', {
        headers: { Origin: 'http://localhost:5173' },
      }),
      env,
    );
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expectSecurityHeaders(res);
    const body = await res.text();
    expect(body).toBe(JSON.stringify({ error: 'Internal server error' }));
    expect(body).not.toMatch(/simulated/);
  });
});

describe('Body-size cap on every /api/ route with a body', () => {
  it('a Content-Length over the cap is rejected with 413 before any handler runs', async () => {
    const me = await seedUser();
    const res = await worker.fetch(
      new Request('https://test.local/api/user/class', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'content-length': String(MAX_REQUEST_SIZE + 1),
          Authorization: `Bearer ${me.token}`,
        },
        body: JSON.stringify({ class: '11.1' }),
      }),
      env,
    );
    expect(res.status).toBe(413);
    expectSecurityHeaders(res);
    const row = (await env.DB.prepare('SELECT class AS v FROM users WHERE id = ?')
      .bind(me.id)
      .first()) as { v: string };
    expect(row.v).toBe('10.1'); // handler never ran
  });

  it('a streamed body over the cap with no Content-Length is rejected with 413', async () => {
    const me = await seedUser();
    const chunk = new Uint8Array(1024 * 1024).fill(0x20); // 1 MiB of spaces
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_REQUEST_SIZE) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        sent += chunk.byteLength;
      },
    });
    // In-process call: the worker cancels the upload once the cap is crossed,
    // and over the loopback socket that surfaces as an unhandled client-side
    // "connection lost" rejection in the test runner. Handing the stream to
    // worker.fetch directly exercises the same cap on the same bytes.
    const res = await worker.fetch(
      new Request('https://test.local/api/user/class', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${me.token}` },
        body,
      }),
      env,
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as any).error).toBe('Request too large');
    expect(sent).toBeLessThan(MAX_REQUEST_SIZE * 2); // the worker stopped reading, not the client
  });

  it('a normal streamed JSON body still reaches the handler intact', async () => {
    const me = await seedUser();
    const payload = new TextEncoder().encode(JSON.stringify({ class: '11.3' }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload.slice(0, 5));
        controller.enqueue(payload.slice(5));
        controller.close();
      },
    });
    const res = await SELF.fetch('https://test.local/api/user/class', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${me.token}` },
      body,
    });
    expect(res.status).toBe(200);
    const row = (await env.DB.prepare('SELECT class AS v FROM users WHERE id = ?')
      .bind(me.id)
      .first()) as { v: string };
    expect(row.v).toBe('11.3');
  });

  it('a normal JSON login body is unaffected', async () => {
    const me = await seedUser();
    const res = await call('/api/auth/login', {
      body: { email: me.email, password: me.password },
      ip: '60.0.0.1',
    });
    expect(res.status).toBe(200);
  });
});

describe('password_hash never leaves the worker (regression lock — already true)', () => {
  it('/api/auth/me, /api/user/me and /api/admin/users omit it', async () => {
    const me = await seedUser();
    const admin = await seedUser({ role: 'admin', admin_role: 'super' });
    for (const [path, token] of [
      ['/api/auth/me', me.token],
      ['/api/user/me', me.token],
      ['/api/admin/users', admin.token],
    ] as const) {
      const res = await call(path, { token });
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).not.toMatch(/password_hash|\$2[aby]\$/);
    }
  });
});
