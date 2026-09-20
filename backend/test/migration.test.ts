/**
 * W2.3c — the runtime `refresh_tokens` migration only tolerates "duplicate column name".
 * Runs in its own file on purpose: the Worker initialises the schema once per isolate, on
 * its first request, and `env.DB` here is the very binding the Worker uses — so a `prepare`
 * stub installed before that first request shapes what the migration sees. No `initTestDatabase`
 * here: the boot under test IS the initialisation.
 */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { BASE } from './setup';

const REVOKED_AT_ALTER = /ALTER TABLE refresh_tokens ADD COLUMN revoked_at/i;

describe('W2.3c — refresh_tokens migration catch is narrow', () => {
  it('a "duplicate column name" ALTER stays silent, any other ALTER failure surfaces instead of being swallowed', async () => {
    const original = env.DB.prepare.bind(env.DB);
    const errors: string[] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
    const prepare = vi.spyOn(env.DB, 'prepare').mockImplementation((query: string) => {
      if (REVOKED_AT_ALTER.test(query)) {
        // the `family` ALTER before it is a real duplicate (CREATE TABLE already has the column) and must be tolerated;
        // this one fails for an unrelated reason
        return { run: () => Promise.reject(new Error('D1_ERROR: database is locked: SQLITE_BUSY')) } as unknown as D1PreparedStatement;
      }
      return original(query);
    });
    try {
      const boot = await SELF.fetch(`${BASE}/test`);
      expect(boot.status).toBe(200); // the Worker still answers; a failed initialisation is logged, not fatal
      expect(prepare.mock.calls.some(([q]) => REVOKED_AT_ALTER.test(String(q)))).toBe(true);
      const surfaced = errors.filter((line) => line.includes('Database initialization error'));
      expect(surfaced, 'the non-duplicate ALTER failure reaches the initialisation error log').toHaveLength(1);
      expect(surfaced[0]).toContain('SQLITE_BUSY');
      expect(errors.some((line) => /duplicate column name/i.test(line)), 'a duplicate column is not an error').toBe(false);
    } finally {
      prepare.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
