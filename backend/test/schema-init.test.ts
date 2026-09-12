// Does initializeDatabase() actually repair a PRODUCTION-shaped database?
//
// This is the question the red-team suites cannot answer: they apply the full
// schema.sql first, so every column and table already exists and init has
// nothing left to do. Production is the opposite case — it has never seen
// `wrangler d1 migrations apply`, so it is missing everything that lives only
// in migrations/, and its timestamp columns still carry SQLite's space-form
// default. These tests rebuild that shape and prove init closes the gaps.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { initializeDatabase } from '../src/lib/db';

// The production shape, as observed on the live database on 2026-08-31:
// `users` without admin_role, `notes` still defaulting to datetime('now'),
// and none of the tables that only migrations/ ever created.
const ABSENT_IN_PRODUCTION = [
  'tutor_bookings',
  'tutor_sessions',
  'tutor_availability',
  'tutor_profiles',
  'test_sessions',
  'ai_usage',
  'request_metrics',
  'usage_stats',
];

async function buildProductionShapedDb() {
  for (const t of ABSENT_IN_PRODUCTION) {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  await env.DB.prepare('DROP TABLE IF EXISTS notes').run();
  await env.DB.prepare('DROP TABLE IF EXISTS users').run();

  await env.DB.prepare(
    `CREATE TABLE users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       encrypted_yw_id TEXT UNIQUE,
       display_name TEXT,
       email TEXT UNIQUE,
       password_hash TEXT,
       photo_url TEXT,
       class TEXT,
       role TEXT DEFAULT 'student',
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  ).run();

  await env.DB.prepare(
    `CREATE TABLE notes (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT,
       author_id INTEGER,
       subject_id INTEGER,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  ).run();
}

const columnsOf = async (table: string): Promise<string[]> => {
  const { results } = await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all();
  return results.map((r) => (r as { name: string }).name);
};

const tableExists = async (name: string): Promise<boolean> =>
  Boolean(
    await env.DB.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`)
      .bind(name)
      .first(),
  );

describe('initializeDatabase against a production-shaped database', () => {
  beforeAll(async () => {
    await buildProductionShapedDb();
    await initializeDatabase(env as never);
  });

  it('adds users.admin_role, without which /api/auth/me 500s on every page load', async () => {
    expect(await columnsOf('users')).toContain('admin_role');
  });

  it('adds notes.deleted_at, which every active-notes query filters on', async () => {
    expect(await columnsOf('notes')).toContain('deleted_at');
  });

  it.each(ABSENT_IN_PRODUCTION)('creates the missing table %s', async (table) => {
    expect(await tableExists(table)).toBe(true);
  });

  it('normalises a defaulted insert to ISO-8601 UTC despite the old column default', async () => {
    // notes.created_at still DEFAULTs to datetime('now') — SQLite cannot ALTER
    // a default — so the row lands in space form and the trigger rewrites it.
    const row = await env.DB.prepare(
      `INSERT INTO notes (title) VALUES ('probe') RETURNING created_at`,
    ).first<{ created_at: string }>();

    // Re-read: RETURNING sees the row before the AFTER INSERT trigger fires.
    const stored = await env.DB.prepare(
      `SELECT created_at FROM notes WHERE title = 'probe'`,
    ).first<{ created_at: string }>();

    expect(row?.created_at).toMatch(/^\d{4}-\d{2}-\d{2} /); // the default, unrepaired
    expect(stored?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('leaves an explicitly-written ISO value untouched', async () => {
    await env.DB.prepare(
      `INSERT INTO notes (title, created_at) VALUES ('explicit', '2026-01-02T03:04:05Z')`,
    ).run();
    const stored = await env.DB.prepare(
      `SELECT created_at FROM notes WHERE title = 'explicit'`,
    ).first<{ created_at: string }>();
    expect(stored?.created_at).toBe('2026-01-02T03:04:05Z');
  });

  it('is idempotent — a second pass changes nothing and does not throw', async () => {
    await expect(initializeDatabase(env as never)).resolves.not.toThrow();
    expect(await columnsOf('users')).toContain('admin_role');
    expect(await tableExists('tutor_profiles')).toBe(true);
  });
});
