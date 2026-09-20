// Bearer-only identity on the legacy /api/user/update and /api/user/class routes.
//
// FINDING (main-lineage delta F10): both routes trusted the client-asserted
// `X-Encrypted-Yw-ID` header as identity — no token check at all — and
// /api/user/update even auto-created a user row from it. Anyone could rename,
// re-email or re-class any account by naming its encrypted_yw_id in a header.
// Identity must come from the Bearer token only (getUserIdFromToken).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

const ROUTES = [
  {
    path: '/api/user/update',
    method: 'POST',
    body: { display_name: 'Renamed By Attacker' },
    column: 'display_name',
  },
  { path: '/api/user/class', method: 'PUT', body: { class: '12.9' }, column: 'class' },
] as const;

async function column(userId: number, col: string): Promise<unknown> {
  const row = (await env.DB.prepare(`SELECT ${col} AS v FROM users WHERE id = ?`)
    .bind(userId)
    .first()) as { v: unknown };
  return row.v;
}

async function userCount(): Promise<number> {
  const row = (await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first()) as { c: number };
  return row.c;
}

for (const r of ROUTES) {
  describe(`${r.method} ${r.path} — identity comes from the Bearer token only`, () => {
    it('header-only identity is rejected with 401 and the named row is untouched', async () => {
      const victim = await seedUser();
      const before = await column(victim.id, r.column);

      const res = await call(r.path, {
        method: r.method,
        body: r.body,
        headers: { 'X-Encrypted-Yw-ID': `yw_${victim.email}` },
      });

      expect(res.status).toBe(401);
      expect(await column(victim.id, r.column)).toBe(before);
    });

    it('header-only identity for an unknown id never creates a user', async () => {
      await seedUser();
      const before = await userCount();

      const res = await call(r.path, {
        method: r.method,
        body: { ...r.body, email: 'ghost@sekolahkristencalvin.org' },
        headers: { 'X-Encrypted-Yw-ID': 'yw_nobody' },
      });

      expect(res.status).toBe(401);
      expect(await userCount()).toBe(before);
    });

    it('a garbage bearer token is rejected with 401', async () => {
      const victim = await seedUser();
      const res = await call(r.path, {
        method: r.method,
        body: r.body,
        token: 'not.a.jwt',
        headers: { 'X-Encrypted-Yw-ID': `yw_${victim.email}` },
      });
      expect(res.status).toBe(401);
      expect(await column(victim.id, r.column)).not.toBe(r.body[r.column]);
    });

    it('a valid bearer token updates the caller’s own row', async () => {
      const me = await seedUser();
      const res = await call(r.path, { method: r.method, body: r.body, token: me.token });

      expect(res.status).toBe(200);
      expect(((await res.json()) as any).success).toBe(true);
      expect(await column(me.id, r.column)).toBe(r.body[r.column]);
    });

    it('user A cannot change user B by naming B in the header', async () => {
      const a = await seedUser();
      const b = await seedUser();
      const bBefore = await column(b.id, r.column);

      const res = await call(r.path, {
        method: r.method,
        body: r.body,
        token: a.token,
        headers: { 'X-Encrypted-Yw-ID': `yw_${b.email}` },
      });

      expect(res.status).toBe(200);
      expect(await column(b.id, r.column)).toBe(bBefore); // B untouched
      expect(await column(a.id, r.column)).toBe(r.body[r.column]); // A changed A
    });
  });
}

describe('CORS allow-list no longer advertises the dead identity header', () => {
  it('preflight Access-Control-Allow-Headers omits X-Encrypted-Yw-ID', async () => {
    const res = await call('/api/user/update', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
    });
    expect(res.status).toBe(204);
    const allowed = res.headers.get('Access-Control-Allow-Headers') ?? '';
    expect(allowed).toMatch(/Authorization/);
    expect(allowed).not.toMatch(/X-Encrypted-Yw-ID/i);
  });

  it('a normal response’s Access-Control-Allow-Headers omits X-Encrypted-Yw-ID too', async () => {
    const res = await call('/api/health', { headers: { Origin: 'http://localhost:5173' } });
    const allowed = res.headers.get('Access-Control-Allow-Headers') ?? '';
    expect(allowed).not.toMatch(/X-Encrypted-Yw-ID/i);
  });
});
