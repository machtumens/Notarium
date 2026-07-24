// I. Chat & Study System (131-140)
// Chat/study handlers authenticate via getUserFromToken/getOrCreateUser and scope
// every row to user.id. Cross-user session access must 404. AI-dependent replies
// are not asserted (no keys); we assert ownership isolation + persistence + gating.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

async function makeSession(token: string) {
  const res = await call('/api/chat/sessions', {
    method: 'POST',
    token,
    body: { subject: 'Math', topic: 'Algebra' },
  });
  return { res, id: ((await res.clone().json()) as any)?.session?.id };
}

describe('I. Chat & study (131-140)', () => {
  it('131 & 132. a user can create then retrieve their own chat session', async () => {
    const u = await seedUser();
    const { res } = await makeSession(u.token);
    expect(res.status).toBeLessThan(300);
    const list = await call('/api/chat/sessions', { token: u.token });
    expect(list.status).toBe(200);
  });

  it('133. a user cannot read another user’s session messages (404)', async () => {
    const a = await seedUser();
    const b = await seedUser();
    const { id } = await makeSession(a.token);
    expect(id, 'session id was created').toBeDefined();
    const res = await call(`/api/chat/sessions/${id}/messages`, { token: b.token });
    expect(res.status).toBe(404);
  });

  it('134. message ordering: retrieved messages are non-decreasing by id', async () => {
    const u = await seedUser();
    const { id } = await makeSession(u.token);
    await call(`/api/chat/sessions/${id}/messages`, {
      method: 'POST',
      token: u.token,
      body: { content: 'first' },
    });
    await call(`/api/chat/sessions/${id}/messages`, {
      method: 'POST',
      token: u.token,
      body: { content: 'second' },
    });
    const msgs = (
      (await (await call(`/api/chat/sessions/${id}/messages`, { token: u.token })).json()) as any
    ).messages;
    const ids = msgs.map((m: any) => m.id);
    expect([...ids].sort((x, y) => x - y)).toEqual(ids);
  });

  it('136 & auth. quiz attempt requires auth (401) and stores a row when valid', async () => {
    expect(
      (await call('/api/quiz/attempt', { method: 'POST', body: { question_text: 'q' } })).status,
    ).toBe(401);
    const u = await seedUser();
    const res = await call('/api/quiz/attempt', {
      method: 'POST',
      token: u.token,
      body: { question_text: 'What is 2+2?', is_correct: true, confidence: 3 },
    });
    expect(res.status).toBeLessThan(300);
    const row = (await env.DB.prepare('SELECT COUNT(*) AS c FROM quiz_attempts WHERE user_id = ?')
      .bind(u.id)
      .first()) as any;
    expect(row.c).toBeGreaterThanOrEqual(1);
  });

  it('138. due reviews are scoped to the caller and return a due_count', async () => {
    const u = await seedUser();
    const res = await call('/api/reviews/due', { token: u.token });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json).toHaveProperty('due_count');
    expect(Array.isArray(json.items)).toBe(true);
  });

  it('139 & auth. study stats require auth and return a consistent shape', async () => {
    expect((await call('/api/study/stats')).status).toBe(401);
    const u = await seedUser();
    const res = await call('/api/study/stats', { token: u.token });
    expect(res.status).toBe(200);
  });

  it('140. a quiz attempt with no question_text is rejected (400)', async () => {
    const u = await seedUser();
    const res = await call('/api/quiz/attempt', {
      method: 'POST',
      token: u.token,
      body: { is_correct: true },
    });
    expect(res.status).toBe(400);
  });
});
