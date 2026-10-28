import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Unit + component tests (Vitest + Testing Library in jsdom). Standalone on purpose: it mirrors the
 * `@` alias from vite.config.ts/tsconfig.json instead of importing vite.config.ts, so build-time
 * env guards never touch the test run. `src/selfcheck.test.ts` is a tsx script (`npm run check`), not a vitest file.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/selfcheck.test.ts', '**/node_modules/**'],
  },
});
