// GET /api/progress/mastery and GET /api/progress/timeseries.
//
// The two gaps V2.0's Progress screen could not be built on: a mastery figure
// per subject, and a week-by-week series of the student against their class.
// What these suites care about is that the numbers are honest — that "answered
// nothing" never renders as 0%, that the class line is a median and not a
// class-wide accuracy wearing the label, that stale answers fall out of the
// window, and that no student can see another's figures.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

/** `daysAgo(2)` as the ISO-UTC form every timestamp column uses. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A finished mock: `answered` questions in `subjectId`, `correct` of them right. */
async function seedTest(
  userId: number,
  subjectId: number | null,
  answered: number,
  correct: number,
  at: string = daysAgo(1),
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO test_sessions (user_id, subject_id, question_count, correct_count, score_pct, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, subjectId, answered, correct, Math.round((correct / answered) * 100), at)
    .run();
}

/** A single answered question, attached to a note so it has a subject. */
async function seedAttempt(
  userId: number,
  noteId: number | null,
  isCorrect: boolean,
  at: string = daysAgo(1),
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO quiz_attempts (user_id, note_id, question_text, question_hash, is_correct, answered_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, noteId, 'q?', `h${Math.random()}`, isCorrect ? 1 : 0, at)
    .run();
}

const mastery = (token: string) => call('/api/progress/mastery', { token });
const series = (token: string, qs = '') =>
  call(`/api/progress/timeseries${qs}`, { token });

describe('GET /api/progress/mastery', () => {
  it('401s without a token', async () => {
    expect((await call('/api/progress/mastery')).status).toBe(401);
  });

  it('a brand-new account reads as null, not 0% — it has answered nothing', async () => {
    const user = await seedUser();
    const body = (await (await mastery(user.token)).json()) as any;
    expect(body.overall).toBeNull();
    expect(body.answered).toBe(0);
    expect(body.subjects).toEqual([]);
    expect(body.window_days).toBe(28);
  });

  it('a student who got everything wrong reads as 0%, which is not null', async () => {
    const user = await seedUser();
    const subject = await seedSubject('Kimia');
    await seedTest(user.id, subject, 4, 0);
    const body = (await (await mastery(user.token)).json()) as any;
    expect(body.overall).toBe(0);
    expect(body.answered).toBe(4);
    expect(body.subjects[0].pct).toBe(0);
  });

  it('counts mocks and single attempts as one pool', async () => {
    const user = await seedUser();
    const subject = await seedSubject('Kimia');
    const note = await seedNote(user.id, subject);
    await seedTest(user.id, subject, 10, 5); // 5/10
    await seedAttempt(user.id, note, true);
    await seedAttempt(user.id, note, true);
    await seedAttempt(user.id, note, true);
    await seedAttempt(user.id, note, false); // 3/4
    const body = (await (await mastery(user.token)).json()) as any;
    // 8 of 14 → 57%
    expect(body.answered).toBe(14);
    expect(body.correct).toBe(8);
    expect(body.overall).toBe(57);
  });

  it('reports each subject separately, weakest first', async () => {
    const user = await seedUser();
    const strong = await seedSubject('Biologi');
    const weak = await seedSubject('Kimia');
    await seedTest(user.id, strong, 10, 9);
    await seedTest(user.id, weak, 10, 3);
    const body = (await (await mastery(user.token)).json()) as any;
    expect(body.subjects.map((s: any) => s.pct)).toEqual([30, 90]);
    expect(body.subjects[0].subject_id).toBe(weak);
  });

  it('leaves out a subject the student has not answered in, rather than showing 0%', async () => {
    const user = await seedUser();
    const answered = await seedSubject('Kimia');
    const untouched = await seedSubject('Sejarah');
    await seedTest(user.id, answered, 2, 1);
    const body = (await (await mastery(user.token)).json()) as any;
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects.map((s: any) => s.subject_id)).not.toContain(untouched);
  });

  it('drops answers older than the window — mastery is current, not a lifetime average', async () => {
    const user = await seedUser();
    const subject = await seedSubject('Kimia');
    await seedTest(user.id, subject, 10, 0, daysAgo(60)); // a bad September
    await seedTest(user.id, subject, 10, 9, daysAgo(2)); // a good now
    const body = (await (await mastery(user.token)).json()) as any;
    expect(body.overall).toBe(90);
    expect(body.answered).toBe(10);
  });

  it('counts an attempt whose note was deleted in the overall but in no subject', async () => {
    const user = await seedUser();
    const subject = await seedSubject('Kimia');
    await seedTest(user.id, subject, 2, 1);
    await seedAttempt(user.id, null, true); // note gone → no subject
    const body = (await (await mastery(user.token)).json()) as any;
    expect(body.answered).toBe(3);
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0].answered).toBe(2);
  });

  it("never shows one student another's answers", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const subject = await seedSubject('Kimia');
    await seedTest(other.id, subject, 10, 10);
    const body = (await (await mastery(me.token)).json()) as any;
    expect(body.overall).toBeNull();
    expect(body.subjects).toEqual([]);
  });
});

describe('GET /api/progress/timeseries', () => {
  it('401s without a token', async () => {
    expect((await call('/api/progress/timeseries')).status).toBe(401);
  });

  it('returns twelve weekly points by default, oldest first and a week apart', async () => {
    const user = await seedUser();
    const body = (await (await series(user.token)).json()) as any;
    expect(body.weeks).toBe(12);
    expect(body.points).toHaveLength(12);
    const days = body.points.map((p: any) => Date.parse(`${p.week_ending}T00:00:00Z`));
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i] - days[i - 1]).toBe(7 * 86_400_000);
    }
  });

  it('is all nulls for an account that has answered nothing', async () => {
    const user = await seedUser();
    const body = (await (await series(user.token)).json()) as any;
    expect(body.points.every((p: any) => p.you === null)).toBe(true);
  });

  it("the last point equals the mastery card — they are the same window", async () => {
    const user = await seedUser();
    const subject = await seedSubject('Kimia');
    await seedTest(user.id, subject, 10, 4, daysAgo(1));
    const card = (await (await mastery(user.token)).json()) as any;
    const graph = (await (await series(user.token)).json()) as any;
    expect(graph.points.at(-1).you).toBe(card.overall);
    expect(card.overall).toBe(40);
  });

  it('shows the dip: an old good week stays good, a recent bad run pulls the line down', async () => {
    const user = await seedUser();
    const subject = await seedSubject('Kimia');
    await seedTest(user.id, subject, 10, 9, daysAgo(60));
    await seedTest(user.id, subject, 10, 2, daysAgo(1));
    const body = (await (await series(user.token)).json()) as any;
    const early = body.points.find((p: any) => p.you !== null);
    expect(early.you).toBe(90);
    expect(body.points.at(-1).you).toBe(20);
  });

  it('clamps the weeks parameter instead of trusting it', async () => {
    const user = await seedUser();
    expect(((await (await series(user.token, '?weeks=0')).json()) as any).points).toHaveLength(12);
    expect(((await (await series(user.token, '?weeks=1')).json()) as any).points).toHaveLength(1);
    expect(((await (await series(user.token, '?weeks=9999')).json()) as any).points).toHaveLength(52);
    expect(((await (await series(user.token, '?weeks=junk')).json()) as any).points).toHaveLength(12);
  });

  it('narrows to one subject when asked', async () => {
    const user = await seedUser();
    const kimia = await seedSubject('Kimia');
    const biologi = await seedSubject('Biologi');
    await seedTest(user.id, kimia, 10, 2);
    await seedTest(user.id, biologi, 10, 10);
    const all = (await (await series(user.token)).json()) as any;
    const just = (await (await series(user.token, `?subject_id=${kimia}`)).json()) as any;
    expect(all.points.at(-1).you).toBe(60);
    expect(just.subject_id).toBe(kimia);
    expect(just.points.at(-1).you).toBe(20);
  });

  it('klas is a median of classmates, so one outlier cannot drag it', async () => {
    const me = await seedUser();
    const subject = await seedSubject('Kimia');
    const peers = [await seedUser(), await seedUser(), await seedUser()];
    await seedTest(me.id, subject, 10, 5); // 50
    await seedTest(peers[0].id, subject, 10, 4); // 40
    await seedTest(peers[1].id, subject, 10, 6); // 60
    await seedTest(peers[2].id, subject, 10, 10); // 100, the outlier
    const body = (await (await series(me.token)).json()) as any;
    // Sorted: 40, 50, 60, 100 → median 55. A mean would be 62.
    expect(body.points.at(-1).klas).toBe(55);
    expect(body.peers).toBe(4);
  });

  it('counts only the caller\'s own class', async () => {
    const me = await seedUser();
    const subject = await seedSubject('Kimia');
    const outsider = await seedUser();
    await env.DB.prepare(`UPDATE users SET class = '11.2' WHERE id = ?`).bind(outsider.id).run();
    await seedTest(me.id, subject, 10, 5);
    await seedTest(outsider.id, subject, 10, 10);
    const body = (await (await series(me.token)).json()) as any;
    expect(body.class).toBe('10.1');
    expect(body.peers).toBe(1);
    expect(body.points.at(-1).klas).toBe(50); // the caller alone
  });

  it('leaves klas null for a week no classmate answered in', async () => {
    const me = await seedUser();
    const subject = await seedSubject('Kimia');
    await seedTest(me.id, subject, 10, 5, daysAgo(1));
    const body = (await (await series(me.token)).json()) as any;
    expect(body.points[0].klas).toBeNull();
    expect(body.points.at(-1).klas).toBe(50);
  });

  it('excludes a suspended classmate from the median', async () => {
    const me = await seedUser();
    const subject = await seedSubject('Kimia');
    const suspended = await seedUser({ suspended: true });
    await seedTest(me.id, subject, 10, 5);
    await seedTest(suspended.id, subject, 10, 10);
    const body = (await (await series(me.token)).json()) as any;
    expect(body.peers).toBe(1);
    expect(body.points.at(-1).klas).toBe(50);
  });
});
