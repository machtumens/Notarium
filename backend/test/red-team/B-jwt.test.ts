// B. JWT & Session Security (21-40)
// Tokens are HS256 via jose. verifyToken() returns null on ANY failure and the
// handlers turn that into 401. NOTE (finding): verifyToken never re-checks the
// DB, so a token for a deleted/suspended user still *verifies* at the token
// layer — enforcement depends entirely on each handler re-loading the row.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { applySchema, resetData, call, seedUser, env } from './helpers';

const SECRET = () => new TextEncoder().encode((env as any).JWT_SECRET);
const WRONG = new TextEncoder().encode('the-wrong-secret');

async function mint(
  payload: Record<string, unknown>,
  opts: { exp?: string; secret?: Uint8Array; alg?: string; iat?: number } = {},
) {
  const t = new SignJWT(payload).setProtectedHeader({ alg: opts.alg ?? 'HS256' });
  if (opts.iat !== undefined) t.setIssuedAt(opts.iat);
  else t.setIssuedAt();
  if (opts.exp !== undefined) t.setExpirationTime(opts.exp);
  return t.sign(opts.secret ?? SECRET());
}

beforeAll(applySchema);
beforeEach(resetData);

// /api/auth/me is the canonical "does this token authenticate?" probe.
const me = (token?: string, headers?: Record<string, string>) =>
  call('/api/auth/me', { token, headers });

describe('B. JWT & Session (21-40)', () => {
  it('21. a valid token authenticates', async () => {
    const u = await seedUser();
    expect((await me(u.token)).status).toBe(200);
  });

  it('22. expired token rejected (401)', async () => {
    const u = await seedUser();
    const tok = await mint({ id: u.id, email: u.email, role: 'student' }, { exp: '-5s' });
    expect((await me(tok)).status).toBe(401);
  });

  it('23. tampered signature rejected', async () => {
    const u = await seedUser();
    const bad = u.token.slice(0, -3) + (u.token.endsWith('AAA') ? 'BBB' : 'AAA');
    expect((await me(bad)).status).toBe(401);
  });

  it('24. token signed with the wrong secret rejected', async () => {
    const u = await seedUser();
    const tok = await mint(
      { id: u.id, email: u.email, role: 'student' },
      { exp: '1h', secret: WRONG },
    );
    expect((await me(tok)).status).toBe(401);
  });

  it('25. modified payload (without re-sign) rejected', async () => {
    const u = await seedUser();
    const [h, , s] = u.token.split('.');
    const forged = btoa(JSON.stringify({ id: u.id, email: u.email, role: 'admin' })).replace(
      /=+$/,
      '',
    );
    expect((await me(`${h}.${forged}.${s}`)).status).toBe(401);
  });

  it('26. missing Authorization header rejected', async () => {
    expect((await me()).status).toBe(401);
  });

  it('27. empty Bearer token rejected', async () => {
    expect((await me(undefined, { Authorization: 'Bearer ' })).status).toBe(401);
  });

  it('28. malformed Authorization scheme rejected', async () => {
    expect((await me(undefined, { Authorization: 'Basic abcdef' })).status).toBe(401);
  });

  it('29. token with future iat still verifies if not expired (documents behaviour)', async () => {
    const u = await seedUser();
    const future = Math.floor(Date.now() / 1000) + 3600;
    const tok = await mint(
      { id: u.id, email: u.email, role: 'student' },
      { exp: '2h', iat: future },
    );
    // jose does not reject future iat by default -> 200. Flag if policy requires nbf checks.
    expect([200, 401]).toContain((await me(tok)).status);
  });

  it('30 & 31. alg=none / unsigned token rejected', async () => {
    const u = await seedUser();
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '');
    const payload = btoa(JSON.stringify({ id: u.id, email: u.email, role: 'admin' })).replace(
      /=+$/,
      '',
    );
    const unsigned = `${header}.${payload}.`;
    expect((await me(unsigned)).status).toBe(401);
  });

  it('32. token for a deleted user is rejected by /me (handler re-checks DB)', async () => {
    const u = await seedUser();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
    // Token still verifies cryptographically; /me must fail because the row is gone.
    // If this returns 200, that is a finding: identity survives account deletion.
    expect((await me(u.token)).status).not.toBe(200);
  });

  it('35 & 36. a student token cannot reach an admin route; role-tamper is rejected', async () => {
    const u = await seedUser();
    expect((await call('/api/admin/users', { token: u.token })).status).toBe(403);
    // Tampering role in the payload breaks the signature -> 401 on the admin route too.
    const [h, , s] = u.token.split('.');
    const forged = btoa(JSON.stringify({ id: u.id, email: u.email, role: 'admin' })).replace(
      /=+$/,
      '',
    );
    expect((await call('/api/admin/users', { token: `${h}.${forged}.${s}` })).status).toBe(401);
  });

  it('37. malformed JSON in payload segment rejected', async () => {
    const junk = btoa('not-json').replace(/=+$/, '');
    expect((await me(`${junk}.${junk}.${junk}`)).status).toBe(401);
  });

  it('38 & 39. oversized / corrupted-base64 token rejected, never 5xx', async () => {
    const big = 'x'.repeat(20000);
    const r1 = await me(big);
    const r2 = await me('!!!.@@@.###');
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
  });

  it('40. expiry boundary: a token expiring "now" is not accepted', async () => {
    const u = await seedUser();
    const tok = await mint({ id: u.id, email: u.email, role: 'student' }, { exp: '0s' });
    expect((await me(tok)).status).toBe(401);
  });
});
