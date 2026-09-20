/**
 * W4.1 — the Worker no longer builds its schema; it only seeds the default subjects, and it
 * keeps trying until the schema exists. One test on purpose: `dbInitialized` is module state of
 * the isolate and the test storage is rolled back between tests, so the order "first request
 * before migrations, then after" has to be one story.
 */
import { applyD1Migrations, env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { BASE, json } from './setup';

const DEFAULT_NAMES = ['Bahasa Indonesia', 'Bahasa Inggris', 'Biologi', 'Ekonomi', 'Filsafat', 'Fisika', 'Geografi', 'Kimia', 'Matematika', 'PAK', 'PKN', 'Sains', 'Sejarah Indonesia', 'Sosiologi'];

describe('W4.1 — subjects seed waits for the schema', () => {
  it('a request before the migrations creates no table; the first request after them seeds the missing subjects and leaves existing rows alone', async () => {
    const early = await SELF.fetch(`${BASE}/test`);
    expect(early.status).toBe(200);
    await expect(env.DB.prepare('SELECT COUNT(*) AS n FROM subjects').first()).rejects.toThrow(/no such table/i);
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'").all();
    expect(tables.results, 'the runtime created nothing').toEqual([]);

    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    // A row that predates the seed, with its own icon — production's subjects carry font-awesome names, not emoji.
    await env.DB.prepare("INSERT INTO subjects (name, icon) VALUES ('Kimia', 'fa-vial')").run();

    const res = await SELF.fetch(`${BASE}/api/subjects`);
    expect(res.status).toBe(200);
    const body = await json<{ subjects: { name: string; icon: string }[] }>(res);
    expect(body.subjects.map((s) => s.name).sort()).toEqual(DEFAULT_NAMES);
    expect(body.subjects.find((s) => s.name === 'Kimia')?.icon, 'INSERT OR IGNORE keeps the existing row').toBe('fa-vial');
    const { n } = (await env.DB.prepare('SELECT COUNT(*) AS n FROM subjects').first<{ n: number }>())!;
    expect(n).toBe(14);
  });
});
