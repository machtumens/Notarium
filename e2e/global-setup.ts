import { API_URL } from '../playwright.config';

/**
 * Main builds its own schema: `initializeDatabase()` (backend/src/lib/db.ts) runs on the Worker's
 * first request — `CREATE TABLE IF NOT EXISTS` for every table plus the 14 default subjects and the
 * grade classes — gated by a KV flag that the wiped `--persist-to` dir never carries. Nothing is
 * migrated here (main has no `wrangler d1 migrations` wiring at all); this only confirms the seed
 * landed before any spec signs up. LOCAL only — the Worker is the one playwright.config started.
 */
export default async function globalSetup() {
  const health = await fetch(`${API_URL}/api/health`);
  if (!health.ok)
    throw new Error(
      `Worker on ${API_URL} answered ${health.status} to GET /api/health; is wrangler dev up?`,
    );

  const subjects = await fetch(`${API_URL}/api/subjects`);
  if (!subjects.ok)
    throw new Error(
      `GET /api/subjects answered ${subjects.status}; main's initializeDatabase() should have run on the first request`,
    );
  const { subjects: rows } = (await subjects.json()) as { subjects: unknown[] };
  if (rows.length !== 14)
    throw new Error(
      `expected main's 14 default subjects after the first request, got ${rows.length}`,
    );
}
