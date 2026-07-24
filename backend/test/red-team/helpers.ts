// Shared harness for the red-team integration suites.
//
// Everything hits the real worker through `SELF.fetch` with real D1 + KV
// bindings (miniflare-simulated). Secrets are injected by vitest.config.ts.
// We seed the DB directly through `env.DB` and mint tokens with the app's own
// `createToken`, so a bug in auth/validation shows up as a failing HTTP call —
// exactly what a red-team wants.
import { env, SELF } from 'cloudflare:test';
import { createToken, hashPassword } from '../../src/lib/auth';
// Full production schema (18 tables). `?raw` gives us the file text; we apply it
// ourselves rather than trusting the app's partial `initializeDatabase`.
import schemaSql from '../../schema.sql?raw';

export { env, SELF };

export const SCHOOL_DOMAIN = '@sekolahkristencalvin.org';
export const TEST_SECRETS = {
  ADMIN_PASSWORD: 'test-admin-password',
  MODERATOR_PASSWORD: 'test-moderator-password',
  TECH_PASSWORD: 'test-technical-password',
};

// Tables the suites touch — cleared between tests so each starts clean.
const TABLES = [
  'note_likes',
  'admin_note_likes',
  'chat_messages',
  'chat_sessions',
  'quiz_attempts',
  'study_items',
  'notes',
  'admin_activity_log',
  'usage_stats',
  'request_metrics',
  'users',
  'subjects',
  'grade_classes',
];

let schemaApplied = false;

/** Apply the full schema once. CREATE TABLE IF NOT EXISTS makes it idempotent. */
export async function applySchema(): Promise<void> {
  if (schemaApplied) return;
  const statements = schemaSql
    .replace(/^\s*--.*$/gm, '') // strip line comments
    // FAITHFULNESS FIX / FINDING: schema.sql marks encrypted_yw_id NOT NULL, but
    // signupEndpoint never sets it. Production only works because the app's
    // initializeDatabase() creates a laxer (nullable) users table. Match that
    // reality so tests exercise the code path prod actually runs.
    .replace(/encrypted_yw_id TEXT NOT NULL UNIQUE/g, 'encrypted_yw_id TEXT UNIQUE')
    // FINDING: schema.sql declares `email TEXT` (no UNIQUE), but the app's live
    // initializeDatabase() creates `email TEXT UNIQUE`. Match prod so the signup
    // dedup / concurrent-signup guarantee actually holds in tests.
    .replace(/^\s*email TEXT,\s*$/m, 'email TEXT UNIQUE,')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    try {
      await env.DB.prepare(stmt).run();
    } catch (e) {
      // Some CREATE INDEX / view statements may already exist — non-fatal.
    }
  }
  schemaApplied = true;
}

/** Wipe rows + rate-limit KV keys so each test is independent. */
export async function resetData(): Promise<void> {
  for (const t of TABLES) {
    try {
      await env.DB.prepare(`DELETE FROM ${t}`).run();
    } catch {
      // table may not exist in this schema variant
    }
  }
  const list = await env.RATE_LIMIT.list();
  await Promise.all(list.keys.map((k) => env.RATE_LIMIT.delete(k.name)));
}

export interface SeededUser {
  id: number;
  email: string;
  password: string;
  token: string;
  role: string;
  admin_role?: string;
}

let emailSeq = 0;
export function uniqueEmail(prefix = 'student'): string {
  emailSeq += 1;
  return `${prefix}${emailSeq}${SCHOOL_DOMAIN}`;
}

/**
 * Seed a user straight into D1 and return a valid JWT for it.
 * role='admin' + admin_role controls RBAC tier. password defaults to a known value.
 */
export async function seedUser(
  opts: Partial<SeededUser> & { suspended?: boolean } = {},
): Promise<SeededUser> {
  const email = opts.email ?? uniqueEmail(opts.role === 'admin' ? 'admin' : 'student');
  const password = opts.password ?? 'CorrectHorse9';
  const role = opts.role ?? 'student';
  const hash = await hashPassword(password);
  const row = (await env.DB.prepare(
    `INSERT INTO users (encrypted_yw_id, display_name, email, password_hash, class, role, admin_role, suspended, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     RETURNING id`,
  )
    .bind(
      `yw_${email}`,
      opts.role === 'admin' ? 'Admin User' : 'Student User',
      email,
      hash,
      '10.1',
      role,
      opts.admin_role ?? null,
      opts.suspended ? 1 : 0,
    )
    .first()) as { id: number };

  const token = await createToken({ id: row.id, email, role, admin_role: opts.admin_role }, env);
  return { id: row.id, email, password, token, role, admin_role: opts.admin_role };
}

/** Seed a subject and return its id (notes need a valid subject_id). */
export async function seedSubject(name = 'Mathematics'): Promise<number> {
  const row = (await env.DB.prepare(
    `INSERT INTO subjects (name, icon, note_count) VALUES (?, ?, 0) RETURNING id`,
  )
    .bind(`${name}-${++emailSeq}`, 'book')
    .first()) as { id: number };
  return row.id;
}

/** Seed a note owned by author. status defaults to published. */
export async function seedNote(
  authorId: number,
  subjectId: number,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const row = (await env.DB.prepare(
    `INSERT INTO notes (author_id, subject_id, title, content, status, visibility, likes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`,
  )
    .bind(
      authorId,
      subjectId,
      (overrides.title as string) ?? 'Seed Note',
      (overrides.content as string) ?? 'body',
      (overrides.status as string) ?? 'published',
      (overrides.visibility as string) ?? 'everyone',
      (overrides.likes as number) ?? 0,
    )
    .first()) as { id: number };
  return row.id;
}

export interface CallOpts {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  ip?: string;
  rawBody?: string; // bypass JSON.stringify for malformed-payload tests
}

/** Fire a request at the worker. Base URL is arbitrary; only the path matters. */
export function call(path: string, opts: CallOpts = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.ip) headers['CF-Connecting-IP'] = opts.ip;
  let body: string | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
    headers['Content-Type'] ??= 'application/json';
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] ??= 'application/json';
  }
  return SELF.fetch(`https://test.local${path}`, {
    method: opts.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
  });
}

/** Mint a school-valid signup body. */
export function signupBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'New Student',
    email: uniqueEmail('signup'),
    password: 'ValidPass123',
    ...over,
  };
}
