import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Browser tests for the critical frontend flows against this repo's OWN Worker — `backend/`, run
 * with `wrangler dev` on a local D1/KV. Not a mock: the flows here need real `/api/notes/my-notes`,
 * real password checks and real 409s, none of which a mock can prove.
 *
 * Two servers are started per run:
 *   1. the Worker on :8788 from `backend/` (`--env development`: local D1 + KV preview id; that env
 *      declares no Durable Object, so the rate limiter falls back to KV), on a throwaway
 *      `--persist-to` state dir that is wiped first, so every run gets a fresh local D1 + KV (login
 *      is limited to 5 per 15 min per IP+email and lives in KV/DO state);
 *   2. Vite on :5174 with `VITE_API_URL` set in the shell env (no `.env*` file is written; the
 *      shell env wins over `.env.local`, see vite.config.ts).
 *
 * The Worker needs `JWT_SECRET` (tokens) and `ADMIN_PASSWORD` (admin login) at runtime: both are
 * random per-run values passed as `--var`; nothing is written to `.dev.vars` or anywhere else in
 * the tree. `EXTRA_ALLOWED_ORIGINS` allow-lists :5174 for CORS (`--env development` only allows
 * :5173). The Worker builds its own schema: `initializeDatabase()` runs on its first request and
 * seeds the 14 subjects — there is nothing to migrate, `e2e/global-setup.ts` just confirms the seed.
 *
 * `E2E_BACKEND_DIR` still overrides the backend location, for running these against a worktree.
 *
 * Windows: miniflare nests its SQLite file several levels under --persist-to, so a checkout on a
 * very long path blows MAX_PATH and every D1 query throws. That shows up only as /api/health
 * answering 503 until this webServer times out. Shorten the checkout path, or set
 * `git config core.longpaths true`.
 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CI = !!process.env.CI;

export const APP_URL = 'http://localhost:5174';
export const API_URL = 'http://localhost:8788';
export const BACKEND_DIR = process.env.E2E_BACKEND_DIR ?? path.resolve(ROOT, 'backend');
export const WRANGLER_STATE_DIR = path.resolve(ROOT, 'e2e/.wrangler-state');
export const ACCOUNT_STATE = path.resolve(ROOT, 'e2e/.auth/account.json');

// Throwaway per-run secrets. Only ever live in this process and the Worker's memory.
const JWT_SECRET = process.env.E2E_JWT_SECRET ?? randomBytes(32).toString('hex');
const ADMIN_PASSWORD = randomBytes(24).toString('hex');

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report' }]],
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    // Creates the shared account via the API once per run and saves its localStorage token.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      // Wipe the state dir first so D1/KV start empty (and the schema-init KV flag with them, so main
      // rebuilds its tables); --persist-to keeps every byte of run state out of the read-only worktree.
      command: `rm -rf "${WRANGLER_STATE_DIR}" && npx wrangler dev --env development --port 8788 --persist-to "${WRANGLER_STATE_DIR}" --var JWT_SECRET:${JWT_SECRET} --var ADMIN_PASSWORD:${ADMIN_PASSWORD} --var EXTRA_ALLOWED_ORIGINS:${APP_URL}`,
      cwd: BACKEND_DIR,
      // The banner precedes readiness, so poll a real route instead of the port. Main's /api/health is
      // a `SELECT 1` (200 `{status:'ok'}`), and that first request is what triggers its schema init.
      url: `${API_URL}/api/health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      cwd: ROOT,
      url: APP_URL,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
