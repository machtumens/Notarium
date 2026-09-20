// GET /api/notes/my-notes must return the note body.
//
// FINDING (main-lineage delta §2 row 10): the SELECT list omitted `content`,
// `description` and `author_name`, so a text-only note (no image, no OCR text)
// came back with an undefined body and "My Notes" rendered blank. The other
// note reads (by subject, search) already return all three.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('GET /api/notes/my-notes — note body fields', () => {
  it('a text-only note comes back with content, description and author_name', async () => {
    const me = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(me.id, subj, { title: 'Typed note', content: 'Typed body text' });
    await env.DB.prepare('UPDATE notes SET description = ?, image_path = NULL WHERE id = ?')
      .bind('A short description', noteId)
      .run();

    const res = await call('/api/notes/my-notes', { token: me.token });
    expect(res.status).toBe(200);
    const { notes } = (await res.json()) as { notes: any[] };
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(noteId);
    expect(notes[0].content).toBe('Typed body text');
    expect(notes[0].description).toBe('A short description');
    expect(notes[0].author_name).toBe('Student User');
  });

  it('still returns only the caller’s own notes', async () => {
    const me = await seedUser();
    const other = await seedUser();
    const subj = await seedSubject();
    await seedNote(me.id, subj, { title: 'Mine' });
    await seedNote(other.id, subj, { title: 'Theirs' });

    const res = await call('/api/notes/my-notes', { token: me.token });
    const { notes } = (await res.json()) as { notes: any[] };
    expect(notes.map((n) => n.title)).toEqual(['Mine']);
  });
});
