// Per-user timezone, through real endpoints.
//
// The pure day-boundary arithmetic is covered deterministically in
// src/__tests__/time.test.ts. What can only be checked here is the WIRING: that
// a student's own zone actually reaches the streak counter and the scheduler,
// that signup captures it, and that Settings cannot poison it.
//
// Every case derives its expectations from the same helpers the code uses, so
// nothing depends on the runner's ambient TZ or on what time of day CI runs.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, signupBody, env } from './helpers';
import { localDate, addLocalDays, SCHOOL_TIMEZONE } from '../../src/lib/time';

beforeAll(applySchema);
beforeEach(resetData);

const WIB = 'Asia/Jakarta';

async function setZone(userId: number, zone: string | null) {
  await env.DB.prepare(`UPDATE users SET timezone = ? WHERE id = ?`).bind(zone, userId).run();
}

async function setStreak(userId: number, streak: number, lastDay: string) {
  await env.DB.prepare(`UPDATE users SET current_streak = ?, last_study_date = ? WHERE id = ?`)
    .bind(streak, lastDay, userId)
    .run();
}

function attempt(token: string, question = 'What is 2 + 2?') {
  return call('/api/quiz/attempt', {
    method: 'POST',
    token,
    body: { question_text: question, is_correct: true, confidence: 3 },
  });
}

describe('streaks are counted in the student’s own zone', () => {
  it('studying the day after the last recorded LOCAL day continues the streak', async () => {
    const u = await seedUser();
    await setZone(u.id, WIB);
    await setStreak(u.id, 4, addLocalDays(localDate(WIB), -1));

    const res = await attempt(u.token);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).current_streak).toBe(5);
  });

  it('a gap resets the streak to 1', async () => {
    const u = await seedUser();
    await setZone(u.id, WIB);
    await setStreak(u.id, 9, addLocalDays(localDate(WIB), -5));

    const res = await attempt(u.token);
    expect(((await res.json()) as any).current_streak).toBe(1);
  });

  it('a second attempt on the same local day does not double-count', async () => {
    const u = await seedUser();
    await setZone(u.id, WIB);
    await setStreak(u.id, 3, addLocalDays(localDate(WIB), -1));

    const first = (await (await attempt(u.token, 'Q1')).json()) as any;
    const second = (await (await attempt(u.token, 'Q2')).json()) as any;
    expect(first.current_streak).toBe(4);
    expect(second.current_streak).toBe(4);
  });

  it('two students on opposite sides of the date line record DIFFERENT days', async () => {
    // Pacific/Kiritimati is UTC+14 and Pacific/Niue is UTC-11: twenty-five hours
    // apart, so their local dates ALWAYS differ. Seeding both with the same
    // date makes that difference observable at any moment the suite runs.
    const ahead = 'Pacific/Kiritimati';
    const behind = 'Pacific/Niue';
    expect(localDate(ahead)).not.toBe(localDate(behind));

    const a = await seedUser();
    const b = await seedUser();
    await setZone(a.id, ahead);
    await setZone(b.id, behind);
    // "Yesterday" for the student who is ahead. For the one behind, that same
    // string is TODAY — so only the first should see the streak advance.
    const day = addLocalDays(localDate(ahead), -1);
    await setStreak(a.id, 2, day);
    await setStreak(b.id, 2, day);

    expect(((await (await attempt(a.token)).json()) as any).current_streak).toBe(3);
    expect(((await (await attempt(b.token)).json()) as any).current_streak).toBe(2);
  });

  it('a student with no zone set falls back to the school default', async () => {
    const u = await seedUser();
    await setZone(u.id, null);
    await setStreak(u.id, 6, addLocalDays(localDate(SCHOOL_TIMEZONE), -1));

    const res = await attempt(u.token);
    expect(((await res.json()) as any).current_streak).toBe(7);

    const row = (await env.DB.prepare(`SELECT last_study_date FROM users WHERE id = ?`)
      .bind(u.id)
      .first()) as { last_study_date: string };
    expect(row.last_study_date).toBe(localDate(SCHOOL_TIMEZONE));
  });
});

describe('due dates land on a local day boundary', () => {
  it('a new card is due at midnight in the student’s zone, not at the review hour', async () => {
    const u = await seedUser();
    await setZone(u.id, WIB);

    const res = await attempt(u.token);
    const { due_at } = (await res.json()) as any;

    // Whatever the hour of this test run, the due instant is the start of a
    // local day: formatting it back in the zone must give midnight exactly.
    const wall = new Intl.DateTimeFormat('en-GB', {
      timeZone: WIB,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(due_at));
    expect(wall).toBe('00:00:00');
    expect(Date.parse(due_at)).toBeGreaterThan(Date.now());
  });
});

describe('capturing and changing the zone', () => {
  it('signup stores a valid browser-supplied zone', async () => {
    const res = await call('/api/auth/signup', { body: signupBody({ timezone: 'Europe/London' }) });
    expect(res.status).toBe(201);
    const { user } = (await res.json()) as any;
    expect(user.timezone).toBe('Europe/London');

    const row = (await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`)
      .bind(user.id)
      .first()) as { timezone: string };
    expect(row.timezone).toBe('Europe/London');
  });

  it('signup drops a zone this runtime cannot format in, rather than failing', async () => {
    // A broken or spoofed browser value must not cost someone their account.
    const res = await call('/api/auth/signup', {
      body: signupBody({ timezone: 'Mars/Olympus_Mons' }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).user.timezone).toBeNull();
  });

  it('signup without a zone leaves it null, meaning "use the school default"', async () => {
    const res = await call('/api/auth/signup', { body: signupBody() });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).user.timezone).toBeNull();
  });

  it('Settings can change the zone', async () => {
    const u = await seedUser();
    const res = await call('/api/auth/profile', {
      method: 'PUT',
      token: u.token,
      body: { timezone: 'Asia/Tokyo' },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user.timezone).toBe('Asia/Tokyo');
  });

  it('Settings rejects an unknown zone instead of silently keeping the old one', async () => {
    const u = await seedUser();
    await setZone(u.id, WIB);
    const res = await call('/api/auth/profile', {
      method: 'PUT',
      token: u.token,
      body: { timezone: 'Not/AZone' },
    });
    expect(res.status).toBe(400);

    const row = (await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`)
      .bind(u.id)
      .first()) as { timezone: string };
    expect(row.timezone, 'a rejected update must not have partially applied').toBe(WIB);
  });

  it('Settings can clear the override back to the school default', async () => {
    const u = await seedUser();
    await setZone(u.id, 'Asia/Tokyo');
    const res = await call('/api/auth/profile', {
      method: 'PUT',
      token: u.token,
      body: { timezone: null },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user.timezone).toBeNull();
  });

  it('/api/auth/me reports the zone so the client can render in it', async () => {
    const u = await seedUser();
    await setZone(u.id, 'Asia/Tokyo');
    const res = await call('/api/auth/me', { token: u.token });
    expect(((await res.json()) as any).user.timezone).toBe('Asia/Tokyo');
  });
});
