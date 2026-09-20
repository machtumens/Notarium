// POST /api/notes with no images must persist a note.
//
// FINDING (staging smoke on the live lineage; master had it before W1.7):
// createNote inserted one row per image chunk, so a text-only body produced
// zero rows while still answering 200 {notes:[], success:true, totalParts:0}.
// A note with no images must create exactly one row carrying the text
// fields, the response must include it, and the multi-image split
// (3 images per part, parts linked by parent_note_id) must stay as it was.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, env } from './helpers';

beforeAll(async () => {
  await applySchema();
  // Warm the isolate once: the worker's first request runs initializeDatabase(),
  // which deletes every subject that is not one of its defaults. Seeding a
  // subject before that first request would lose it to the reset.
  await call('/api/health');
});
beforeEach(resetData);

const TEXT_ONLY = {
  title: 'Typed note',
  content: 'Typed body text',
  description: 'A short description',
  status: 'published',
  visibility: 'everyone',
  tags: [] as string[],
};

async function rowCount(authorId: number): Promise<number> {
  const row = (await env.DB.prepare('SELECT COUNT(*) AS c FROM notes WHERE author_id = ?')
    .bind(authorId)
    .first()) as { c: number };
  return row.c;
}

describe('POST /api/notes — text-only note', () => {
  it('creates exactly one row, returns it, and my-notes lists it with content', async () => {
    const me = await seedUser();
    const subj = await seedSubject();

    const res = await call('/api/notes', {
      method: 'POST',
      token: me.token,
      body: { ...TEXT_ONLY, subject_id: subj },
    });
    expect([200, 201]).toContain(res.status);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.totalParts).toBe(1);
    expect(typeof json.note?.id).toBe('number');
    expect(json.notes).toHaveLength(1);
    expect(json.notes[0].id).toBe(json.note.id);
    expect(json.note.title).toBe('Typed note');
    expect(json.note.content).toBe('Typed body text');
    expect(json.note.description).toBe('A short description');
    expect(json.note.status).toBe('published');
    expect(json.note.visibility).toBe('everyone');
    expect(json.note.image_path).toBeNull(); // no images: NULL, not '[]'
    expect(json.note.part_number).toBe(1);
    expect(json.note.parent_note_id).toBeNull();

    expect(await rowCount(me.id)).toBe(1);

    const mine = await call('/api/notes/my-notes', { token: me.token });
    const { notes } = (await mine.json()) as { notes: any[] };
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(json.note.id);
    expect(notes[0].content).toBe('Typed body text');
  });

  it('a published text-only note bumps notes_uploaded and subject note_count by exactly one', async () => {
    const me = await seedUser();
    const subj = await seedSubject();
    await call('/api/notes', {
      method: 'POST',
      token: me.token,
      body: { ...TEXT_ONLY, subject_id: subj },
    });

    const u = (await env.DB.prepare('SELECT notes_uploaded AS v FROM users WHERE id = ?')
      .bind(me.id)
      .first()) as { v: number };
    const s = (await env.DB.prepare('SELECT note_count AS v FROM subjects WHERE id = ?')
      .bind(subj)
      .first()) as { v: number };
    expect(u.v).toBe(1);
    expect(s.v).toBe(1);
  });

  it('a draft text-only note is stored as draft and not counted', async () => {
    const me = await seedUser();
    const subj = await seedSubject();
    const res = await call('/api/notes', {
      method: 'POST',
      token: me.token,
      body: { ...TEXT_ONLY, subject_id: subj, status: 'draft' },
    });
    const json = (await res.json()) as any;
    expect(json.totalParts).toBe(1);
    expect(json.note.status).toBe('draft');
    expect(await rowCount(me.id)).toBe(1);
    const u = (await env.DB.prepare('SELECT notes_uploaded AS v FROM users WHERE id = ?')
      .bind(me.id)
      .first()) as { v: number };
    expect(u.v).toBe(0);
  });
});

describe('POST /api/notes — multi-image behaviour unchanged', () => {
  it('4 images still split into 2 linked parts of 3 + 1', async () => {
    const me = await seedUser();
    const subj = await seedSubject();
    const res = await call('/api/notes', {
      method: 'POST',
      token: me.token,
      body: { ...TEXT_ONLY, subject_id: subj, images: ['i1', 'i2', 'i3', 'i4'] },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.totalParts).toBe(2);
    expect(json.notes).toHaveLength(2);
    const [first, second] = json.notes;
    expect(json.note.id).toBe(first.id);
    expect(first.title).toBe('Typed note');
    expect(first.part_number).toBe(1);
    expect(first.parent_note_id).toBeNull();
    expect(JSON.parse(first.image_path)).toEqual(['i1', 'i2', 'i3']);
    expect(second.title).toBe('Typed note (2)');
    expect(second.part_number).toBe(2);
    expect(second.parent_note_id).toBe(first.id);
    expect(JSON.parse(second.image_path)).toEqual(['i4']);
    expect(await rowCount(me.id)).toBe(2);
  });
});
