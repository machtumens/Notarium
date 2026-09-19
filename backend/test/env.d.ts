/// <reference types="@cloudflare/workers-types" />

// Mirrors the (unexported) `Env` interface in src/index.ts for test typing.
export interface TestEnv {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  JWT_SECRET: string;
  ADMIN_PASSWORD: string;
  ENVIRONMENT?: string;
  FRONTEND_URL?: string;
  EXTRA_ORIGINS?: string;
  GEMINI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GOOGLE_CLOUD_VISION_API_KEY?: string;
}

declare module 'cloudflare:test' {
  interface ProvidedEnv extends TestEnv {}
}
