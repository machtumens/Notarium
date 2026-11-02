// Study requests: one ask per student/subject/day, counted per day for tutors.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);
// The worker's first request runs initializeDatabase, which drops subjects that hold no notes.
// Warm it up before seeding so the seeded subject survives.
beforeEach(async () => {
  await call('/api/subjects');
});

const tomorrow = () => new Date(Date.now() + 31 * 3600_000).toISOString().slice(0, 10);

describe('study requests', () => {
  it('counts asks per day, dedupes a repeat ask, and lets only the owner withdraw', async () => {
    const a = await seedUser();
    const b = await seedUser();
    const subject_id = await seedSubject();
    const day = tomorrow();
    const ask = (token: string) =>
      call('/api/study-requests', { method: 'POST', token, body: { subject_id, day } });

    const r1 = await ask(a.token);
    const first = (await r1.json()) as any;
    expect(r1.status, JSON.stringify(first)).toBe(201);
    await ask(a.token); // same student, same day: no second row
    await ask(b.token);

    const list = (await (
      await call(`/api/study-requests?from=${day}&days=1`, { token: a.token })
    ).json()) as any;
    expect(list.requests).toHaveLength(1);
    expect(list.requests[0].count).toBe(2);
    expect(list.requests[0].my_request_id).toBe(first.id);

    const stolen = await call(`/api/study-requests/${first.id}`, {
      method: 'DELETE',
      token: b.token,
    });
    expect(stolen.status).toBe(404);
    const own = await call(`/api/study-requests/${first.id}`, { method: 'DELETE', token: a.token });
    expect(own.status).toBe(200);
  });

  it('rejects a day in the past', async () => {
    const a = await seedUser();
    const subject_id = await seedSubject();
    const res = await call('/api/study-requests', {
      method: 'POST',
      token: a.token,
      body: { subject_id, day: '2020-01-01' },
    });
    expect(res.status).toBe(400);
  });
});
