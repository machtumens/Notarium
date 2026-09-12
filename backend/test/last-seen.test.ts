// last_seen_at, the signal behind the daily active_users figure.
//
// Nothing wrote this column before — it was SELECTed in a dozen places and set
// by nothing, so active_users was structurally always zero. These tests pin
// both halves of the fix: that an authenticated request records the visit, and
// that it does not do so on every single request.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, seedUser, call } from './red-team/helpers';
import { isoUtc } from '../src/lib/time';

const lastSeen = async (id: number): Promise<string | null> => {
  const row = await env.DB.prepare('SELECT last_seen_at FROM users WHERE id = ?')
    .bind(id)
    .first<{ last_seen_at: string | null }>();
  return row?.last_seen_at ?? null;
};

const setLastSeen = (id: number, value: string | null) =>
  env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(value, id).run();

const minutesAgo = (n: number) => isoUtc(new Date(Date.now() - n * 60_000));

describe('last_seen_at', () => {
  beforeAll(applySchema);
  beforeEach(resetData);

  it('is recorded on an authenticated request when it has never been set', async () => {
    const user = await seedUser();
    await setLastSeen(user.id, null);

    expect(await lastSeen(user.id)).toBeNull();
    await call('/api/auth/me', { token: user.token });

    const seen = await lastSeen(user.id);
    expect(seen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(Date.now() - Date.parse(seen as string)).toBeLessThan(60_000);
  });

  it('refreshes once the previous value has gone stale', async () => {
    const user = await seedUser();
    await setLastSeen(user.id, minutesAgo(20));

    await call('/api/auth/me', { token: user.token });

    expect(Date.now() - Date.parse((await lastSeen(user.id)) as string)).toBeLessThan(60_000);
  });

  it('leaves a recent value alone, so a busy session is not a write per request', async () => {
    const user = await seedUser();
    const recent = minutesAgo(2);
    await setLastSeen(user.id, recent);

    for (let i = 0; i < 5; i++) await call('/api/auth/me', { token: user.token });

    expect(await lastSeen(user.id)).toBe(recent);
  });

  it('is recorded through the shared resolver, not just /api/auth/me', async () => {
    const user = await seedUser();
    await setLastSeen(user.id, null);

    // /api/notes/my-notes resolves identity via getAuthedUser.
    await call('/api/notes/my-notes', { token: user.token });

    expect(await lastSeen(user.id)).not.toBeNull();
  });

  it('is not recorded for an unauthenticated request', async () => {
    const user = await seedUser();
    await setLastSeen(user.id, null);

    await call('/api/auth/me'); // no token

    expect(await lastSeen(user.id)).toBeNull();
  });

  it('writes a value the usage snapshot can compare as a string', async () => {
    // active_users compares last_seen_at against ISO window bounds, so the
    // stored form has to be the same fixed-width ISO-8601 UTC, not SQLite's
    // space form — otherwise the comparison silently misses.
    const user = await seedUser();
    await setLastSeen(user.id, null);
    await call('/api/auth/me', { token: user.token });

    const seen = (await lastSeen(user.id)) as string;
    expect(seen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(seen > '2020-01-01T00:00:00Z').toBe(true);
  });
});
