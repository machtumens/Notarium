import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// Test-only secrets. The worker reads these from `env`; wrangler.toml only
// carries the D1/KV bindings (real secrets live in Cloudflare, never committed),
// so tests inject fakes here via miniflare bindings. None are real credentials.
// AI keys are intentionally omitted so AI endpoints hit their "not configured"
// fallbacks and stay deterministic (no live provider calls in tests).
const TEST_BINDINGS = {
  JWT_SECRET: 'test-jwt-secret-red-team-not-for-prod',
  ADMIN_PASSWORD: 'test-admin-password',
  MODERATOR_PASSWORD: 'test-moderator-password',
  TECH_PASSWORD: 'test-technical-password',
  FRONTEND_URL: 'http://localhost:5173',
  ENVIRONMENT: 'test',
};

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: TEST_BINDINGS },
    }),
  ],
});
