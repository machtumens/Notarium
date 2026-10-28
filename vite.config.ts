import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // F3 guard: a production bundle must never point at the dev mock. Vite loads `.env.local` in every
  // mode, so a forgotten rename would bake http://localhost:8787 into the shipped app; the shell env
  // (VITE_API_URL=...) still wins over the file, which is how CI builds.
  // ponytail: this tree still has `.env.local` pointing at the mock, so `npm run build` fails here on
  // purpose until the owner renames it to `.env.development.local` (Wave 0, H3). Do not weaken the guard.
  const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL ?? '';
  if (mode === 'production' && /localhost|127\.0\.0\.1/.test(apiUrl)) {
    throw new Error(
      `VITE_API_URL is "${apiUrl}" in a production build. Rename .env.local to .env.development.local (or set VITE_API_URL to the worker URL) so the bundle does not ship pointing at a local server.`,
    );
  }
  if (mode === 'production' && apiUrl === '') {
    console.warn(
      'VITE_API_URL is not set for this production build; the bundle will use the hardcoded worker URL from src/lib/api.ts.',
    );
  }
  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: { port: Number(process.env.PORT) || 5173 },
  };
});
