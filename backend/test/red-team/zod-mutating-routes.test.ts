// Zod on every mutating route that lacked it (main-lineage delta F12 + F10 follow-up).
//
// FINDING: /api/user/update, /api/user/class, PUT /api/auth/profile, the note
// update bodies (PUT /api/notes/:id, PUT /api/notes/:id/summary,
// PUT /api/admin/notes/:id) and the admin suspend/warn bodies all wrote raw
// `body.x` values into D1 with no type or length check, and most of them let a
// malformed JSON body escape as a 500 from the outer catch. Every route below
// must answer a clean 400 for junk and leave the row untouched; a valid body
// still works exactly as before.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

const admin = () => seedUser({ role: 'admin', admin_role: 'super' });

async function userColumn(userId: number, col: string): Promise<unknown> {
  const row = (await env.DB.prepare(`SELECT ${col} AS v FROM users WHERE id = ?`)
    .bind(userId)
    .first()) as { v: unknown };
  return row.v;
}

async function noteColumn(noteId: number, col: string): Promise<unknown> {
  const row = (await env.DB.prepare(`SELECT ${col} AS v FROM notes WHERE id = ?`)
    .bind(noteId)
    .first()) as { v: unknown };
  return row.v;
}

const MALFORMED = '{"display_name": "x", ';

describe('POST /api/user/update — zod', () => {
  it('malformed JSON is a 400, not a 500', async () => {
    const me = await seedUser();
    const res = await call('/api/user/update', {
      method: 'POST',
      token: me.token,
      rawBody: MALFORMED,
    });
    expect(res.status).toBe(400);
  });

  it.each([
    ['display_name is not a string', { display_name: 7 }],
    ['display_name is empty', { display_name: '' }],
    ['display_name is over 100 chars', { display_name: 'x'.repeat(101) }],
    ['photo_url is an object', { photo_url: { $gt: '' } }],
  ])('%s → 400 and the row is untouched', async (_label, body) => {
    const me = await seedUser();
    const before = await userColumn(me.id, 'display_name');
    const res = await call('/api/user/update', { method: 'POST', token: me.token, body });
    expect(res.status).toBe(400);
    expect(await userColumn(me.id, 'display_name')).toBe(before);
  });

  it('email is not a self-service field any more: it is ignored, the stored address stays', async () => {
    const me = await seedUser();
    const res = await call('/api/user/update', {
      method: 'POST',
      token: me.token,
      body: { email: 'someone-else@sekolahkristencalvin.org' },
    });
    expect(res.status).toBe(200);
    expect(await userColumn(me.id, 'email')).toBe(me.email);
  });

  it('a valid body still updates the caller', async () => {
    const me = await seedUser();
    const res = await call('/api/user/update', {
      method: 'POST',
      token: me.token,
      body: { display_name: 'Renamed', photo_url: 'data:image/png;base64,iVBORw0KGgo=' },
    });
    expect(res.status).toBe(200);
    expect(await userColumn(me.id, 'display_name')).toBe('Renamed');
    expect(await userColumn(me.id, 'photo_url')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});

describe('PUT /api/user/class — zod (class pattern)', () => {
  it('malformed JSON is a 400, not a 500', async () => {
    const me = await seedUser();
    const res = await call('/api/user/class', {
      method: 'PUT',
      token: me.token,
      rawBody: '{"class": ',
    });
    expect(res.status).toBe(400);
  });

  it.each([
    ['class missing', {}],
    ['class is a number', { class: 11 }],
    ['class is SQL', { class: "10.1'; DROP TABLE users;--" }],
    ['grade outside 10–12', { class: '9.1' }],
    ['not grade.section', { class: 'X IPA 1' }],
  ])('%s → 400 and the row is untouched', async (_label, body) => {
    const me = await seedUser();
    const res = await call('/api/user/class', { method: 'PUT', token: me.token, body });
    expect(res.status).toBe(400);
    expect(await userColumn(me.id, 'class')).toBe('10.1');
  });

  it('a well-formed class still updates the caller', async () => {
    const me = await seedUser();
    const res = await call('/api/user/class', {
      method: 'PUT',
      token: me.token,
      body: { class: '11.2' },
    });
    expect(res.status).toBe(200);
    expect(await userColumn(me.id, 'class')).toBe('11.2');
  });
});

describe('PUT /api/auth/profile — zod (what the old Settings/Profile screens send)', () => {
  it('malformed JSON is a 400', async () => {
    const me = await seedUser();
    const res = await call('/api/auth/profile', {
      method: 'PUT',
      token: me.token,
      rawBody: MALFORMED,
    });
    expect(res.status).toBe(400);
  });

  it.each([
    ['name is a number', { name: 42 }],
    ['description over 500 chars', { description: 'x'.repeat(501) }],
    ['class not grade.section', { class: 'nope' }],
    ['timezone is a number', { timezone: 5 }],
    ['photo_url is an array', { photo_url: ['data:'] }],
  ])('%s → 400 and the row is untouched', async (_label, body) => {
    const me = await seedUser();
    const res = await call('/api/auth/profile', { method: 'PUT', token: me.token, body });
    expect(res.status).toBe(400);
    expect(await userColumn(me.id, 'display_name')).toBe('Student User');
    expect(await userColumn(me.id, 'class')).toBe('10.1');
  });

  it('email is ignored: signup fixes it and nothing offers a change flow', async () => {
    const me = await seedUser();
    const res = await call('/api/auth/profile', {
      method: 'PUT',
      token: me.token,
      body: { email: 'someone-else@sekolahkristencalvin.org' },
    });
    expect(res.status).toBe(200);
    expect(await userColumn(me.id, 'email')).toBe(me.email);
  });

  it('the ProfileEditor body (name, class, description, photo_url as a data URL) still saves', async () => {
    const me = await seedUser();
    const res = await call('/api/auth/profile', {
      method: 'PUT',
      token: me.token,
      body: {
        name: 'Renamed',
        class: '10.2',
        description: 'hi',
        photo_url: 'data:image/png;base64,iVBORw0KGgo=',
      },
    });
    expect(res.status).toBe(200);
    expect(await userColumn(me.id, 'display_name')).toBe('Renamed');
    expect(await userColumn(me.id, 'class')).toBe('10.2');
    expect(await userColumn(me.id, 'description')).toBe('hi');
    expect(await userColumn(me.id, 'photo_url')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('an empty name is skipped, not rejected (the old form posts every field as-is)', async () => {
    const me = await seedUser();
    const res = await call('/api/auth/profile', {
      method: 'PUT',
      token: me.token,
      body: { name: '' },
    });
    expect(res.status).toBe(200);
    expect(await userColumn(me.id, 'display_name')).toBe('Student User');
  });
});

describe('PUT /api/notes/:id — zod', () => {
  it('malformed JSON is a 400, not a 500', async () => {
    const me = await seedUser();
    const noteId = await seedNote(me.id, await seedSubject());
    const res = await call(`/api/notes/${noteId}`, {
      method: 'PUT',
      token: me.token,
      rawBody: '{"title": ',
    });
    expect(res.status).toBe(400);
  });

  it.each([
    ['title is a number', { title: 5 }],
    ['title is empty', { title: '' }],
    ['tags is not an array', { tags: 'not-an-array' }],
    ['content is an object', { content: { $: 1 } }],
  ])('%s → 400 and the note is untouched', async (_label, body) => {
    const me = await seedUser();
    const noteId = await seedNote(me.id, await seedSubject());
    const res = await call(`/api/notes/${noteId}`, { method: 'PUT', token: me.token, body });
    expect(res.status).toBe(400);
    expect(await noteColumn(noteId, 'title')).toBe('Seed Note');
    expect(await noteColumn(noteId, 'content')).toBe('body');
  });

  it('a valid body still updates the note', async () => {
    const me = await seedUser();
    const noteId = await seedNote(me.id, await seedSubject());
    const res = await call(`/api/notes/${noteId}`, {
      method: 'PUT',
      token: me.token,
      body: { title: 'New title', tags: ['a', 'b'] },
    });
    expect(res.status).toBe(200);
    expect(await noteColumn(noteId, 'title')).toBe('New title');
    expect(await noteColumn(noteId, 'tags')).toBe('["a","b"]');
  });
});

describe('PUT /api/notes/:id/summary — zod', () => {
  it('malformed JSON is a 400, not a 500', async () => {
    const me = await seedUser();
    const noteId = await seedNote(me.id, await seedSubject());
    const res = await call(`/api/notes/${noteId}/summary`, {
      method: 'PUT',
      token: me.token,
      rawBody: '{"summary": ',
    });
    expect(res.status).toBe(400);
  });

  it('summary must be a string', async () => {
    const me = await seedUser();
    const noteId = await seedNote(me.id, await seedSubject());
    const res = await call(`/api/notes/${noteId}/summary`, {
      method: 'PUT',
      token: me.token,
      body: { summary: 5 },
    });
    expect(res.status).toBe(400);
    expect(await noteColumn(noteId, 'summary')).toBeNull();
  });

  it('a string summary is stored', async () => {
    const me = await seedUser();
    const noteId = await seedNote(me.id, await seedSubject());
    const res = await call(`/api/notes/${noteId}/summary`, {
      method: 'PUT',
      token: me.token,
      body: { summary: 'tl;dr' },
    });
    expect(res.status).toBe(200);
    expect(await noteColumn(noteId, 'summary')).toBe('tl;dr');
  });
});

describe('PUT /api/admin/notes/:id — zod', () => {
  it('malformed JSON is a 400, not a 500', async () => {
    const a = await admin();
    const noteId = await seedNote(a.id, await seedSubject());
    const res = await call(`/api/admin/notes/${noteId}`, {
      method: 'PUT',
      token: a.token,
      rawBody: '{"title": ',
    });
    expect(res.status).toBe(400);
  });

  it('a non-string content is rejected and the note is untouched', async () => {
    const a = await admin();
    const noteId = await seedNote(a.id, await seedSubject());
    const res = await call(`/api/admin/notes/${noteId}`, {
      method: 'PUT',
      token: a.token,
      body: { content: 1 },
    });
    expect(res.status).toBe(400);
    expect(await noteColumn(noteId, 'content')).toBe('body');
  });

  it('a valid body still updates the note', async () => {
    const a = await admin();
    const noteId = await seedNote(a.id, await seedSubject());
    const res = await call(`/api/admin/notes/${noteId}`, {
      method: 'PUT',
      token: a.token,
      body: { title: 'Moderated' },
    });
    expect(res.status).toBe(200);
    expect(await noteColumn(noteId, 'title')).toBe('Moderated');
  });
});

describe('POST /api/admin/suspend/:id — zod (days 1–365 int, reason ≤ 500)', () => {
  it('malformed JSON is a 400, not a 500', async () => {
    const a = await admin();
    const victim = await seedUser();
    const res = await call(`/api/admin/suspend/${victim.id}`, {
      token: a.token,
      rawBody: '{"days": ',
    });
    expect(res.status).toBe(400);
    expect(await userColumn(victim.id, 'suspended')).toBe(0);
  });

  it.each([
    ['days = 0', { days: 0 }],
    ['days = 366', { days: 366 }],
    ['days as a string', { days: '7' }],
    ['days fractional', { days: 7.5 }],
    ['reason over 500 chars', { days: 7, reason: 'x'.repeat(501) }],
  ])('%s → 400 and the user is not suspended', async (_label, body) => {
    const a = await admin();
    const victim = await seedUser();
    const res = await call(`/api/admin/suspend/${victim.id}`, { token: a.token, body });
    expect(res.status).toBe(400);
    expect(await userColumn(victim.id, 'suspended')).toBe(0);
  });

  it('a valid body suspends for exactly that many days', async () => {
    const a = await admin();
    const victim = await seedUser();
    const res = await call(`/api/admin/suspend/${victim.id}`, {
      token: a.token,
      body: { days: 30, reason: 'late' },
    });
    expect(res.status).toBe(200);
    expect(await userColumn(victim.id, 'suspended')).toBe(1);
    const end = Date.parse((await userColumn(victim.id, 'suspension_end_date')) as string);
    const expected = Date.now() + 30 * 24 * 3600 * 1000;
    expect(Math.abs(end - expected)).toBeLessThan(60_000);
  });
});

describe('POST /api/admin/warn/:id — zod (message ≤ 500)', () => {
  it('malformed JSON is a 400, not a 500', async () => {
    const a = await admin();
    const victim = await seedUser();
    const res = await call(`/api/admin/warn/${victim.id}`, {
      token: a.token,
      rawBody: '{"message": ',
    });
    expect(res.status).toBe(400);
    expect(await userColumn(victim.id, 'warning')).toBe(0);
  });

  it.each([
    ['message over 500 chars', { message: 'x'.repeat(501) }],
    ['message is a number', { message: 5 }],
  ])('%s → 400 and the user is not warned', async (_label, body) => {
    const a = await admin();
    const victim = await seedUser();
    const res = await call(`/api/admin/warn/${victim.id}`, { token: a.token, body });
    expect(res.status).toBe(400);
    expect(await userColumn(victim.id, 'warning')).toBe(0);
  });

  it('a valid message still warns', async () => {
    const a = await admin();
    const victim = await seedUser();
    const res = await call(`/api/admin/warn/${victim.id}`, {
      token: a.token,
      body: { message: 'Be nice' },
    });
    expect(res.status).toBe(200);
    expect(await userColumn(victim.id, 'warning')).toBe(1);
    expect(await userColumn(victim.id, 'warning_message')).toBe('Be nice');
  });
});
