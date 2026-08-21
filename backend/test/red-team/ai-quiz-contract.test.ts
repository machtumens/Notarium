// POST /api/ai/quiz — subject-source IDOR guard (T2, Paperloop Phase 4).
//
// The subject-source query is author_id-scoped (WHERE subject_id = ? AND
// author_id = ?), so a caller requesting a subject that only holds ANOTHER
// user's notes gets 404 "No content found" — never that user's note text. The
// 404 fires from the ownership-scoped SQL BEFORE any AI call, so this suite
// needs no provider mocking (and deliberately sets no AI key).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('POST /api/ai/quiz — subject-source IDOR', () => {
  it("returns 404 for a non-owner's subject (no cross-user note content leaks)", async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    const subjectId = await seedSubject();
    // A note in the subject that belongs ONLY to `owner`, with real content.
    const noteId = await seedNote(owner.id, subjectId, { title: 'Owner private note' });
    await env.DB.prepare('UPDATE notes SET extracted_text = ? WHERE id = ?')
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

    // author_id-scoped query returns 0 rows for the attacker → 404, never 200.
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
