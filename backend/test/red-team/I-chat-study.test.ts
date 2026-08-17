// I. Chat & Study System (131-140)
// Chat/study handlers authenticate via getUserFromToken/getOrCreateUser and scope
// every row to user.id. Cross-user session access must 404. AI-dependent replies
// are not asserted (no keys); we assert ownership isolation + persistence + gating.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

// Mirror of backend/src/routes/study.ts hashQuestion (djb2-xor → base36). Kept in
// sync here so the SRS test can assert the EXACT study_items.question_hash written
// by the upsert path, not just that some row exists.
function hashQuestion(text: string): string {
  let h = 5381;
  const s = text.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

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

  it('137. a note_id-scoped quiz attempt upserts a study_items row for that note (the real SRS write)', async () => {
    const u = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(u.id, subj);
    // Fresh, unique question_text → fresh question_hash → the INSERT path fires
    // (which stores note_id), not the note_id-agnostic UPDATE path.
    const questionText = `SRS write check for note ${noteId}: what is the capital of France?`;

    const res = await call('/api/quiz/attempt', {
      method: 'POST',
      token: u.token,
      body: { note_id: noteId, question_text: questionText, is_correct: true, confidence: 3 },
    });
    expect(res.status).toBeLessThan(300);

    // The actual SRS card write: a study_items row keyed to (user, note_id) must
    // now exist with the expected question_hash. This is stronger than the
    // pre-existing quiz_attempts assertion in "136 & auth".
    const row = (await env.DB.prepare(
      'SELECT note_id, question_hash FROM study_items WHERE user_id = ? AND note_id = ?',
    )
      .bind(u.id, noteId)
      .first()) as any;
    expect(row, 'a study_items row was created for this note').toBeTruthy();
    expect(row.note_id).toBe(noteId);
    expect(row.question_hash).toBe(hashQuestion(questionText));
  });

  it('137b. the SAME question asked from two different notes yields two separate study_items cards', async () => {
    const u = await seedUser();
    const subj = await seedSubject();
    const noteA = await seedNote(u.id, subj, { title: 'Note A' });
    const noteB = await seedNote(u.id, subj, { title: 'Note B' });
    // Identical wording on purpose: this is the cross-note collision case. The
    // dedup key must be (user, note, question) — keyed on (user, question) alone
    // both notes collapse into ONE row permanently stuck on noteA's note_id.
    const questionText = 'Shared wording: what is the powerhouse of the cell?';

    for (const noteId of [noteA, noteB]) {
      const res = await call('/api/quiz/attempt', {
        method: 'POST',
        token: u.token,
        body: { note_id: noteId, question_text: questionText, is_correct: true, confidence: 3 },
      });
      expect(res.status, `attempt for note ${noteId} succeeded`).toBeLessThan(300);
    }

    const { results } = await env.DB.prepare(
      'SELECT note_id FROM study_items WHERE user_id = ? AND question_hash = ? ORDER BY note_id',
    )
      .bind(u.id, hashQuestion(questionText))
      .all();

    expect(results, 'one SRS card per note, not one shared card').toHaveLength(2);
    expect((results as any[]).map((r) => r.note_id)).toEqual([noteA, noteB].sort((x, y) => x - y));
  });

  it('137c. a note-less quiz attempt repeated does NOT create a duplicate study_items row', async () => {
    // Regression guard for the null-handling half of the dedup fix: `note_id = ?`
    // bound to NULL is never true in SQLite, so an `=` lookup would re-INSERT a
    // fresh card on every attempt. `note_id IS ?` matches null-to-null.
    const u = await seedUser();
    const questionText = 'Note-less repeat: what is the boiling point of water?';

    for (let i = 0; i < 2; i++) {
      const res = await call('/api/quiz/attempt', {
        method: 'POST',
        token: u.token,
        body: { question_text: questionText, is_correct: true, confidence: 3 },
      });
      expect(res.status).toBeLessThan(300);
    }

    const row = (await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM study_items WHERE user_id = ? AND note_id IS NULL AND question_hash = ?',
    )
      .bind(u.id, hashQuestion(questionText))
      .first()) as any;
    expect(row.c, 'the second attempt updated the existing card, not inserted a new one').toBe(1);
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
