// POST /api/ai/quiz — subject-source IDOR guard (T2, Paperloop Phase 4).
//
// Since 2 Nov 2026 a subject quiz draws on every note the caller could open
// (published + visible to their class), so classmates' shared notes feed it.
// What must still never happen: a note the caller cannot open (a draft, or a
// class-only note of another class) reaching the prompt. That 404 fires from
// the visibility-scoped SQL BEFORE any AI call, so this suite
// needs no provider mocking (and deliberately sets no AI key).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('POST /api/ai/quiz — subject-source IDOR', () => {
  it("returns 404 when the subject only holds another user's draft (no hidden content leaks)", async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    const subjectId = await seedSubject();
    // A note in the subject that belongs ONLY to `owner`, with real content.
    const noteId = await seedNote(owner.id, subjectId, { title: 'Owner private note' });
    await env.DB.prepare("UPDATE notes SET extracted_text = ?, status = 'draft' WHERE id = ?")
      .bind('Secret owner-only study material that must never reach another user.', noteId)
      .run();

    const res = await call('/api/ai/quiz', {
      method: 'POST',
      token: attacker.token,
      body: {
        source_type: 'subject',
        source_id: subjectId,
        count: 3,
        difficulty: 'easy',
        types: ['mcq'],
      },
    });

    // visibility-scoped query returns 0 rows for the other user → 404, never 200.
    expect(res.status).toBe(404);
    const json = (await res.json()) as any;
    expect(json.error).toBe('No content found for this source');
  });

  it('does NOT 404 the owner for the same subject (proves the note is really there)', async () => {
    const owner = await seedUser();
    const subjectId = await seedSubject();
    const noteId = await seedNote(owner.id, subjectId, { title: 'Owner note' });
    await env.DB.prepare('UPDATE notes SET extracted_text = ? WHERE id = ?')
      .bind('Photosynthesis converts light into chemical energy.', noteId)
      .run();

    // No AI key is set, so the owner clears the ownership + content gate and
    // reaches the generator, which returns 500 "AI service not configured".
    // Same subject_id as the attacker test, different outcome (not 404/403) →
    // proves the scoping returns rows for the owner but not the non-owner.
    const res = await call('/api/ai/quiz', {
      method: 'POST',
      token: owner.token,
      body: {
        source_type: 'subject',
        source_id: subjectId,
        count: 3,
        difficulty: 'easy',
        types: ['mcq'],
      },
    });
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(403);
  });
});
