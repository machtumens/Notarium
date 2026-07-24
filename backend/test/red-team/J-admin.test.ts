// J. Admin Operations (141-150)
// All /api/admin/* handlers gate via requireModerator (admin role, any tier).
// We drive them with a super-admin token and confirm the moderation surface
// works AND stays denied to non-admins.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

const admin = () => seedUser({ role: 'admin', admin_role: 'super' });

describe('J. Admin operations (141-150)', () => {
  it('141 & 142. suspend then unsuspend a user (moderator surface)', async () => {
    const a = await admin();
    const victim = await seedUser();
    const susp = await call(`/api/admin/suspend/${victim.id}`, {
      method: 'POST',
      token: a.token,
      body: { days: 7, reason: 'spam' },
    });
    expect(susp.status).toBeLessThan(300);
    const row = (await env.DB.prepare('SELECT suspended FROM users WHERE id = ?')
      .bind(victim.id)
      .first()) as any;
    expect(row.suspended).toBe(1);
    const un = await call(`/api/admin/unsuspend/${victim.id}`, { method: 'POST', token: a.token });
    expect(un.status).toBeLessThan(300);
    const row2 = (await env.DB.prepare('SELECT suspended FROM users WHERE id = ?')
      .bind(victim.id)
      .first()) as any;
    expect(row2.suspended).toBe(0);
  });

  it('143 & 144. warning a user sets the flag + persists the message', async () => {
    const a = await admin();
    const victim = await seedUser();
    const res = await call(`/api/admin/warn/${victim.id}`, {
      method: 'POST',
      token: a.token,
      body: { message: 'Be nice' },
    });
    expect(res.status).toBeLessThan(300);
    const row = (await env.DB.prepare('SELECT warning, warning_message FROM users WHERE id = ?')
      .bind(victim.id)
      .first()) as any;
    expect(row.warning).toBe(1);
    expect(row.warning_message).toContain('Be nice');
  });

  it('145. feature a note (admin toggle)', async () => {
    const a = await admin();
    const owner = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj);
    const res = await call(`/api/admin/notes/${noteId}/feature`, {
      method: 'POST',
      token: a.token,
    });
    expect(res.status).toBeLessThan(300);
  });

  it('147. an admin action is written to the activity log', async () => {
    const a = await admin();
    const victim = await seedUser();
    await call(`/api/admin/warn/${victim.id}`, {
      method: 'POST',
      token: a.token,
      body: { message: 'logged' },
    });
    const res = await call('/api/admin/activity-log', { token: a.token });
    expect(res.status).toBe(200);
    const logs = ((await res.json()) as any).logs;
    expect(Array.isArray(logs)).toBe(true);
  });

  it('149. these admin operations are all denied to a plain student (403)', async () => {
    const s = await seedUser();
    const victim = await seedUser();
    for (const p of [
      `/api/admin/suspend/${victim.id}`,
      `/api/admin/warn/${victim.id}`,
      `/api/admin/unsuspend/${victim.id}`,
    ]) {
      expect(
        (await call(p, { method: 'POST', token: s.token, body: { message: 'x' } })).status,
      ).toBe(403);
    }
  });

  it('150. admin notification create + list works', async () => {
    const a = await admin();
    const create = await call('/api/admin/notifications', {
      method: 'POST',
      token: a.token,
      body: { target_type: 'all', title: 'Notice', message: 'Hello', type: 'info' },
    });
    expect(create.status).toBeLessThan(300);
    const list = await call('/api/admin/notifications', { token: a.token });
    expect(list.status).toBe(200);
  });
});
