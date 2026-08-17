// G. IDOR / Object Security (111-120)
// Ownership on note mutate paths is author_id === user.id (else 403).
// MAJOR FINDING: note create/like/read derive identity via getOrCreateUser(),
// which falls back to the UNAUTHENTICATED `X-Encrypted-Yw-ID` header and will
// CREATE a user from it — so those endpoints work with no JWT at all, and let a
// caller act as an arbitrary identity by choosing the header value.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('G. IDOR / object security (111-120)', () => {
  it('111/112. no cross-user profile endpoint exists; /api/user/me only ever returns the caller', async () => {
    const a = await seedUser();
    const b = await seedUser();
    const meA = (await (await call('/api/user/me', { token: a.token })).json()) as any;
    expect(meA.user.email).toBe(a.email);
    expect(meA.user.email).not.toBe(b.email);
  });

  it('113 & 116. a user cannot delete another user’s note even by guessing the id (403)', async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj);
    const res = await call(`/api/notes/${noteId}`, { method: 'DELETE', token: attacker.token });
    expect(res.status).toBe(403);
  });

  it('112(note). a user cannot edit another user’s note (403)', async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj);
    const res = await call(`/api/notes/${noteId}`, {
      method: 'PUT',
      token: attacker.token,
      body: { title: 'hijacked' },
    });
    expect(res.status).toBe(403);
  });

  it('114. GET /api/notes/:id returns 200 with the note body for its owner', async () => {
    const owner = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj, { title: 'My Private Note' });
    const res = await call(`/api/notes/${noteId}`, { token: owner.token });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.note).toBeDefined();
    expect(json.note.id).toBe(noteId);
    expect(json.note.title).toBe('My Private Note');
    expect(json.note.subject_id).toBe(subj);
    // author_id must never leak — ownership is checked server-side then stripped.
    expect(json.note.author_id).toBeUndefined();
  });

  it('115. GET /api/notes/:id returns 403 for a non-owner (IDOR)', async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj);
    const res = await call(`/api/notes/${noteId}`, { token: attacker.token });
    expect(res.status).toBe(403);
  });

  it('117. a non-numeric note id does not match the route (404)', async () => {
    const u = await seedUser();
    const res = await call('/api/notes/not-a-number', { method: 'DELETE', token: u.token });
    expect(res.status).toBe(404);
  });

  it('118. deleting a non-existent (already-gone) note id is 404, not 500', async () => {
    const u = await seedUser();
    const res = await call('/api/notes/999999', { method: 'DELETE', token: u.token });
    expect([403, 404]).toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });

  it('FIXED: POST /api/notes rejects an unauthenticated X-Encrypted-Yw-ID header (requires JWT)', async () => {
    const subj = await seedSubject();
    // No Authorization header at all — only the (no longer trusted) identity header.
    const res = await call('/api/notes', {
      method: 'POST',
      headers: { 'X-Encrypted-Yw-ID': 'attacker-chosen-identity' },
      body: { title: 'ghost note', content: 'x', subject_id: subj },
    });
    // The header is no longer trusted for identity and no ghost user is created;
    // an unauthenticated write must be rejected with 401.
    expect(res.status, 'note create must require a real JWT, not a header').toBe(401);
  });

  it('FIXED: POST /api/quiz/attempt rejects a note_id the caller does not own (403)', async () => {
    // Confused deputy: the handler used to check only that the note EXISTS, so a
    // caller could bind its quiz_attempts + SRS cards to another user's note id.
    const owner = await seedUser();
    const attacker = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj);

    const res = await call('/api/quiz/attempt', {
      method: 'POST',
      token: attacker.token,
      body: { note_id: noteId, question_text: 'borrowed note question', is_correct: true },
    });
    expect(res.status, 'existence is not ownership').toBe(403);

    // Nothing may be written on the rejected path.
    const attempts = (await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM quiz_attempts WHERE user_id = ?',
    )
      .bind(attacker.id)
      .first()) as any;
    expect(attempts.c, 'no attempt row written for a rejected note_id').toBe(0);
    const items = (await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM study_items WHERE note_id = ? AND user_id = ?',
    )
      .bind(noteId, attacker.id)
      .first()) as any;
    expect(items.c, 'no SRS card bound to another user’s note').toBe(0);
  });

  it('the owner of a note can still log a quiz attempt against it (the fix is not over-broad)', async () => {
    const owner = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj);
    const res = await call('/api/quiz/attempt', {
      method: 'POST',
      token: owner.token,
      body: { note_id: noteId, question_text: 'own note question', is_correct: true },
    });
    expect(res.status).toBeLessThan(300);
  });

  it('120. ownership is by author_id, so it is stable across a note’s lifecycle', async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(owner.id, subj, { status: 'draft' });
    // attacker still cannot publish someone else's draft
    const res = await call(`/api/notes/${noteId}/publish`, {
      method: 'POST',
      token: attacker.token,
    });
    expect(res.status).toBe(403);
  });
});
