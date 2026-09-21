// M2.5 — GET /api/subjects: note_count is the number of notes the caller
// would actually see in GET /api/notes/subject/:id.
//
// FINDING: the route served the stored `subjects.note_count` counter. That
// counter is bumped on publish regardless of visibility (so a class-only
// note counted for every caller, including other classes and guests) and
// `/api/ops/recompute` rebuilds it from every non-deleted row, drafts
// included. The number a student saw on the subject card could not be
// reconciled with the list behind it.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

async function countFor(subjectId: number, token?: string): Promise<number> {
  const res = await call('/api/subjects', token ? { token } : {});
  expect(res.status).toBe(200);
  const { subjects } = (await res.json()) as { subjects: { id: number; note_count: number }[] };
  const row = subjects.find((s) => s.id === subjectId);
  expect(row, 'subject missing from the list').toBeDefined();
  return row!.note_count;
}

async function listLength(subjectId: number, token: string): Promise<number> {
  const res = await call(`/api/notes/subject/${subjectId}`, { token });
  expect(res.status).toBe(200);
  return ((await res.json()) as { notes: unknown[] }).notes.length;
}

/** Author in 10.1 with one published note for everyone, one for the class, one draft. */
async function seedScenario() {
  const author = await seedUser(); // class 10.1
  const subjectId = await seedSubject();
  await seedNote(author.id, subjectId, { title: 'Everyone', visibility: 'everyone' });
  await seedNote(author.id, subjectId, { title: 'Class only', visibility: 'class' });
  await seedNote(author.id, subjectId, { title: 'Draft', status: 'draft' });
  // What createNote/publishDraftNote leave in the stored counter: both
  // published notes, whatever their visibility.
  await env.DB.prepare('UPDATE subjects SET note_count = 2 WHERE id = ?').bind(subjectId).run();
  return { author, subjectId };
}

describe('GET /api/subjects — note_count counts the caller-visible notes', () => {
  it('a same-class caller counts the class note and not the draft, matching the list', async () => {
    const { subjectId } = await seedScenario();
    const classmate = await seedUser(); // also 10.1
    expect(await countFor(subjectId, classmate.token)).toBe(2);
    expect(await listLength(subjectId, classmate.token)).toBe(2);
  });

  it('a caller from another class does not count the class note, matching the list', async () => {
    const { subjectId } = await seedScenario();
    const other = await seedUser();
    await env.DB.prepare(`UPDATE users SET class = '11.2' WHERE id = ?`).bind(other.id).run();
    expect(await countFor(subjectId, other.token)).toBe(1);
    expect(await listLength(subjectId, other.token)).toBe(1);
  });

  it('a guest (no token) counts only the everyone note', async () => {
    const { subjectId } = await seedScenario();
    expect(await countFor(subjectId)).toBe(1);
  });

  it('a bad token is treated as a guest, not a 401 — the list stays public', async () => {
    const { subjectId } = await seedScenario();
    expect(await countFor(subjectId, 'not.a.jwt')).toBe(1);
  });

  it('the stored counter no longer leaks through (drafts counted by a recompute, or drift)', async () => {
    const { subjectId } = await seedScenario();
    // /api/ops/recompute subjects_note_count counts every non-deleted row,
    // drafts included; a hand-edited or drifted counter looks the same.
    await env.DB.prepare('UPDATE subjects SET note_count = 3 WHERE id = ?').bind(subjectId).run();
    const classmate = await seedUser();
    expect(await countFor(subjectId, classmate.token)).toBe(2);
  });

  it('a subject with no notes reports 0 and the response shape is unchanged', async () => {
    const subjectId = await seedSubject('Empty');
    const res = await call('/api/subjects');
    const { subjects } = (await res.json()) as { subjects: Record<string, unknown>[] };
    const row = subjects.find((s) => s.id === subjectId)!;
    expect(Object.keys(row).sort()).toEqual(['icon', 'id', 'name', 'note_count']);
    expect(row.note_count).toBe(0);
  });
});
