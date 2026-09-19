/**
 * Shared helpers for Worker contract tests (runs inside workerd via
 * @cloudflare/vitest-pool-workers; `SELF` is the Worker under test).
 */
import { env, SELF } from 'cloudflare:test';
import migration0002 from '../migrations/0002_add_suspension_fields.sql?raw';
import migration0003 from '../migrations/0003_add_warning_system.sql?raw';
import migration0004 from '../migrations/0004_add_warning_tracking.sql?raw';
import migration0008 from '../migrations/0008_add_refresh_tokens.sql?raw';

export const BASE = 'http://notarium.test';
export const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Schema for the test D1.
 * 1. The Worker's own `initializeDatabase()` runs on its first request (it is not
 *    exported, but `SELF.fetch` triggers it) — that is the real runtime schema.
 * 2. Only the additive migrations the runtime does NOT create are applied on top
 *    (login/me SELECT their columns). 0001 is skipped on purpose: it rebuilds
 *    `users` without `password_hash`; 0005/0006/0007/add_multi_photo_support are
 *    already covered by the runtime `CREATE`/`ALTER` statements.
 * Statements run one at a time and "duplicate column" errors are ignored,
 * mirroring how the runtime applies its own ALTERs.
 */
export async function initTestDatabase(): Promise<void> {
  const boot = await SELF.fetch(`${BASE}/test`);
  if (boot.status !== 200) throw new Error(`Worker boot failed: ${boot.status}`);

  const sql = [migration0002, migration0003, migration0004, migration0008].join('\n');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^SELECT\s+'/i.test(s));

  for (const statement of statements) {
    try {
      await env.DB.prepare(statement).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column name/i.test(message)) throw error;
    }
  }
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
  /** Issued alongside `token` since W2.1; '' when the response carried none (session.test.ts asserts the shape). */
  refreshToken: string;
  user: { id: number; email: string; name: string; class: string | null; role: string };
}

/** Calls the Worker's real `POST /api/auth/signup` and returns `{token, refreshToken, user}`. */
export async function signup(email = uniqueEmail(), name = 'Test User'): Promise<Session> {
  const res = await SELF.fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, 'CF-Connecting-IP': uniqueIp() },
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
export async function adminLogin(email = uniqueEmail('admin').replace('@example.test', '@notarium.site')): Promise<Session> {
  const res = await SELF.fetch(`${BASE}/api/auth/admin-login`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, 'CF-Connecting-IP': uniqueIp() },
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
