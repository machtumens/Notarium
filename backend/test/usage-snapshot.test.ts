// The usage_snapshot ops target.
//
// The previous statement inserted (date, total_users, total_notes) — three
// column names the table does not have — so the action had never once
// succeeded; it 500'd on every invocation. These tests pin the replacement:
// the right columns, per-day counts rather than running totals, a SCHOOL day
// rather than a UTC one, and idempotence.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, seedUser, seedSubject, call } from './red-team/helpers';
import { SCHOOL_TIMEZONE, addLocalDays, isoUtc, localDate, startOfLocalDay } from '../src/lib/time';

const day = () => localDate(SCHOOL_TIMEZONE);

/** An instant `hoursIn` hours after the school day began. */
const duringToday = (hoursIn: number) =>
  isoUtc(new Date(startOfLocalDay(SCHOOL_TIMEZONE, day()).getTime() + hoursIn * 3_600_000));

/** The last instant of yesterday, one second before today's window opens. */
const justBeforeToday = () =>
  isoUtc(new Date(startOfLocalDay(SCHOOL_TIMEZONE, day()).getTime() - 1000));

// The caller is itself a user, and seeding it inside today's window would add
// one to every count the tests are trying to measure. Backdate it out of the
// window so each test's arithmetic is about its own fixtures only. Nothing in
// the app writes last_seen_at, so the backdate sticks across the request.
async function seedTech(): Promise<string> {
  const tech = await seedUser({ role: 'admin', admin_role: 'technical' });
  await env.DB.prepare('UPDATE users SET created_at = ?, last_seen_at = ? WHERE id = ?')
    .bind(justBeforeToday(), justBeforeToday(), tech.id)
    .run();
  return tech.token;
}

const runSnapshot = (token: string) =>
  call('/api/ops/recompute', {
    method: 'POST',
    token,
    body: { target: 'usage_snapshot' },
  });

const rows = async () => {
  const { results } = await env.DB.prepare(
    `SELECT stat_date, active_users, new_users, notes_created, likes_given, chat_sessions
       FROM usage_stats ORDER BY stat_date`,
  ).all();
  return results as Array<Record<string, number | string>>;
};

describe('usage_snapshot', () => {
  beforeAll(applySchema);
  beforeEach(async () => {
    await resetData();
    await env.DB.prepare('DELETE FROM usage_stats').run();
  });

  it('writes a row using the columns the table actually has', async () => {
    const res = await runSnapshot(await seedTech());
    expect(res.status).toBe(200);

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].stat_date).toBe(day());
  });

  it('counts today and ignores yesterday', async () => {
    const token = await seedTech();
    const subject = await seedSubject('Biology');
    const today = await seedUser({ email: 'today@sekolahkristencalvin.org' });
    const old = await seedUser({ email: 'old@sekolahkristencalvin.org' });

    // One user created inside today's school window, one just before it.
    await env.DB.prepare('UPDATE users SET created_at = ?, last_seen_at = ? WHERE id = ?')
      .bind(duringToday(2), duringToday(3), today.id)
      .run();
    await env.DB.prepare('UPDATE users SET created_at = ?, last_seen_at = ? WHERE id = ?')
      .bind(justBeforeToday(), justBeforeToday(), old.id)
      .run();

    // Same split for notes.
    await env.DB.prepare(
      `INSERT INTO notes (title, author_id, subject_id, created_at) VALUES ('in', ?, ?, ?)`,
    )
      .bind(today.id, subject, duringToday(4))
      .run();
    await env.DB.prepare(
      `INSERT INTO notes (title, author_id, subject_id, created_at) VALUES ('out', ?, ?, ?)`,
    )
      .bind(today.id, subject, justBeforeToday())
      .run();

    await runSnapshot(token);
    const [row] = await rows();

    expect(row.new_users).toBe(1);
    expect(row.active_users).toBe(1);
    expect(row.notes_created).toBe(1);
  });

  it('excludes soft-deleted notes', async () => {
    const token = await seedTech();
    const subject = await seedSubject('Physics');
    const user = await seedUser({ email: 'author@sekolahkristencalvin.org' });
    await env.DB.prepare(
      `INSERT INTO notes (title, author_id, subject_id, created_at, deleted_at)
       VALUES ('gone', ?, ?, ?, ?)`,
    )
      .bind(user.id, subject, duringToday(1), duringToday(2))
      .run();

    await runSnapshot(token);
    const [row] = await rows();
    expect(row.notes_created).toBe(0);
  });

  it('is idempotent — a second run replaces the day instead of doubling it', async () => {
    const token = await seedTech();
    const subject = await seedSubject('Chemistry');
    const user = await seedUser({ email: 'twice@sekolahkristencalvin.org' });
    await env.DB.prepare(
      `INSERT INTO notes (title, author_id, subject_id, created_at) VALUES ('one', ?, ?, ?)`,
    )
      .bind(user.id, subject, duringToday(5))
      .run();

    await runSnapshot(token);
    await runSnapshot(token);

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].notes_created).toBe(1);
  });

  it('counts a user who actually used the app — the whole chain, no fixtures', async () => {
    // The end-to-end proof: before last_seen_at was ever written, this figure
    // was structurally zero no matter how many people were online.
    const token = await seedTech();
    const student = await seedUser({ email: 'real@sekolahkristencalvin.org' });
    await env.DB.prepare('UPDATE users SET last_seen_at = NULL WHERE id = ?')
      .bind(student.id)
      .run();

    await call('/api/auth/me', { token: student.token });
    await runSnapshot(token);

    const [row] = await rows();
    expect(row.active_users).toBe(1);
  });

  it('uses the school day, not the UTC day', () => {
    // Jakarta is UTC+7, so a school day opens at 17:00Z the previous evening.
    // date('now') would have cut it at 00:00Z — 07:00 local — splitting one
    // school morning across two rows.
    const opensAt = isoUtc(startOfLocalDay(SCHOOL_TIMEZONE, '2026-08-31'));
    expect(opensAt).toBe('2026-08-30T17:00:00Z');

    const span =
      startOfLocalDay(SCHOOL_TIMEZONE, addLocalDays('2026-08-31', 1)).getTime() -
      startOfLocalDay(SCHOOL_TIMEZONE, '2026-08-31').getTime();
    expect(span).toBe(24 * 3_600_000);
  });
});
