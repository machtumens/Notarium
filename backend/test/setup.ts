/**
 * Shared helpers for Worker contract tests (runs inside workerd via
 * @cloudflare/vitest-pool-workers; `SELF` is the Worker under test).
 */
import { applyD1Migrations, env, SELF } from 'cloudflare:test';

export const BASE = 'http://notarium.test';
export const JSON_HEADERS = { 'Content-Type': 'application/json' };
/**
 * Opt-in to the short-session contract (W2.3a): with this header a sign-in mints a 15-minute JWT
 * plus a refresh token; without it the Worker keeps the 24-hour JWT and sends no refresh token
 * (the deployed Vercel frontend has no refresh logic).
 */
export const REFRESH_SESSION_HEADERS = { 'X-Notarium-Session': 'refresh' };

/**
 * Schema for the test D1: the real migrations directory, applied the way `wrangler d1
 * migrations apply` does it (each file once, tracked in `d1_migrations`), then one request so
 * the Worker seeds the default subjects. Must run before the Worker's first request — since
 * W4.1 the runtime creates no tables itself.
 */
export async function initTestDatabase(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const boot = await SELF.fetch(`${BASE}/test`);
  if (boot.status !== 200) throw new Error(`Worker boot failed: ${boot.status}`);
}

let counter = 0;
/** Unique per call so signup never collides on `users.email UNIQUE`. */
export function uniqueEmail(prefix = 'user'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.test`;
}

/** Unique client IP per signup so the KV rate limiter (5 per 15 min per IP) never trips. */
function uniqueIp(): string {
  counter += 1;
  return `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
}

export interface Session {
  token: string;
  /** Issued alongside `token` for sign-ins that opt in (`refresh: true`); '' when the response carried none (session.test.ts asserts the shape). */
  refreshToken: string;
  user: { id: number; email: string; name: string; class: string | null; role: string };
}

export interface SignInOptions {
  /** Send `X-Notarium-Session: refresh` so the response carries a 15-minute JWT and a refresh token (W2.3a). Default: the legacy 24-hour JWT. */
  refresh?: boolean;
}

/** Calls the Worker's real `POST /api/auth/signup` and returns `{token, refreshToken, user}`. */
export async function signup(email = uniqueEmail(), name = 'Test User', options: SignInOptions = {}): Promise<Session> {
  const res = await SELF.fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, 'CF-Connecting-IP': uniqueIp(), ...(options.refresh ? REFRESH_SESSION_HEADERS : {}) },
    body: JSON.stringify({ name, email, password: 'password-123', class: '10.1' }),
  });
  const body = (await res.json()) as Partial<Session> & { error?: string };
  if (res.status !== 201 || !body.token || !body.user) {
    throw new Error(`signup failed: ${res.status} ${body.error ?? JSON.stringify(body)}`);
  }
  return { token: body.token, refreshToken: body.refreshToken ?? '', user: body.user };
}

/**
 * Admin JWT via `POST /api/auth/admin-login` (shared-secret from the test-only ADMIN_PASSWORD binding).
 * Unique client IP per call: the admin endpoints share a 5-per-15-min bucket per IP since W1.11.
 */
export async function adminLogin(email = uniqueEmail('admin').replace('@example.test', '@notarium.site'), options: SignInOptions = {}): Promise<Session> {
  const res = await SELF.fetch(`${BASE}/api/auth/admin-login`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, 'CF-Connecting-IP': uniqueIp(), ...(options.refresh ? REFRESH_SESSION_HEADERS : {}) },
    body: JSON.stringify({ email, password: env.ADMIN_PASSWORD, class: '10.1' }),
  });
  const body = (await res.json()) as Partial<Session> & { error?: string };
  if (res.status !== 200 || !body.token || !body.user) {
    throw new Error(`admin login failed: ${res.status} ${body.error ?? JSON.stringify(body)}`);
  }
  return { token: body.token, refreshToken: body.refreshToken ?? '', user: body.user };
}

export interface RequestOptions {
  method?: string;
  token?: string | null;
  headers?: Record<string, string>;
  body?: unknown;
  /** Send a pre-serialised body (e.g. an oversized string) instead of JSON-encoding `body`. */
  rawBody?: string;
}

/** JSON request helper. `token` adds `Authorization: Bearer`. */
export async function api(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  const hasBody = options.rawBody !== undefined || options.body !== undefined;
  if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  return SELF.fetch(`${BASE}${path}`, {
    method: options.method ?? (hasBody ? 'POST' : 'GET'),
    headers,
    body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
}

export async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
