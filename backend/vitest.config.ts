import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Worker contract tests run inside workerd via @cloudflare/vitest-pool-workers.
// Bindings (local D1 `notarium-db-local`, KV `RATE_LIMIT`, vars) come from
// wrangler.toml env `development`. Secrets are test-only dummies merged on top
// (`miniflare.bindings` is Object.assign-merged with the wrangler vars) — the
// real values are set with `wrangler secret put` and never live in this file.
export default defineWorkersConfig({
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
          },
        },
      },
    },
  },
});
