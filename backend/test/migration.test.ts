/**
 * W4.1 — the schema comes from migrations/ and nothing else. `initTestDatabase()` applies the
 * directory the way `wrangler d1 migrations apply` does (each file once, recorded in
 * `d1_migrations`); these tests pin the properties the one-time production apply relies on.
 */
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { initTestDatabase } from './setup';

beforeAll(initTestDatabase);

async function appliedNames(): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{ name: string }>();
  return results.map((row) => row.name);
}

async function columns(table: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return results.map((row) => row.name);
}

describe('W4.1 — migrations directory is the schema', () => {
  it('every file in migrations/ is applied once, in numeric order, and recorded in d1_migrations', async () => {
    const expected = env.TEST_MIGRATIONS.map((m) => m.name);
    expect(expected.length).toBeGreaterThanOrEqual(4);
    expect(expected[0]).toBe('0001_baseline.sql');
    expect(await appliedNames()).toEqual(expected);
  });

  it('applying the directory again is a no-op (tracking, not luck)', async () => {
    const before = await appliedNames();
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    expect(await appliedNames()).toEqual(before);
  });

  it('0001_baseline re-runs cleanly on a database that already has everything — the production one-time apply', async () => {
    const baseline = env.TEST_MIGRATIONS[0];
    const tablesBefore = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name").all();
    for (const query of baseline.queries) {
      await env.DB.prepare(query).run();
    }
    const tablesAfter = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name").all();
    expect(tablesAfter.results).toEqual(tablesBefore.results);
  });

  it('the ALTER files (0002, 0003) are once-only: re-running one fails with "duplicate column", which is why d1_migrations must track them', async () => {
    const family = env.TEST_MIGRATIONS.find((m) => m.name === '0002_refresh_tokens_family.sql');
    expect(family).toBeDefined();
    const alter = family!.queries.find((q) => /ALTER TABLE/i.test(q));
    expect(alter).toBeDefined();
    await expect(env.DB.prepare(alter!).run()).rejects.toThrow(/duplicate column name/i);
  });

  it('the migrated schema has every column the Worker reads or writes', async () => {
    expect(await columns('users')).toEqual(
      expect.arrayContaining([
        'email', 'password_hash', 'class', 'role', 'notes_uploaded', 'total_likes', 'total_admin_upvotes', 'suspended',
        'diamonds', 'description', 'points', 'suspension_end_date', 'suspension_reason', 'warning', 'warning_message',
        'warning_first_viewed', 'warning_view_count', 'encrypted_yw_id',
      ]),
    );
    expect(await columns('notes')).toEqual(
      expect.arrayContaining([
        'title', 'description', 'subject_id', 'author_id', 'author_class', 'extracted_text', 'image_path', 'content', 'tags',
        'summary', 'status', 'scheduled_publish_at', 'visibility', 'parent_note_id', 'part_number', 'likes', 'admin_upvotes',
      ]),
    );
    expect(await columns('refresh_tokens')).toEqual(
      expect.arrayContaining(['user_id', 'token', 'expires_at', 'created_at', 'family', 'revoked_at']),
    );
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_refresh_tokens_%' ORDER BY name").all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      'idx_refresh_tokens_expires_at', 'idx_refresh_tokens_family', 'idx_refresh_tokens_token', 'idx_refresh_tokens_user_id',
    ]);
  });
});
