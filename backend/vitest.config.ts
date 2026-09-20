import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';

// Worker contract tests run inside workerd via @cloudflare/vitest-pool-workers.
// Bindings (local D1 `notarium-db-local`, KV `RATE_LIMIT`, vars) come from
// wrangler.toml env `development`. Secrets are test-only dummies merged on top
// (`miniflare.bindings` is Object.assign-merged with the wrangler vars) — the
// real values are set with `wrangler secret put` and never live in this file.
// The schema comes from migrations/ (W4.1): the directory is read here in Node and
// handed to the tests as TEST_MIGRATIONS; setup.ts applies it with applyD1Migrations()
// before the Worker's first request, exactly like `wrangler d1 migrations apply` does.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    test: {
      include: ['test/**/*.test.ts'],
      // The Worker logs every request; only show console output for failing tests.
      silent: 'passed-only',
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml', environment: 'development' },
          miniflare: {
            bindings: {
              JWT_SECRET: 'test-only-jwt-secret-not-a-real-value',
              ADMIN_PASSWORD: 'test-only-admin-password-not-a-real-value',
              GIT_SHA: 'test-sha',
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
