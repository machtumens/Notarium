/**
 * Notarium Backend API
 * Handles notes management, user data, chat sessions, and authentication with Gemini AI integration
 */
// Note: Using Gemini REST API instead of SDK for Cloudflare Workers compatibility
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

interface Env {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  GEMINI_API_KEY?: string;
  JWT_SECRET: string;
  ADMIN_PASSWORD: string;
  DEEPSEEK_API_KEY?: string;
  GOOGLE_CLOUD_VISION_API_KEY?: string;
  FRONTEND_URL?: string;
  EXTRA_ORIGINS?: string; // optional comma-separated extra CORS origins
  ENVIRONMENT?: string;
  ACCESS_TTL_LEGACY?: string; // optional override of the 24h JWT for clients that do not opt in to refresh sessions (jose duration, e.g. '12h')
}

interface User {
  id: number;
  encrypted_yw_id?: string;
  display_name?: string;
  email?: string;
  photo_url?: string;
  class?: string;
  role: string;
  notes_uploaded?: number;
  total_likes?: number;
  total_admin_upvotes?: number;
  diamonds?: number;
  points?: number;
  description?: string | null;
  suspended?: number | null;
  suspension_end_date?: string | null;
  suspension_reason?: string | null;
  warning?: number | null;
  warning_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Security constants
const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB — routes that carry base64 images
const MAX_JSON_BODY_SIZE = 1 * 1024 * 1024; // 1MB — every other JSON route
const RATE_LIMIT_WINDOW = 900; // 15 minutes in seconds
const RATE_LIMIT_MAX_ATTEMPTS = 5;
// /api/auth/refresh rotates every 15 minutes per open tab, so its bucket is sized for that
// and only failed attempts spend it — a valid rotation is free (W2.3b).
const REFRESH_RATE_LIMIT_MAX_FAILURES = 60;
// A replay of a just-rotated token whose successor is live is two tabs racing, not theft:
// inside this window it is refused without retiring the family (W2.3b).
const REFRESH_ROTATION_GRACE_SECONDS = 30;
// Access-token lifetime depends on the client (W2.3a). A sign-in that opts in with
// `X-Notarium-Session: refresh` (or body `session: 'refresh'`) gets a 15-minute JWT plus a
// rotating refresh token (7 days, stored hashed in `refresh_tokens`) that mints the next one
// via POST /api/auth/refresh. Every other client — the deployed Vercel frontend has no refresh
// logic — keeps the previous 24-hour JWT and gets no refresh token.
const ACCESS_TTL_REFRESH = '15m';
const ACCESS_TTL_LEGACY = '24h'; // env.ACCESS_TTL_LEGACY overrides it (same duration format)
const REFRESH_SESSION_HEADER = 'X-Notarium-Session';
const REFRESH_SESSION_VALUE = 'refresh';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_TOKEN_BYTES = 32;

// Routes whose bodies legitimately carry base64 images keep the larger cap
// (/api/auth/profile: the old frontend posts the avatar inline — see photoUrlSchema)
const LARGE_BODY_ROUTES = [/^\/api\/notes$/, /^\/api\/notes\/\d+$/, /^\/api\/admin\/notes\/\d+$/, /^\/api\/gemini\/ocr$/, /^\/api\/auth\/profile$/];
function bodyLimitFor(path: string): number {
  return LARGE_BODY_ROUTES.some((route) => route.test(path)) ? MAX_REQUEST_SIZE : MAX_JSON_BODY_SIZE;
}

// CORS allow-list: env.FRONTEND_URL + optional env.EXTRA_ORIGINS (comma-separated) + the local Vite dev server
const ALWAYS_ALLOWED_ORIGINS = ['http://localhost:5173'];
function allowedOrigins(env: Env): string[] {
  return [env.FRONTEND_URL, ...(env.EXTRA_ORIGINS || '').split(','), ...ALWAYS_ALLOWED_ORIGINS]
    .map((origin) => (origin || '').trim())
    .filter((origin) => origin.length > 0);
}

// Echo the request Origin only when it is allow-listed; otherwise grant nothing.
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, Authorization, ${REFRESH_SESSION_HEADER}`,
    'Vary': 'Origin',
  };
  // Bearer-only API: no Access-Control-Allow-Credentials, so an allow-listed
  // origin can never send cookies or get a credentialed CORS grant.
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

// Security headers
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

// Applied to every response at the fetch boundary (including 404/500 and env-less
// jsonResponse calls): security headers + origin-checked CORS.
function withSecurityHeaders(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  for (const [name, value] of Object.entries(corsHeaders(request, env))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Helper function to create JSON responses with security headers.
// `env` is kept for call-site compatibility; CORS is decided per request in withSecurityHeaders.
function jsonResponse(data: any, status: number = 200, env?: Env) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
  };

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

// ===== SECURITY HELPER FUNCTIONS =====

// Password hashing
async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// JWT functions
async function createToken(payload: { id: number; email: string; role: string }, env: Env, expiresIn: string): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

type SessionMode = 'refresh' | 'legacy';

// Which sign-in contract the client asked for (W2.3a): the header wins, then the body flag.
// Both are exact matches — any other value is the legacy 24-hour contract.
function sessionModeFor(request: Request, body: unknown): SessionMode {
  const header = request.headers.get(REFRESH_SESSION_HEADER);
  if (header !== null && header.trim().toLowerCase() === REFRESH_SESSION_VALUE) return 'refresh';
  const flag = body !== null && typeof body === 'object' ? (body as { session?: unknown }).session : undefined;
  return flag === REFRESH_SESSION_VALUE ? 'refresh' : 'legacy';
}

// jose duration strings the override may use ('12h', '90m', '2 days'); anything else is ignored
// with a warning so a typo in the var can never break sign-in.
const ACCESS_TTL_FORMAT = /^\d+\s?(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i;
function legacyAccessTtl(env: Env): string {
  const override = env.ACCESS_TTL_LEGACY?.trim();
  if (!override) return ACCESS_TTL_LEGACY;
  if (ACCESS_TTL_FORMAT.test(override)) return override;
  console.warn('[AUTH] Ignoring ACCESS_TTL_LEGACY: not a duration like 24h');
  return ACCESS_TTL_LEGACY;
}

async function verifyToken(token: string, env: Env): Promise<{ id: number; email: string; role: string } | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as number,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch (error) {
    return null;
  }
}

// Refresh tokens: 32 random bytes, base64url on the wire. Only sha256(token) is stored,
// so a database read never yields a usable credential (F-refresh); the raw token is never logged.
function newRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFRESH_TOKEN_BYTES));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashRefreshToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Rate limiting: one KV list of attempt timestamps per endpoint bucket and client IP,
// trimmed to the sliding 15-minute window on every read.
const rateLimitKey = (endpoint: string, ip: string) => `ratelimit:${endpoint}:${ip}`;

async function recentAttempts(key: string, env: Env, now: number): Promise<number[]> {
  const attemptsData = await env.RATE_LIMIT.get(key);
  const attempts: number[] = attemptsData ? JSON.parse(attemptsData) : [];
  const windowStart = now - RATE_LIMIT_WINDOW;
  return attempts.filter((timestamp) => timestamp > windowStart);
}

// Count this attempt and allow it unless the bucket already holds `maxAttempts` in the window.
async function checkRateLimit(ip: string, endpoint: string, env: Env, maxAttempts: number = RATE_LIMIT_MAX_ATTEMPTS): Promise<boolean> {
  const key = rateLimitKey(endpoint, ip);
  const now = Math.floor(Date.now() / 1000);
  try {
    const attempts = await recentAttempts(key, env, now);
    if (attempts.length >= maxAttempts) {
      return false; // Rate limit exceeded
    }
    await env.RATE_LIMIT.put(key, JSON.stringify([...attempts, now]), { expirationTtl: RATE_LIMIT_WINDOW });
    return true; // Allow request
  } catch (error) {
    console.error('[RATE_LIMIT] Error:', error);
    return true; // Allow request if rate limiting fails
  }
}

// Read-only half of checkRateLimit: is the bucket already full? Pair with recordFailedAttempt
// for endpoints where only failures should spend the budget.
async function rateLimitReached(ip: string, endpoint: string, env: Env, maxAttempts: number): Promise<boolean> {
  try {
    const attempts = await recentAttempts(rateLimitKey(endpoint, ip), env, Math.floor(Date.now() / 1000));
    return attempts.length >= maxAttempts;
  } catch (error) {
    console.error('[RATE_LIMIT] Error:', error);
    return false; // Allow request if rate limiting fails
  }
}

async function recordFailedAttempt(ip: string, endpoint: string, env: Env): Promise<void> {
  const key = rateLimitKey(endpoint, ip);
  const now = Math.floor(Date.now() / 1000);
  try {
    const attempts = await recentAttempts(key, env, now);
    await env.RATE_LIMIT.put(key, JSON.stringify([...attempts, now]), { expirationTtl: RATE_LIMIT_WINDOW });
  } catch (error) {
    console.error('[RATE_LIMIT] Error:', error);
  }
}

// Shared-secret comparison for the admin password. Both sides are SHA-256 hashed
// first so the compared buffers always have the same length (the length of the
// real secret never leaks), then compared in constant time. An unset/empty
// ADMIN_PASSWORD never matches anything.
async function secretsMatch(provided: unknown, expected: unknown): Promise<boolean> {
  if (typeof provided !== 'string' || typeof expected !== 'string' || expected.length === 0) {
    return false;
  }
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// Both admin-password endpoints guard the same secret, so they share one
// per-IP bucket (same window and attempt count as login).
const ADMIN_RATE_LIMIT_BUCKET = 'admin';
async function adminAttemptAllowed(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return checkRateLimit(ip, ADMIN_RATE_LIMIT_BUCKET, env);
}

// Prompt injection sanitization for AI inputs
function sanitizeAIInput(input: string): string {
  if (!input) return '';

  // Remove potentially harmful prompt injection patterns
  let sanitized = input
    .replace(/system\s*:/gi, '')
    .replace(/assistant\s*:/gi, '')
    .replace(/user\s*:/gi, '')
    .replace(/<\|.*?\|>/g, '') // Remove special tokens
    .replace(/\[INST\]|\[\/INST\]/g, '') // Remove instruction markers
    .trim();

  // Limit length to prevent abuse
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized;
}

// Request size validation
function validateRequestSize(request: Request, limit: number = MAX_REQUEST_SIZE): boolean {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > limit) {
    return false;
  }
  return true;
}

// Counts a body that has no Content-Length against the cap without buffering it:
// a clone is read chunk by chunk and cancelled the moment the running total
// passes `limit`, so at most limit + one chunk is ever pulled. A stream that
// errors (client went away) reports 'aborted' instead of throwing.
type BodyVerdict = 'ok' | 'too-large' | 'aborted';
async function measureStreamedBody(request: Request, limit: number): Promise<BodyVerdict> {
  const body = request.clone().body;
  if (!body) return 'ok';
  const reader = body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return 'ok';
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel('Request too large').catch(() => undefined);
        return 'too-large';
      }
    }
  } catch (error) {
    console.error('[BODY_GATE] Request body stream failed:', error instanceof Error ? error.message : String(error));
    return 'aborted';
  } finally {
    try { reader.releaseLock(); } catch { /* already released by cancel */ }
  }
}

// Zod validation schemas
const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  class: z.string().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const NOTE_DESCRIPTION_MAX = 1000;
const noteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(100000).optional(), // photo uploads (old frontend) carry extracted_text instead
  subject_id: z.number().int().positive(),
  description: z.string().max(NOTE_DESCRIPTION_MAX).optional(),
});
const noteUpdateSchema = noteSchema.partial();

// Body of POST /api/chat/sessions/:id/messages (what both frontends send)
const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(10000),
});

// Body of POST /api/chat/sessions
const chatSessionSchema = z.object({
  subject: z.string().min(1).max(200),
  topic: z.string().min(1).max(200),
});

// Body of POST /api/chat/sessions/:id/ai-response — `message` has the same bound as a stored chat message
const aiMessageSchema = z.object({
  message: chatMessageSchema.shape.content,
  subject: z.string().max(200).nullish(),
});

// Admin moderation bodies
const suspendSchema = z.object({
  days: z.number().int().min(1).max(365).default(7),
  reason: z.string().max(500).optional(),
});
const warnSchema = z.object({
  message: z.string().max(500).optional(),
});

// Profile photo: an https URL, or — ponytail: parity with the live old frontend, whose
// ProfileEditor still posts the avatar as a base64 data URL until W4 moves photos to
// URLs — a png/jpeg/webp data URL. The inline cap is 1.9 MB, not the 2.8 MB a 2 MB file
// would need: D1 rejects any string or row over 2,000,000 bytes (SQLITE_TOOBIG), so a
// bigger avatar never stored anyway; now it is a clear 400 instead of a 500.
const MAX_INLINE_PHOTO_CHARS = 1_900_000;
const photoUrlSchema = z.union([
  z.string().max(500).url().refine((url) => url.startsWith('https://'), { message: 'photo_url must be an https URL' }),
  z.string()
    .max(MAX_INLINE_PHOTO_CHARS, `photo_url data URL must be at most ${MAX_INLINE_PHOTO_CHARS} characters (about a 1.4 MB image)`)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, 'photo_url must be a png, jpeg or webp data URL'),
]);

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(), // old-frontend alias for display_name
  display_name: z.string().min(1).max(100).optional(),
  class: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  photo_url: photoUrlSchema.optional(),
});

// Dynamic SET list for the fields a user may change about themselves (email is not one of them).
function profileUpdateFields(fields: z.infer<typeof profileUpdateSchema>): { updates: string[]; values: unknown[] } {
  const updates: string[] = [];
  const values: unknown[] = [];
  // `name` is the old frontend's alias for display_name
  const displayName = fields.display_name ?? fields.name;
  if (displayName !== undefined) {
    updates.push('display_name = ?');
    values.push(displayName);
  }
  if (fields.photo_url !== undefined) {
    updates.push('photo_url = ?');
    values.push(fields.photo_url);
  }
  if (fields.class !== undefined) {
    updates.push('class = ?');
    values.push(fields.class);
  }
  if (fields.description !== undefined) {
    updates.push('description = ?');
    values.push(fields.description || null);
  }
  return { updates, values };
}

// Initialize database tables
async function initializeDatabase(env: Env) {
  try {
    // Create users table with proper constraints
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        encrypted_yw_id TEXT UNIQUE,
        display_name TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        photo_url TEXT,
        class TEXT,
        role TEXT DEFAULT 'student',
        notes_uploaded INTEGER DEFAULT 0,
        total_likes INTEGER DEFAULT 0,
        total_admin_upvotes INTEGER DEFAULT 0,
        suspended INTEGER DEFAULT 0,
        diamonds INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Add missing columns if they don't exist (migration)
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN notes_uploaded INTEGER DEFAULT 0`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN total_likes INTEGER DEFAULT 0`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN total_admin_upvotes INTEGER DEFAULT 0`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN suspended INTEGER DEFAULT 0`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN description TEXT`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN diamonds INTEGER DEFAULT 0`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0`).run();
    } catch (e) {
      // Column already exists
    }

    // Create subjects table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        icon TEXT,
        note_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Create notes table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author_id INTEGER,
        title TEXT,
        description TEXT,
        subject_id INTEGER,
        extracted_text TEXT,
        image_path TEXT,
        summary TEXT,
        content TEXT,
        tags TEXT,
        author_class TEXT,
        status TEXT DEFAULT 'published',
        visibility TEXT DEFAULT 'everyone',
        scheduled_publish_at TEXT,
        likes INTEGER DEFAULT 0,
        admin_upvotes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
      )
    `).run();

    // Add missing columns to notes table if they don't exist (migration)
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN subject_id INTEGER`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN description TEXT`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN extracted_text TEXT`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN image_path TEXT`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN summary TEXT`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN likes INTEGER DEFAULT 0`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN admin_upvotes INTEGER DEFAULT 0`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN content TEXT`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN tags TEXT`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN author_class TEXT`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN status TEXT DEFAULT 'published'`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN scheduled_publish_at TEXT`).run();
      console.log('[DB_MIGRATION] Added scheduled_publish_at column');
    } catch (e) {
      console.log('[DB_MIGRATION] scheduled_publish_at column exists or failed to add:', e);
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN visibility TEXT DEFAULT 'everyone'`).run();
    } catch (e) {
      // Column already exists
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN parent_note_id INTEGER`).run();
      console.log('[DB_MIGRATION] Added parent_note_id column for continuation notes');
    } catch (e) {
      console.log('[DB_MIGRATION] parent_note_id column exists or failed to add:', e);
    }
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN part_number INTEGER`).run();
      console.log('[DB_MIGRATION] Added part_number column for continuation notes');
    } catch (e) {
      console.log('[DB_MIGRATION] part_number column exists or failed to add:', e);
    }

    // Data migration: Fix any notes with NULL or empty status/visibility
    try {
      await env.DB.prepare(`
        UPDATE notes
        SET status = 'published'
        WHERE status IS NULL OR status = '' OR status = 'undefined'
      `).run();

      await env.DB.prepare(`
        UPDATE notes
        SET visibility = 'everyone'
        WHERE visibility IS NULL OR visibility = '' OR visibility = 'undefined'
      `).run();

      console.log('[DB_MIGRATION] Fixed status and visibility for existing notes');
    } catch (e) {
      console.error('[DB_MIGRATION] Failed to fix notes:', e);
    }

    // Create activity log table for admin actions
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS admin_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER,
        admin_email TEXT,
        action_type TEXT,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES users(id)
      )
    `).run();

    // Create chat_sessions table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        subject TEXT,
        topic TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `).run();

    // Create chat_messages table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        role TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
      )
    `).run();

    // Create note_likes table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS note_likes (
        note_id INTEGER,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (note_id, user_id),
        FOREIGN KEY (note_id) REFERENCES notes(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `).run();

    // Create admin_note_likes table for tracking admin appreciation
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS admin_note_likes (
        note_id INTEGER,
        admin_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (note_id, admin_id),
        FOREIGN KEY (note_id) REFERENCES notes(id),
        FOREIGN KEY (admin_id) REFERENCES users(id)
      )
    `).run();

    // Refresh tokens (migration 0008 + W2.1): `token` holds sha256(token), `family` groups the
    // rotation chain of one login, `revoked_at` retires a row (rotation, logout, reuse detection).
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        family TEXT,
        revoked_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();
    // A database that already ran 0008 has the table without the two W2.1 columns. Only
    // "duplicate column name" is expected here; anything else is a real failure and surfaces
    // (the outer catch logs it) instead of leaving the table silently half-migrated (W2.3c).
    for (const column of ['family TEXT', 'revoked_at DATETIME']) {
      try {
        await env.DB.prepare(`ALTER TABLE refresh_tokens ADD COLUMN ${column}`).run();
      } catch (e) {
        if (!/duplicate column name/i.test(e instanceof Error ? e.message : String(e))) throw e;
      }
    }
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family)`).run();

    // Ensure all default subjects exist (add missing ones if deleted)
    const defaultSubjects = [
      { name: 'Filsafat', icon: '🧠' },
      { name: 'Fisika', icon: '⚛️' },
      { name: 'Matematika', icon: '📐' },
      { name: 'Bahasa Indonesia', icon: '🗣️' },
      { name: 'Bahasa Inggris', icon: '🇬🇧' },
      { name: 'Sosiologi', icon: '👥' },
      { name: 'Sejarah Indonesia', icon: '📜' },
      { name: 'Geografi', icon: '🌍' },
      { name: 'Ekonomi', icon: '💹' },
      { name: 'Sains', icon: '🔬' },
      { name: 'PKN', icon: '🏛️' },
      { name: 'PAK', icon: '⛪' },
      { name: 'Biologi', icon: '🧬' },
      { name: 'Kimia', icon: '🧪' }
    ];

    for (const subject of defaultSubjects) {
      try {
        // Try to insert if it doesn't exist
        await env.DB.prepare('INSERT INTO subjects (name, icon) VALUES (?, ?)').bind(subject.name, subject.icon).run();
      } catch (e) {
        // Subject already exists, skip
      }
    }

    // Remove any subjects that are not in the default list (cleanup old subjects)
    const validSubjectNames = defaultSubjects.map(s => s.name);
    try {
      const placeholders = validSubjectNames.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM subjects WHERE name NOT IN (${placeholders})`).bind(...validSubjectNames).run();
      console.log('Cleaned up old subjects');
    } catch (e) {
      console.log('Cleanup skipped or completed');
    }

    // Sync note counts to reflect actual data
    try {
      await syncNoteCounts(env);
      console.log('Note counts synced successfully');
    } catch (e) {
      console.log('Note count sync skipped or failed');
    }

    console.log('Database initialized successfully');
  } catch (error: any) {
    console.error('Database initialization error:', error.message);
    // Don't throw - table might already exist
  }
}

// Sync note counts in subjects table with actual note data
async function syncNoteCounts(env: Env) {
  try {
    // Get actual note counts per subject
    const { results } = await env.DB.prepare(`
      SELECT subject_id, COUNT(*) as actual_count
      FROM notes
      GROUP BY subject_id
    `).all();

    // Update each subject's note_count
    for (const row of (results || [])) {
      const subjectRow = row as any;
      await env.DB.prepare(
        'UPDATE subjects SET note_count = ? WHERE id = ?'
      ).bind(subjectRow.actual_count, subjectRow.subject_id).run();
    }

    // Reset count to 0 for subjects with no notes
    await env.DB.prepare(`
      UPDATE subjects SET note_count = 0
      WHERE id NOT IN (SELECT DISTINCT subject_id FROM notes)
    `).run();

    console.log('Note counts synced with actual data');
  } catch (error: any) {
    console.error('Error syncing note counts:', error.message);
  }
}

// Note: Gemini REST API is used directly via fetch() for Cloudflare Workers compatibility
// The @google/generative-ai SDK doesn't work in Workers runtime

// Get user's notes for context
async function getUserNotes(userId: number, subject?: string, env?: Env): Promise<any[]> {
  if (!env) return [];

  let query = 'SELECT id, title, description, subject_id, extracted_text, summary FROM notes WHERE author_id = ?';
  const params: any[] = [userId];

  if (subject) {
    query += ' AND subject_id = (SELECT id FROM subjects WHERE name = ?)';
    params.push(subject);
  }

  query += ' LIMIT 10';

  try {
    const { results } = await env.DB.prepare(query).bind(...params).all();
    return results || [];
  } catch (e) {
    console.error('Error fetching user notes:', e);
    return [];
  }
}

// Format notes for Gemini context - uses AI-cleaned extracted text as knowledge base
function formatNotesForContext(notes: any[]): string {
  if (notes.length === 0) {
    return '';
  }

  const notesSummary = notes.map((note, idx) => {
    // Prioritize extracted_text (Gemini-cleaned OCR) for accurate content
    const content = note.extracted_text || note.description || note.title;
    return `[Note ${idx + 1}] ${note.title}\n${content?.substring(0, 1200) || '(No content)'}`;
  }).join('\n\n---\n\n');

  return `\n\n📚 KNOWLEDGE BASE (User's Study Materials - PRIMARY SOURCE):\n${notesSummary}\n\n⚠️ CRITICAL INSTRUCTIONS:
- You MUST derive AT LEAST 60% of your answer directly from the Knowledge Base above
- Quote and reference specific information from the notes when available
- Only use general knowledge to supplement or clarify when the notes don't fully cover the question
- If the answer is in the notes, cite it explicitly
- Use the exact terminology and concepts from the user's study materials`;
}

// Chat with DeepSeek AI using note context - Automatically feeds AI-cleaned note content as knowledge base
async function chatWithGemini(sessionId: string, userMessage: string, subject: string, userId: number, request: Request, env: Env) {
  try {
    // Get user's notes for context - includes DeepSeek-cleaned extracted text from OCR
    const userNotes = await getUserNotes(userId, subject, env);
    const notesContext = formatNotesForContext(userNotes);

    // Get chat history (reduced from 20 to 8 for faster responses)
    const { results: messages } = await env.DB.prepare(`
      SELECT role, content FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 8
    `).bind(sessionId).all();

    const reverseMessages = (messages || []).reverse();

    // Build conversation history for DeepSeek
    const conversationHistory = reverseMessages.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    // Add system message at the beginning
    const allMessages = [
      {
        role: 'system',
        content: `You are a helpful study assistant. Respond concisely and clearly.

FORMAT:
- Use markdown: **bold**, *italic*, \`code\`
- Add emojis for engagement: ✅ ❌ 📚 💡 🎯
- Use bullet points and numbered lists
- Keep responses focused and brief

CONTENT:
- Prioritize user's study materials when available
- Reference notes with "berdasarkan catatan kamu"
- Be concise - quality over quantity
- Respond in Indonesian (Bahasa Indonesia)`
      },
      ...conversationHistory
    ];

    // Send message with knowledge base context (invisible to user but feeds the AI)
    const contextualMessage = notesContext
      ? `${userMessage}${notesContext}`
      : userMessage;

    allMessages.push({
      role: 'user',
      content: contextualMessage
    });

    const deepseekApiKey = env.DEEPSEEK_API_KEY;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: allMessages,
        max_tokens: 1024, // Reduced from 2048 for faster responses
        temperature: 0.8  // Slightly higher for faster generation
      })
    });

    const data = await response.json() as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    const aiResponse = data.choices[0].message.content.trim();

    // Save AI response to database
    await env.DB.prepare(`
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (?, ?, ?)
    `).bind(sessionId, 'assistant', aiResponse).run();

    return aiResponse;
  } catch (error: any) {
    console.error('DeepSeek chat error:', error);
    throw new Error(`Failed to get AI response: ${error.message}`);
  }
}

// OCR using Google Cloud Vision API + Gemini 2.0 for text formatting
async function performOCR(imageBase64: string, mimeType: string, env: Env) {
  try {
    const apiKey = env.GOOGLE_CLOUD_VISION_API_KEY || env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('Google Cloud Vision API key is not configured');
    }

    // Remove data URI prefix if present
    let cleanBase64 = imageBase64;
    if (imageBase64.includes(',')) {
      cleanBase64 = imageBase64.split(',')[1];
    }

    // Step 1: Extract raw text with Cloud Vision API
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: cleanBase64
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION',
            maxResults: 1
          }]
        }]
      })
    });

    const result = await response.json() as any;

    if (!response.ok) {
      const errorMessage = result.error?.message || 'Unknown Cloud Vision error';
      throw new Error(errorMessage);
    }

    let rawText = '';
    if (result.responses && result.responses[0]) {
      const textAnnotations = result.responses[0].textAnnotations;
      if (textAnnotations && textAnnotations.length > 0) {
        rawText = textAnnotations[0].description;
      } else if (result.responses[0].fullTextAnnotation) {
        rawText = result.responses[0].fullTextAnnotation.text;
      } else {
        return ''; // No text found in image
      }
    } else {
      throw new Error('Invalid response from Cloud Vision API');
    }

    // Step 2: Use DeepSeek to clean up and format the text
    try {
      const deepseekApiKey = env.DEEPSEEK_API_KEY;

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{
            role: 'user',
            content: `Clean up and properly format this OCR-extracted text. Fix any obvious OCR errors, improve formatting, add proper line breaks and structure, but keep all the content intact. Return only the cleaned text without any explanations.

Raw OCR Text:
${rawText}`
          }],
          max_tokens: 4096,
          temperature: 0.2
        })
      });

      const data = await response.json() as any;

      if (response.ok && data.choices && data.choices[0]) {
        const formattedText = data.choices[0].message.content.trim();
        return formattedText;
      } else {
        console.error('DeepSeek formatting failed, returning raw OCR text:', data);
        return rawText;
      }
    } catch (deepseekError: any) {
      console.error('DeepSeek formatting failed, returning raw OCR text:', deepseekError);
      return rawText;
    }
  } catch (error: any) {
    console.error('OCR error:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

// Generate note summary - EXACTLY 2 sentences (Uses DeepSeek)
async function generateNoteSummary(content: string, title: string, env: Env) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: `Summarize this study note in EXACTLY 2 sentences. Focus on the main concepts and key points.

Title: "${title}"

Content:
${content.substring(0, 3000)}

IMPORTANT: Your response must be EXACTLY 2 sentences, no more, no less. Write the summary in Indonesian (Bahasa Indonesia).`
        }],
        max_tokens: 150,
        temperature: 0.3
      })
    });

    const data = await response.json() as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    const summary = data.choices[0].message.content.trim();

    // Ensure it's only 2 sentences by splitting and taking first 2
    const sentences = summary.match(/[^.!?]+[.!?]+/g) || [summary];
    const twoSentences = sentences.slice(0, 2).join(' ').trim();

    return twoSentences;
  } catch (error: any) {
    console.error('DeepSeek summary error:', error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

// Generate quiz from note
async function generateQuiz(content: string, title: string, env: Env) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: `Create a quiz with 5 multiple-choice questions based on the following study note titled "${title}".

Return the response as a JSON object with this structure:
{
  "questions": [
    {
      "id": 1,
      "question": "Question text?",
      "options": ["A) option 1", "B) option 2", "C) option 3", "D) option 4"],
      "correctAnswer": "A",
      "explanation": "Why this is correct"
    }
  ]
}

IMPORTANT: Write all questions, options, and explanations in Indonesian (Bahasa Indonesia).

Content:
${content}`
        }],
        max_tokens: 2048,
        temperature: 0.5
      })
    });

    const data = await response.json() as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    const responseText = data.choices[0].message.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid quiz format');
  } catch (error: any) {
    console.error('Quiz generation error:', error);
    throw new Error(`Failed to generate quiz: ${error.message}`);
  }
}

// Generate study plan
async function generateStudyPlan(subject: string, topic: string, env: Env) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: `Create a comprehensive 7-day study plan for a student learning about "${topic}" in ${subject}.

The plan should:
- Be realistic and achievable for a high school student
- Include daily goals and activities
- Suggest resources and study techniques
- Include practice problems and self-assessment
- Prepare for exams

Format as a detailed markdown text with clear daily breakdowns. Write the entire plan in Indonesian (Bahasa Indonesia).`
        }],
        max_tokens: 2048,
        temperature: 0.4
      })
    });

    const data = await response.json() as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    return data.choices[0].message.content.trim();
  } catch (error: any) {
    console.error('Study plan generation error:', error);
    throw new Error(`Failed to generate study plan: ${error.message}`);
  }
}

// Explain concept
async function explainConcept(concept: string, subject: string, env: Env) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: `Explain the concept of "${concept}" in the context of ${subject}.

Your explanation should:
- Start with a simple definition
- Use real-world examples
- Break down complex ideas
- Include common misconceptions
- Suggest how to remember it
- Provide practice tips

Make it engaging and suitable for high school students. Write the entire explanation in Indonesian (Bahasa Indonesia).`
        }],
        max_tokens: 1500,
        temperature: 0.5
      })
    });

    const data = await response.json() as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    return data.choices[0].message.content.trim();
  } catch (error: any) {
    console.error('Concept explanation error:', error);
    throw new Error(`Failed to explain concept: ${error.message}`);
  }
}

// Thrown by identity helpers; mapped to its status by the catch blocks below.
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

// A suspension is in force while `suspended = 1` and the end date (if any) is
// still ahead. Read-only: login and /me clear expired suspensions lazily.
function isSuspended(user: { suspended?: number | null; suspension_end_date?: string | null }): boolean {
  if (Number(user.suspended ?? 0) !== 1) return false;
  if (!user.suspension_end_date) return true;
  const endsAt = new Date(user.suspension_end_date).getTime();
  return Number.isNaN(endsAt) ? true : endsAt > Date.now();
}

// Columns a caller may see about itself. Explicit on purpose (W1.13): never
// password_hash, never encrypted_yw_id (no route needs it since the header
// fallback was removed) — /api/user/me returns this row as-is.
const USER_COLUMNS = [
  'id', 'display_name', 'email', 'photo_url', 'class', 'role',
  'notes_uploaded', 'total_likes', 'total_admin_upvotes', 'COALESCE(diamonds, 0) AS diamonds',
  '(notes_uploaded + total_likes + total_admin_upvotes) AS points', 'description',
  'suspended', 'suspension_end_date', 'suspension_reason', 'warning', 'warning_message',
  'created_at', 'updated_at',
].join(', ');

// The one identity resolver every bearer route goes through (W1.12). The JWT only
// proves who signed in; existence, role and suspension are re-read from `users`
// on every request, so a deleted user's token stops working immediately, a
// demoted admin loses admin routes, and a suspended account gets 403 everywhere.
// Returns null (→ 401 at the call site) for no/invalid token or a missing row.
async function resolveBearerUser(request: Request, env: Env): Promise<User | null> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return null;
  }
  const decoded = await verifyToken(token, env);
  if (!decoded?.id) {
    return null;
  }
  const user = await findUserById(decoded.id, env);
  if (!user) {
    return null;
  }
  if (isSuspended(user)) {
    throw new HttpError(403, 'Account suspended');
  }
  return user;
}

// The row behind an id, or null when the account is gone. Shared by the bearer path and
// the refresh path so both re-check existence and suspension the same way.
async function findUserById(userId: number, env: Env): Promise<User | null> {
  return env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(userId).first<User>();
}

// Caller identity for admin/ownership decisions — role comes from the DB row, never the claim.
async function getUserFromToken(request: Request, env: Env): Promise<{ id: number; email: string; role: string } | null> {
  const user = await resolveBearerUser(request, env);
  if (!user) {
    return null;
  }
  return { id: user.id, email: user.email ?? '', role: user.role };
}

// Caller row from a signature-verified bearer JWT, or null. Never creates users.
async function getOptionalUser(request: Request, env: Env): Promise<User | null> {
  return resolveBearerUser(request, env);
}

// Bearer JWT or 401. The X-Encrypted-Yw-ID header fallback is gone (F4/F10): it was a
// client-asserted id with no proof of possession and it auto-created accounts.
// (Name kept so the ~12 call sites stay untouched; it no longer creates anything.)
async function getOrCreateUser(request: Request, env: Env): Promise<User> {
  const user = await getOptionalUser(request, env);
  if (!user) {
    throw new HttpError(401, 'Unauthorized - Invalid or missing token');
  }
  return user;
}

// Update user info — only the provided fields change (was: every column overwritten,
// email included, with NULL for anything omitted). Email is not writable here.
async function updateUserInfo(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  const body = await request.json().catch(() => null);

  const validation = profileUpdateSchema.safeParse(body);
  if (!validation.success) {
    return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
  }

  const { updates, values } = profileUpdateFields(validation.data);
  if (updates.length === 0) {
    return jsonResponse({ success: true, updated: false });
  }

  await env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`
  ).bind(...values, user.id).run();

  return jsonResponse({ success: true, updated: true });
}

// Get current user info
async function getCurrentUser(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  return jsonResponse({ user });
}

// Update user class
async function updateUserClass(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  const body = await request.json() as any;

  await env.DB.prepare(
    'UPDATE users SET class = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(body.class ?? null, user.id).run();

  return jsonResponse({ success: true });
}

// Get all subjects
async function getSubjects(request: Request, env: Env) {
  // Public catalogue: anonymous callers only see 'everyone' counts
  const user = await getOptionalUser(request, env);

  // Get subjects with accurate note counts (respecting visibility settings)
  const { results } = await env.DB.prepare(`
    SELECT
      s.*,
      (SELECT COUNT(*)
       FROM notes n
       JOIN users u ON n.author_id = u.id
       WHERE n.subject_id = s.id
       AND (n.status = 'published' OR n.status IS NULL)
       AND (
         n.visibility = 'everyone'
         OR n.visibility IS NULL
         OR (n.visibility = 'class' AND u.class = ?)
       )
      ) as note_count
    FROM subjects s
    ORDER BY s.name
  `).bind(user?.class ?? null).all();

  return jsonResponse({ subjects: results });
}

// Get notes by subject
async function getNotesBySubject(subjectId: string, request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);

  console.log(`[GET_NOTES] User ${user.id} (class: ${user.class}) requesting notes for subject ${subjectId}`);

  // Show published notes based on visibility setting
  // - Show if visibility is 'everyone' or NULL (old notes)
  // - Show if visibility is 'class' and viewer's class matches author's class
  // - Also show notes where class info is missing (NULL) to avoid hiding old notes
  const { results } = await env.DB.prepare(`
    SELECT
      n.*,
      u.display_name as author_name,
      u.photo_url as author_photo,
      u.class as author_class,
      (SELECT COUNT(*) FROM note_likes WHERE note_id = n.id AND user_id = ?) as liked_by_me,
      (SELECT COUNT(*) FROM admin_note_likes WHERE note_id = n.id AND admin_id = ?) as upvoted_by_me
    FROM notes n
    LEFT JOIN users u ON n.author_id = u.id
    WHERE n.subject_id = ?
      AND (n.status = 'published' OR n.status IS NULL OR n.status = '')
      AND (
        n.visibility = 'everyone'
        OR n.visibility IS NULL
        OR n.visibility = ''
        OR (n.visibility = 'class' AND (u.class = ? OR u.class IS NULL OR u.class = ''))
      )
    ORDER BY n.created_at DESC
  `).bind(user.id, user.id, subjectId, user.class || '').all();

  console.log(`[GET_NOTES] Found ${results.length} notes for subject ${subjectId}`);

  // Log each note's status and visibility for debugging
  results.forEach((note: any) => {
    console.log(`[NOTE_DEBUG] ID: ${note.id}, Title: ${note.title}, Status: ${note.status}, Visibility: ${note.visibility}, Author Class: ${note.author_class}`);
  });

  return jsonResponse({ notes: results });
}

// Search notes
async function searchNotes(query: string, request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);

  if (!query || query.trim().length === 0) {
    return jsonResponse({ notes: [] });
  }

  // Smart search: Split query into words for better matching
  const searchWords = query.toLowerCase().trim().split(/\s+/).filter((w: string) => w.length > 0);

  // Build LIKE conditions for each word
  const buildLikeConditions = (field: string) => {
    return searchWords.map(() => `LOWER(${field}) LIKE ?`).join(' OR ');
  };

  // Create parameters for binding (each word with wildcards)
  const wordParams = searchWords.map((word: string) => `%${word}%`);

  // Smart search with relevance scoring
  const { results } = await env.DB.prepare(`
    SELECT
      n.*,
      u.display_name as author_name,
      u.photo_url as author_photo,
      u.class as author_class,
      s.name as subject_name,
      (
        /* Title match - highest priority (10 points per word) */
        CASE WHEN ${buildLikeConditions('n.title')} THEN ${searchWords.length * 10} ELSE 0 END +
        /* Author name match - high priority (8 points per word) */
        CASE WHEN ${buildLikeConditions('u.display_name')} THEN ${searchWords.length * 8} ELSE 0 END +
        /* Tags match - medium-high priority (6 points per word) */
        CASE WHEN ${buildLikeConditions('n.tags')} THEN ${searchWords.length * 6} ELSE 0 END +
        /* Subject match - medium priority (5 points per word) */
        CASE WHEN ${buildLikeConditions('s.name')} THEN ${searchWords.length * 5} ELSE 0 END +
        /* Description match - medium priority (4 points per word) */
        CASE WHEN ${buildLikeConditions('n.description')} THEN ${searchWords.length * 4} ELSE 0 END +
        /* Content match - lower priority (2 points per word) */
        CASE WHEN ${buildLikeConditions('n.extracted_text')} THEN ${searchWords.length * 2} ELSE 0 END
      ) as relevance_score
    FROM notes n
    JOIN users u ON n.author_id = u.id
    JOIN subjects s ON n.subject_id = s.id
    WHERE (
        ${buildLikeConditions('n.title')}
        OR ${buildLikeConditions('n.description')}
        OR ${buildLikeConditions('n.extracted_text')}
        OR ${buildLikeConditions('u.display_name')}
        OR ${buildLikeConditions('n.tags')}
        OR ${buildLikeConditions('s.name')}
      )
      AND (n.status = 'published' OR n.status IS NULL)
      AND (
        n.visibility = 'everyone'
        OR n.visibility IS NULL
        OR (n.visibility = 'class' AND u.class = ?)
      )
    ORDER BY relevance_score DESC, n.created_at DESC
    LIMIT 50
  `).bind(
    ...wordParams, // title params (score)
    ...wordParams, // author_name params (score)
    ...wordParams, // tags params (score)
    ...wordParams, // subject params (score)
    ...wordParams, // description params (score)
    ...wordParams, // extracted_text params (score)
    ...wordParams, // WHERE title params
    ...wordParams, // WHERE description params
    ...wordParams, // WHERE extracted_text params
    ...wordParams, // WHERE author_name params
    ...wordParams, // WHERE tags params
    ...wordParams, // WHERE subject params
    user.class     // visibility check
  ).all();

  console.log('[SEARCH] Query:', query, 'Words:', searchWords, 'Results:', results.length);

  return jsonResponse({ notes: results });
}

// Create new note (with multi-photo support and auto-continuation)
async function createNote(request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);
    const raw = await request.json() as any;
    // The old frontend fills `description` with the AI quick summary, which the user cannot
    // shorten — cap it instead of rejecting the upload. Edits (PUT) still reject > max.
    const body = (raw && typeof raw.description === 'string' && raw.description.length > NOTE_DESCRIPTION_MAX)
      ? { ...raw, description: raw.description.slice(0, NOTE_DESCRIPTION_MAX) }
      : raw;

    console.log('[CREATE NOTE] User:', user.id, 'Subject:', body?.subject_id);

    const validation = noteSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
    }

    // Verify subject exists
    const subject = await env.DB.prepare('SELECT id FROM subjects WHERE id = ?').bind(body.subject_id).first();
    if (!subject) {
      console.error('[CREATE NOTE] Invalid subject_id:', body.subject_id);
      return jsonResponse({ error: 'Invalid subject ID' }, 400);
    }

    // Handle images - convert to array format
    let images: string[] = [];
    if (body.images && Array.isArray(body.images)) {
      images = body.images;
    } else if (body.image_path) {
      // For backward compatibility, check if image_path is already a JSON array
      try {
        const parsed = JSON.parse(body.image_path);
        images = Array.isArray(parsed) ? parsed : [body.image_path];
      } catch {
        images = [body.image_path];
      }
    }

    console.log('[CREATE NOTE] Total images:', images.length);

    // Convert tags array to JSON string for storage
    const tagsJson = body.tags && Array.isArray(body.tags) ? JSON.stringify(body.tags) : '[]';

    // Get user's class for the note
    const userData = await env.DB.prepare('SELECT class FROM users WHERE id = ?').bind(user.id).first() as any;
    const userClass = userData?.class || null;

    // Determine note status (draft or published)
    const noteStatus = (body.status === 'draft') ? 'draft' : 'published';
    const scheduledPublishAt = body.scheduled_publish_at || null;
    const visibility = body.visibility && body.visibility !== '' ? body.visibility : 'everyone';

    // Split images into chunks of max 3 per note
    const MAX_IMAGES_PER_NOTE = 3;
    const imageChunks: string[][] = [];
    for (let i = 0; i < images.length; i += MAX_IMAGES_PER_NOTE) {
      imageChunks.push(images.slice(i, i + MAX_IMAGES_PER_NOTE));
    }
    // A text-only note (no images — what V2.0 sends) is still one note
    if (imageChunks.length === 0) {
      imageChunks.push([]);
    }

    console.log('[CREATE NOTE] Image chunks:', imageChunks.length);

    const createdNotes: any[] = [];
    let parentNoteId: number | null = null;

    // Create notes for each chunk
    for (let chunkIndex = 0; chunkIndex < imageChunks.length; chunkIndex++) {
      const chunk = imageChunks[chunkIndex];
      const partNumber = chunkIndex + 1;
      const isFirstPart = chunkIndex === 0;

      // Determine title for this part
      const noteTitle = isFirstPart ? body.title : `${body.title} (${partNumber})`;

      // Determine extracted text for this part
      let extractedText = '';
      if (isFirstPart) {
        extractedText = body.extracted_text || '';
      } else {
        extractedText = `Continued from previous note...\n\n${body.extracted_text || ''}`;
      }

      // Store images as JSON array
      const imagePathJson = JSON.stringify(chunk);

      // Check size for this chunk
      const chunkData = {
        title: noteTitle,
        description: body.description,
        extracted_text: extractedText,
        image_path: imagePathJson,
        tags: tagsJson
      };
      const chunkSize = JSON.stringify(chunkData).length;
      const MAX_SIZE = 900000; // 900KB to leave buffer

      if (chunkSize > MAX_SIZE) {
        console.error('[CREATE NOTE] Chunk too large:', chunkSize, 'bytes');
        return jsonResponse({
          error: 'Note data is too large. Please use smaller images.',
          size: chunkSize,
          maxSize: MAX_SIZE
        }, 413);
      }

      // Create note with continuation fields
      const note: any = await env.DB.prepare(`
        INSERT INTO notes (
          title, description, subject_id, author_id, author_class,
          extracted_text, image_path, content, tags, summary,
          status, scheduled_publish_at, visibility,
          parent_note_id, part_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(
        noteTitle,
        body.description || 'No description',
        body.subject_id,
        user.id,
        userClass,
        extractedText,
        imagePathJson,
        body.content || body.description || '',
        tagsJson,
        body.quick_summary || body.description || '',
        noteStatus,
        scheduledPublishAt,
        visibility,
        parentNoteId, // null for first note, previous note ID for continuations
        partNumber
      ).first();

      if (!note) {
        console.error('[CREATE NOTE] Failed to create note in database');
        return jsonResponse({ error: 'Failed to create note' }, 500);
      }

      console.log('[CREATE NOTE] Note created:', (note as any).id, 'Part:', partNumber, 'Images:', chunk.length);

      // Set parent ID for next iteration
      if (isFirstPart) {
        parentNoteId = (note as any).id;
      }

      createdNotes.push(note);

      // Update user stats and subject count (only for published notes)
      if (noteStatus === 'published') {
        try {
          await env.DB.batch([
            env.DB.prepare('UPDATE users SET notes_uploaded = notes_uploaded + 1 WHERE id = ?').bind(user.id),
            env.DB.prepare('UPDATE subjects SET note_count = note_count + 1 WHERE id = ?').bind(body.subject_id)
          ]);
        } catch (updateError) {
          console.error('[CREATE NOTE] Failed to update stats:', updateError);
        }
      }
    }

    console.log('[CREATE NOTE] All notes created successfully. Total:', createdNotes.length);

    return jsonResponse({
      note: createdNotes[0], // Return first note as primary
      notes: createdNotes,    // Return all created notes
      success: true,
      totalParts: createdNotes.length
    });
  } catch (error: any) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
    console.error('[CREATE NOTE] Error:', error);
    return jsonResponse({ error: error.message || 'Failed to create note' }, 500);
  }
}

// Ownership gate for note summary routes (gaps 1, 2): 401 no/invalid token,
// 404 unknown note, 403 unless the caller is the author or an admin.
async function requireNoteOwnerOrAdmin(noteId: string, request: Request, env: Env): Promise<{ user: User } | Response> {
  const user = await getOptionalUser(request, env);
  if (!user) {
    return jsonResponse({ error: 'Unauthorized - Invalid or missing token' }, 401, env);
  }
  const note = await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?').bind(noteId).first() as any;
  if (!note) {
    return jsonResponse({ error: 'Note not found' }, 404, env);
  }
  if (note.author_id !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - You can only edit your own notes' }, 403, env);
  }
  return { user };
}

// Update note summary
async function updateNoteSummary(noteId: string, request: Request, env: Env) {
  const gate = await requireNoteOwnerOrAdmin(noteId, request, env);
  if (gate instanceof Response) return gate;

  const body = await request.json() as any;

  await env.DB.prepare(
    'UPDATE notes SET summary = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(body.summary, noteId).run();

  return jsonResponse({ success: true });
}

// Toggle note like
async function toggleNoteLike(noteId: string, request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);

  // Check if already liked
  const { results } = await env.DB.prepare(
    'SELECT * FROM note_likes WHERE note_id = ? AND user_id = ?'
  ).bind(noteId, user.id).all();

  if (results.length > 0) {
    // Unlike
    const note = await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?').bind(noteId).first() as any;

    await env.DB.batch([
      env.DB.prepare('DELETE FROM note_likes WHERE note_id = ? AND user_id = ?').bind(noteId, user.id),
      env.DB.prepare('UPDATE notes SET likes = likes - 1 WHERE id = ?').bind(noteId),
      // Decrement author's total_likes (diamonds only from notes now)
      ...(note && note.author_id ? [
        env.DB.prepare('UPDATE users SET total_likes = total_likes - 1 WHERE id = ?').bind(note.author_id)
      ] : [])
    ]);
    return jsonResponse({ liked: false });
  } else {
    // Like
    const note = await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?').bind(noteId).first() as any;

    await env.DB.batch([
      env.DB.prepare('INSERT INTO note_likes (note_id, user_id) VALUES (?, ?)').bind(noteId, user.id),
      env.DB.prepare('UPDATE notes SET likes = likes + 1 WHERE id = ?').bind(noteId),
      // Increment author's total_likes (diamonds only from notes now)
      ...(note && note.author_id ? [
        env.DB.prepare('UPDATE users SET total_likes = total_likes + 1 WHERE id = ?').bind(note.author_id)
      ] : [])
    ]);
    return jsonResponse({ liked: true });
  }
}



// Get leaderboard (public: scoreboard fields only — no email, no encrypted_yw_id,
// no inline photo_url; photos come later via URL, see PRODUCTION_PLAN D4) (F4)
async function getLeaderboard(env: Env) {
  const { results } = await env.DB.prepare(`
    SELECT
      display_name,
      class,
      notes_uploaded,
      total_likes,
      total_admin_upvotes,
      (notes_uploaded + total_likes + total_admin_upvotes) as points
    FROM users
    WHERE role != 'admin'
    ORDER BY (notes_uploaded + total_likes + total_admin_upvotes) DESC, notes_uploaded DESC, total_likes DESC
  `).all();

  return jsonResponse({ leaderboard: results });
}

// Helper function to log admin activity
async function logAdminActivity(
  env: Env,
  adminId: number,
  adminEmail: string,
  actionType: string,
  targetType: string,
  targetId: number,
  details: string
) {
  try {
    await env.DB.prepare(`
      INSERT INTO admin_activity_log (admin_id, admin_email, action_type, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(adminId, adminEmail, actionType, targetType, targetId, details).run();
  } catch (error) {
    console.error('Failed to log admin activity:', error);
    // Don't throw - logging failure shouldn't break the main operation
  }
}

// Get admin activity logs
async function getAdminActivityLogs(request: Request, env: Env) {
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { results } = await env.DB.prepare(`
    SELECT * FROM admin_activity_log
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

  return jsonResponse({ logs: results });
}

// Get comprehensive usage statistics
async function getUsageStatistics(request: Request, env: Env) {
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  try {
    // Get total users count
    const totalUsers = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first() as any;

    // Get active users (last 7 days)
    const activeUsers7d = await env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT author_id as user_id FROM notes WHERE created_at >= datetime('now', '-7 days')
        UNION
        SELECT user_id FROM chat_sessions WHERE created_at >= datetime('now', '-7 days')
        UNION
        SELECT user_id FROM note_likes WHERE created_at >= datetime('now', '-7 days')
      )
    `).first() as any;

    // Get active users (last 30 days)
    const activeUsers30d = await env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT author_id as user_id FROM notes WHERE created_at >= datetime('now', '-30 days')
        UNION
        SELECT user_id FROM chat_sessions WHERE created_at >= datetime('now', '-30 days')
        UNION
        SELECT user_id FROM note_likes WHERE created_at >= datetime('now', '-30 days')
      )
    `).first() as any;

    // Get total notes
    const totalNotes = await env.DB.prepare('SELECT COUNT(*) as count FROM notes').first() as any;

    // Get notes created in last 7 days
    const notes7d = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM notes WHERE created_at >= datetime('now', '-7 days')
    `).first() as any;

    // Get notes created in last 30 days
    const notes30d = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM notes WHERE created_at >= datetime('now', '-30 days')
    `).first() as any;

    // Get total likes
    const totalLikes = await env.DB.prepare('SELECT COUNT(*) as count FROM note_likes').first() as any;

    // Get total admin upvotes
    const totalAdminUpvotes = await env.DB.prepare('SELECT COUNT(*) as count FROM admin_note_likes').first() as any;

    // Get total chat sessions
    const totalChatSessions = await env.DB.prepare('SELECT COUNT(*) as count FROM chat_sessions').first() as any;

    // Get chat sessions in last 7 days
    const chatSessions7d = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_sessions WHERE created_at >= datetime('now', '-7 days')
    `).first() as any;

    // Get chat sessions in last 30 days
    const chatSessions30d = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_sessions WHERE created_at >= datetime('now', '-30 days')
    `).first() as any;

    // Get top contributors (users with most notes)
    const { results: topContributors } = await env.DB.prepare(`
      SELECT
        u.id,
        u.display_name,
        u.email,
        u.class,
        u.notes_uploaded,
        u.total_likes,
        u.total_admin_upvotes
      FROM users u
      WHERE u.role = 'student'
      ORDER BY u.notes_uploaded DESC
      LIMIT 10
    `).all();

    // Get user distribution by class
    const { results: usersByClass } = await env.DB.prepare(`
      SELECT
        class,
        COUNT(*) as count
      FROM users
      WHERE role = 'student' AND class IS NOT NULL
      GROUP BY class
      ORDER BY class
    `).all();

    // Get notes distribution by class
    const { results: notesByClass } = await env.DB.prepare(`
      SELECT
        author_class as class,
        COUNT(*) as count
      FROM notes
      WHERE author_class IS NOT NULL
      GROUP BY author_class
      ORDER BY author_class
    `).all();

    // Get popular subjects
    const { results: popularSubjects } = await env.DB.prepare(`
      SELECT
        s.id,
        s.name,
        s.icon,
        COUNT(n.id) as note_count,
        SUM(n.likes) as total_likes
      FROM subjects s
      LEFT JOIN notes n ON n.subject_id = s.id
      GROUP BY s.id, s.name, s.icon
      ORDER BY note_count DESC
      LIMIT 10
    `).all();

    // Get daily activity for last 14 days
    const { results: dailyActivity } = await env.DB.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM notes
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();

    // Get daily user registrations for last 14 days
    const { results: dailyRegistrations } = await env.DB.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();

    // Get suspended users count
    const suspendedUsers = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM users WHERE suspended = 1
    `).first() as any;

    // Get warned users count
    const warnedUsers = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM users WHERE warning = 1
    `).first() as any;

    return jsonResponse({
      overview: {
        totalUsers: totalUsers?.count || 0,
        activeUsers7d: activeUsers7d?.count || 0,
        activeUsers30d: activeUsers30d?.count || 0,
        totalNotes: totalNotes?.count || 0,
        notes7d: notes7d?.count || 0,
        notes30d: notes30d?.count || 0,
        totalLikes: totalLikes?.count || 0,
        totalAdminUpvotes: totalAdminUpvotes?.count || 0,
        totalChatSessions: totalChatSessions?.count || 0,
        chatSessions7d: chatSessions7d?.count || 0,
        chatSessions30d: chatSessions30d?.count || 0,
        suspendedUsers: suspendedUsers?.count || 0,
        warnedUsers: warnedUsers?.count || 0
      },
      topContributors: topContributors || [],
      usersByClass: usersByClass || [],
      notesByClass: notesByClass || [],
      popularSubjects: popularSubjects || [],
      dailyActivity: dailyActivity || [],
      dailyRegistrations: dailyRegistrations || []
    });
  } catch (error: any) {
    console.error('Error fetching usage statistics:', error);
    return jsonResponse({ error: 'Failed to fetch usage statistics' }, 500);
  }
}

// Admin verification (rate limited per IP; constant-time secret compare)
async function verifyAdmin(request: Request, env: Env) {
  if (!(await adminAttemptAllowed(request, env))) {
    return jsonResponse({ success: false, isAdmin: false, error: 'Too many attempts. Please try again in 15 minutes.' }, 429, env);
  }

  const body = await request.json() as any;
  const { email, password } = body;

  const isAdminEmail = typeof email === 'string' && email.endsWith('@notarium.site');
  if (isAdminEmail && await secretsMatch(password, env.ADMIN_PASSWORD)) {
    return jsonResponse({ success: true, isAdmin: true }, 200, env);
  }

  return jsonResponse({ success: false, isAdmin: false, error: 'Invalid credentials' }, 401, env);
}

// Admin upvote note (gives higher weight)
async function adminUpvoteNote(noteId: string, request: Request, env: Env) {
  // Real admin check from the JWT (was: a client-supplied body.isAdmin flag, gap 9)
  const adminUser = await getUserFromToken(request, env);
  if (!adminUser) {
    return jsonResponse({ error: 'Unauthorized - Invalid or missing token' }, 401, env);
  }
  if (adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403, env);
  }

  // Update note admin upvotes
  await env.DB.prepare(
    'UPDATE notes SET admin_upvotes = admin_upvotes + 1, updated_at = datetime("now") WHERE id = ?'
  ).bind(noteId).run();

  // Get note author and update their total admin upvotes
  const note = await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?').bind(noteId).first();
  if (note) {
    await env.DB.prepare(
      'UPDATE users SET total_admin_upvotes = total_admin_upvotes + 1 WHERE id = ?'
    ).bind(note.author_id).run();
  }

  return jsonResponse({ success: true });
}

// Admin like note (new endpoint using Bearer token auth)
async function adminLikeNote(noteId: string, request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  // Check if admin already liked this note
  const { results } = await env.DB.prepare(
    'SELECT * FROM admin_note_likes WHERE note_id = ? AND admin_id = ?'
  ).bind(noteId, adminUser.id).all();

  if (results.length > 0) {
    // Unlike
    const note = await env.DB.prepare('SELECT author_id, title FROM notes WHERE id = ?').bind(noteId).first() as any;

    await env.DB.batch([
      env.DB.prepare('DELETE FROM admin_note_likes WHERE note_id = ? AND admin_id = ?').bind(noteId, adminUser.id),
      env.DB.prepare('UPDATE notes SET admin_upvotes = admin_upvotes - 1 WHERE id = ?').bind(noteId),
      // Update user's total admin upvotes (diamonds only from notes now)
      ...(note && note.author_id ? [
        env.DB.prepare('UPDATE users SET total_admin_upvotes = total_admin_upvotes - 1 WHERE id = ?').bind(note.author_id)
      ] : [])
    ]);

    // Log activity
    await logAdminActivity(env, adminUser.id, adminUser.email, 'unlike', 'note', parseInt(noteId), `Removed admin like from note: ${note?.title || noteId}`);

    return jsonResponse({ liked: false });
  } else {
    // Like
    const note = await env.DB.prepare('SELECT author_id, title FROM notes WHERE id = ?').bind(noteId).first() as any;

    await env.DB.batch([
      env.DB.prepare('INSERT INTO admin_note_likes (note_id, admin_id) VALUES (?, ?)').bind(noteId, adminUser.id),
      env.DB.prepare('UPDATE notes SET admin_upvotes = admin_upvotes + 1 WHERE id = ?').bind(noteId),
      // Update user's total admin upvotes (diamonds only from notes now)
      ...(note && note.author_id ? [
        env.DB.prepare('UPDATE users SET total_admin_upvotes = total_admin_upvotes + 1 WHERE id = ?').bind(note.author_id)
      ] : [])
    ]);

    // Log activity
    await logAdminActivity(env, adminUser.id, adminUser.email, 'like', 'note', parseInt(noteId), `Admin liked note: ${note?.title || noteId} (+4.5 points to author)`);

    return jsonResponse({ liked: true });
  }
}

// Admin delete note
async function deleteNote(noteId: string, request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  try {
    // Get note details before deletion
    const note = await env.DB.prepare('SELECT id, author_id, subject_id, title FROM notes WHERE id = ?').bind(noteId).first() as any;

    if (!note) {
      return jsonResponse({ error: 'Note not found' }, 404);
    }

    // Delete related data
    await env.DB.batch([
      // Delete note likes
      env.DB.prepare('DELETE FROM note_likes WHERE note_id = ?').bind(noteId),
      // Delete admin note likes
      env.DB.prepare('DELETE FROM admin_note_likes WHERE note_id = ?').bind(noteId),
      // Delete the note itself
      env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(noteId),
      // Update note count in subjects table (ensure it doesn't go below 0)
      env.DB.prepare('UPDATE subjects SET note_count = MAX(0, note_count - 1) WHERE id = ?').bind(note.subject_id),
      // Update notes_uploaded count for the author (ensure it doesn't go below 0)
      env.DB.prepare('UPDATE users SET notes_uploaded = MAX(0, notes_uploaded - 1) WHERE id = ?').bind(note.author_id)
    ]);

    // Log activity
    await logAdminActivity(env, adminUser.id, adminUser.email, 'delete', 'note', parseInt(noteId), `Deleted note: ${note.title || noteId}`);

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error('Error deleting note:', error);
    return jsonResponse({ error: 'Failed to delete note' }, 500);
  }
}

// User update own note
async function userUpdateNote(noteId: string, request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);
    const body = await request.json() as any;

    // Verify ownership
    const note = await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?').bind(noteId).first() as any;

    if (!note) {
      return jsonResponse({ error: 'Note not found' }, 404);
    }

    if (note.author_id !== user.id) {
      return jsonResponse({ error: 'Unauthorized - You can only edit your own notes' }, 403);
    }

    const validation = noteUpdateSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
    }

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: any[] = [];

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.content !== undefined) {
      updates.push('content = ?');
      values.push(body.content);
    }
    if (body.extracted_text !== undefined) {
      updates.push('extracted_text = ?');
      values.push(body.extracted_text);
    }
    if (body.image_path !== undefined) {
      updates.push('image_path = ?');
      values.push(body.image_path);
    }
    if (body.summary !== undefined) {
      updates.push('summary = ?');
      values.push(body.summary);
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(body.tags));
    }

    if (updates.length === 0) {
      return jsonResponse({ error: 'No fields to update' }, 400);
    }

    // Always update updated_at
    updates.push('updated_at = datetime("now")');
    values.push(noteId);

    const query = `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query).bind(...values).run();

    // Get updated note
    const updatedNote = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first();

    return jsonResponse({ success: true, note: updatedNote });
  } catch (error: any) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
    console.error('Error updating note:', error);
    return jsonResponse({ error: 'Failed to update note' }, 500);
  }
}

// Get user's own notes
async function getMyNotes(request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);

    // Check if filtering by status
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status'); // 'draft', 'published', or null for all

    let query = `
      SELECT
        n.id,
        n.title,
        n.subject_id as subject,
        s.name as subject_name,
        n.content,
        n.description,
        u.display_name as author_name,
        n.extracted_text,
        n.summary,
        n.tags,
        n.likes,
        n.admin_upvotes,
        n.created_at,
        n.image_path,
        n.status,
        n.scheduled_publish_at,
        n.subject_id,
        n.visibility
      FROM notes n
      LEFT JOIN subjects s ON n.subject_id = s.id
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.author_id = ?
    `;

    const bindings = [user.id];

    if (statusFilter === 'draft') {
      query += ` AND n.status = 'draft'`;
    } else if (statusFilter === 'published') {
      query += ` AND (n.status = 'published' OR n.status IS NULL)`;
    }

    query += ` ORDER BY s.name, n.created_at DESC`;

    const { results: notes } = await env.DB.prepare(query).bind(...bindings).all();

    return jsonResponse({ notes });
  } catch (error: any) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
    console.error('Error getting user notes:', error);
    return jsonResponse({ error: 'Failed to get notes' }, 500);
  }
}

// Publish a draft note
async function publishDraftNote(noteId: string, request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);

    // Get the note and verify ownership
    const note = await env.DB.prepare('SELECT author_id, subject_id, status FROM notes WHERE id = ?').bind(noteId).first() as any;

    if (!note) {
      return jsonResponse({ error: 'Note not found' }, 404);
    }

    if (note.author_id !== user.id) {
      return jsonResponse({ error: 'Unauthorized - You can only publish your own notes' }, 403);
    }

    if (note.status !== 'draft') {
      return jsonResponse({ error: 'Note is already published' }, 400);
    }

    // Update note status to published
    await env.DB.prepare(`
      UPDATE notes
      SET status = 'published', scheduled_publish_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).bind(noteId).run();

    // Update user stats and subject count (since it's being published now)
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET notes_uploaded = notes_uploaded + 1 WHERE id = ?').bind(user.id),
      env.DB.prepare('UPDATE subjects SET note_count = note_count + 1 WHERE id = ?').bind(note.subject_id)
    ]);

    // Get updated note
    const updatedNote = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first();

    return jsonResponse({ success: true, note: updatedNote });
  } catch (error: any) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
    console.error('Error publishing note:', error);
    return jsonResponse({ error: 'Failed to publish note' }, 500);
  }
}

// User delete own note (with point deduction)
async function userDeleteNote(noteId: string, request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);

    // Verify ownership
    const note = await env.DB.prepare('SELECT author_id, subject_id, likes, admin_upvotes FROM notes WHERE id = ?').bind(noteId).first() as any;

    if (!note) {
      return jsonResponse({ error: 'Note not found' }, 404);
    }

    if (note.author_id !== user.id) {
      return jsonResponse({ error: 'Unauthorized - You can only delete your own notes' }, 403);
    }

    // Calculate points to deduct: user likes (1 each) + admin upvotes (5 each)
    const pointsToDeduct = (note.likes || 0) + ((note.admin_upvotes || 0) * 5);

    // Delete related data and update stats
    await env.DB.batch([
      // Delete note likes
      env.DB.prepare('DELETE FROM note_likes WHERE note_id = ?').bind(noteId),
      // Delete admin note likes
      env.DB.prepare('DELETE FROM admin_note_likes WHERE note_id = ?').bind(noteId),
      // Delete the note itself
      env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(noteId),
      // Update note count in subjects table (ensure it doesn't go below 0)
      env.DB.prepare('UPDATE subjects SET note_count = MAX(0, note_count - 1) WHERE id = ?').bind(note.subject_id),
      // Update user stats: decrease notes_uploaded, total_likes, and total_admin_upvotes (ensure they don't go below 0)
      env.DB.prepare(`
        UPDATE users
        SET
          notes_uploaded = MAX(0, notes_uploaded - 1),
          total_likes = MAX(0, total_likes - ?),
          total_admin_upvotes = MAX(0, total_admin_upvotes - ?)
        WHERE id = ?
      `).bind(note.likes || 0, note.admin_upvotes || 0, user.id)
    ]);

    return jsonResponse({ success: true, points_deducted: pointsToDeduct });
  } catch (error: any) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
    console.error('Error deleting note:', error);
    return jsonResponse({ error: 'Failed to delete note' }, 500);
  }
}

// Admin update note
async function updateNote(noteId: string, request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  try {
    const body = await request.json() as any;

    const validation = noteUpdateSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
    }

    // Get note title before update for logging
    const originalNote = await env.DB.prepare('SELECT title FROM notes WHERE id = ?').bind(noteId).first() as any;

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: any[] = [];
    const changedFields: string[] = [];

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
      changedFields.push('title');
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
      changedFields.push('description');
    }
    if (body.content !== undefined) {
      updates.push('content = ?');
      values.push(body.content);
      changedFields.push('content');
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(body.tags));
      changedFields.push('tags');
    }
    if (body.extracted_text !== undefined) {
      updates.push('extracted_text = ?');
      values.push(body.extracted_text);
      changedFields.push('extracted_text');
    }
    if (body.summary !== undefined) {
      updates.push('summary = ?');
      values.push(body.summary);
      changedFields.push('summary');
    }
    if (body.image_path !== undefined) {
      updates.push('image_path = ?');
      values.push(body.image_path);
      changedFields.push('image_path');
    }

    if (updates.length === 0) {
      return jsonResponse({ error: 'No fields to update' }, 400);
    }

    updates.push('updated_at = datetime("now")');
    values.push(noteId);

    const query = `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query).bind(...values).run();

    // Fetch and return updated note
    const updatedNote = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first();

    // Log activity
    await logAdminActivity(
      env,
      adminUser.id,
      adminUser.email,
      'edit',
      'note',
      parseInt(noteId),
      `Edited note: ${originalNote?.title || noteId} (changed: ${changedFields.join(', ')})`
    );

    return jsonResponse({ success: true, note: updatedNote });
  } catch (error: any) {
    console.error('Error updating note:', error);
    return jsonResponse({ error: 'Failed to update note' }, 500);
  }
}

// Suspend user
async function suspendUser(userId: string, request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  const validation = suspendSchema.safeParse(await request.json().catch(() => null));
  if (!validation.success) {
    return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
  }
  const { days, reason } = validation.data;

  // Calculate suspension end date (days: int 1–365, default 7)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  const endDateISO = endDate.toISOString();

  await env.DB.prepare(
    'UPDATE users SET suspended = 1, suspension_end_date = ?, suspension_reason = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(endDateISO, reason || 'Suspended by admin', userId).run();

  return jsonResponse({ success: true, suspension_end_date: endDateISO, reason });
}

// Warn user
async function warnUser(userId: string, request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  const validation = warnSchema.safeParse(await request.json().catch(() => null));
  if (!validation.success) {
    return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
  }
  const { message } = validation.data;

  await env.DB.prepare(
    'UPDATE users SET warning = 1, warning_message = ?, warning_first_viewed = NULL, warning_view_count = 0, updated_at = datetime("now") WHERE id = ?'
  ).bind(message || 'Warning issued by admin', userId).run();

  return jsonResponse({ success: true, message });
}

// Remove user (soft delete - keep data but mark as removed)
async function removeUser(userId: string, request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  try {
    console.log(`[DELETE USER] Starting deletion of user ${userId}`);

    // Delete user and all related data in the correct order to avoid foreign key constraints

    // 1. Delete all likes given BY this user (on other people's notes)
    const likesResult = await env.DB.prepare('DELETE FROM note_likes WHERE user_id = ?').bind(userId).run();
    console.log(`[DELETE USER] Deleted ${likesResult.meta.changes} note_likes`);

    // 2. Delete all admin upvotes given BY this user
    const adminUpvotesResult = await env.DB.prepare('DELETE FROM admin_note_likes WHERE admin_id = ?').bind(userId).run();
    console.log(`[DELETE USER] Deleted ${adminUpvotesResult.meta.changes} admin_note_likes`);

    // 3. Delete admin activity log entries for this user
    const activityResult = await env.DB.prepare('DELETE FROM admin_activity_log WHERE admin_id = ?').bind(userId).run();
    console.log(`[DELETE USER] Deleted ${activityResult.meta.changes} admin_activity_log entries`);

    // 4. Delete all notes authored BY this user
    // This will CASCADE delete:
    //   - note_likes on these notes (via ON DELETE CASCADE on note_id)
    //   - admin_note_likes on these notes (via ON DELETE CASCADE on note_id)
    const notesResult = await env.DB.prepare('DELETE FROM notes WHERE author_id = ?').bind(userId).run();
    console.log(`[DELETE USER] Deleted ${notesResult.meta.changes} notes`);

    // 5. The following are auto-deleted via ON DELETE CASCADE:
    //    - chat_sessions (user_id references users with CASCADE)
    //    - chat_messages (session_id references chat_sessions with CASCADE)

    // 6. Finally, delete the user
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

    console.log(`[DELETE USER] Successfully deleted user ${userId} and all related data`);
    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error('[DELETE USER] Error:', error);
    return jsonResponse({
      error: 'Failed to delete user: ' + error.message,
      details: error.toString()
    }, 500);
  }
}

// Unsuspend user (admin only)
async function unsuspendUser(userId: string, request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  // Clear suspension
  await env.DB.prepare(
    'UPDATE users SET suspended = 0, suspension_end_date = NULL, suspension_reason = NULL, updated_at = datetime("now") WHERE id = ?'
  ).bind(userId).run();

  return jsonResponse({ success: true });
}

// Get all users (admin only)
async function getAllUsers(request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT
        id,
        display_name,
        email,
        class,
        role,
        notes_uploaded,
        total_likes,
        total_admin_upvotes,
        COALESCE(diamonds, 0) as diamonds,
        (notes_uploaded + total_likes + total_admin_upvotes) as points,
        suspended,
        suspension_end_date,
        suspension_reason,
        warning,
        warning_message,
        photo_url,
        description,
        created_at
      FROM users
      ORDER BY created_at DESC
    `).all();

    return jsonResponse({ users: results });
  } catch (error: any) {
    // If users table doesn't exist or query fails, return empty list
    console.error('Failed to fetch users:', error);
    return jsonResponse({ users: [] });
  }
}

// Get all notes (admin only)
async function getAllNotes(request: Request, env: Env) {
  // Verify admin using Bearer token
  const adminUser = await getUserFromToken(request, env);

  if (!adminUser || adminUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin access required' }, 403);
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT
        n.id,
        n.title,
        n.description,
        n.content,
        n.extracted_text,
        n.summary,
        n.tags,
        n.image_path,
        n.likes,
        n.admin_upvotes,
        n.subject_id,
        n.author_id,
        n.status,
        n.visibility,
        n.created_at,
        u.display_name as author_name,
        u.class as author_class,
        s.name as subject_name,
        s.name as subject,
        (SELECT COUNT(*) FROM admin_note_likes WHERE note_id = n.id AND admin_id = ?) as admin_liked
      FROM notes n
      LEFT JOIN users u ON n.author_id = u.id
      LEFT JOIN subjects s ON n.subject_id = s.id
      ORDER BY n.created_at DESC
    `).bind(adminUser.id).all();

    console.log(`[ADMIN_GET_NOTES] Found ${results.length} total notes`);
    results.forEach((note: any) => {
      console.log(`[ADMIN_NOTE_DEBUG] ID: ${note.id}, Title: ${note.title}, Status: '${note.status}', Visibility: '${note.visibility}', Author Class: '${note.author_class}'`);
    });

    return jsonResponse({ notes: results });
  } catch (error: any) {
    // If notes table doesn't exist or is empty, return empty list
    console.error('Failed to fetch notes:', error);
    return jsonResponse({ notes: [] });
  }
}

// Create chat session
async function createChatSession(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);

  const validation = chatSessionSchema.safeParse(await request.json().catch(() => null));
  if (!validation.success) {
    return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
  }
  const { subject, topic } = validation.data;

  const session = await env.DB.prepare(`
    INSERT INTO chat_sessions (user_id, subject, topic)
    VALUES (?, ?, ?)
    RETURNING *
  `).bind(user.id, subject, topic).first();

  return jsonResponse({ session });
}

// Get chat sessions
async function getChatSessions(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);

  const { results } = await env.DB.prepare(`
    SELECT * FROM chat_sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 20
  `).bind(user.id).all();

  return jsonResponse({ sessions: results });
}

// Ownership gate shared by the chat session routes (F3):
// 401 no/invalid token, 404 unknown session, 403 not the session owner.
async function requireOwnedChatSession(
  sessionId: string,
  request: Request,
  env: Env
): Promise<{ user: { id: number; email: string; role: string } } | Response> {
  const user = await getUserFromToken(request, env);
  if (!user) {
    return jsonResponse({ error: 'Unauthorized - Invalid or missing token' }, 401, env);
  }
  const session = await env.DB.prepare('SELECT user_id FROM chat_sessions WHERE id = ?').bind(sessionId).first() as any;
  if (!session) {
    return jsonResponse({ error: 'Chat session not found' }, 404, env);
  }
  if (session.user_id !== user.id) {
    return jsonResponse({ error: 'Unauthorized - Not your chat session' }, 403, env);
  }
  return { user };
}

// Get chat messages
async function getChatMessages(sessionId: string, request: Request, env: Env) {
  const gate = await requireOwnedChatSession(sessionId, request, env);
  if (gate instanceof Response) return gate;

  const { results } = await env.DB.prepare(`
    SELECT * FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).bind(sessionId).all();

  return jsonResponse({ messages: results });
}

// Add chat message
async function addChatMessage(sessionId: string, request: Request, env: Env) {
  const gate = await requireOwnedChatSession(sessionId, request, env);
  if (gate instanceof Response) return gate;

  const validation = chatMessageSchema.safeParse(await request.json());
  if (!validation.success) {
    return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
  }
  const { role, content } = validation.data;

  const message = await env.DB.prepare(`
    INSERT INTO chat_messages (session_id, role, content)
    VALUES (?, ?, ?)
    RETURNING *
  `).bind(sessionId, role, content).first();

  // Update session timestamp
  await env.DB.prepare(
    'UPDATE chat_sessions SET updated_at = datetime("now") WHERE id = ?'
  ).bind(sessionId).run();

  return jsonResponse({ message });
}

// Get AI response using Gemini
async function getAIResponse(sessionId: string, request: Request, env: Env) {
  try {
    const gate = await requireOwnedChatSession(sessionId, request, env);
    if (gate instanceof Response) return gate;
    const { user } = gate;
    const validation = aiMessageSchema.safeParse(await request.json().catch(() => null));
    if (!validation.success) {
      return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
    }
    const { message, subject } = validation.data;

    // Save user message
    await env.DB.prepare(`
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (?, ?, ?)
    `).bind(sessionId, 'user', message).run();

    // Get chat session to get subject
    const session = await env.DB.prepare(
      'SELECT subject, topic FROM chat_sessions WHERE id = ?'
    ).bind(sessionId).first();

    const chatSubject = subject || (session as any)?.subject || 'General';

    // Get AI response
    const aiResponse = await chatWithGemini(sessionId, message, chatSubject, user.id, request, env);

    return jsonResponse({ response: aiResponse });
  } catch (error: any) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
    console.error('AI Response error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// OCR endpoint
async function performOCREndpoint(request: Request, env: Env) {
  try {
    const body = await request.json() as any;
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return jsonResponse({ error: 'Image base64 is required' }, 400);
    }

    const text = await performOCR(imageBase64, mimeType || 'image/jpeg', env);

    return jsonResponse({ text, success: true });
  } catch (error: any) {
    console.error('OCR endpoint error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// Generate note summary endpoint
async function generateNoteSummaryEndpoint(noteId: string, request: Request, env: Env) {
  try {
    const gate = await requireNoteOwnerOrAdmin(noteId, request, env);
    if (gate instanceof Response) return gate;

    const body = await request.json() as any;
    const { content, title } = body;

    if (!content) {
      return jsonResponse({ error: 'Content is required' }, 400);
    }

    const summary = await generateNoteSummary(content, title || 'Untitled', env);

    // Update note with summary
    await env.DB.prepare(
      'UPDATE notes SET summary = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(summary, noteId).run();

    return jsonResponse({ summary });
  } catch (error: any) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
    console.error('Summary generation endpoint error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// Generate quiz endpoint
async function generateQuizEndpoint(noteId: string, request: Request, env: Env) {
  try {
    const body = await request.json() as any;
    const { content, title } = body;

    if (!content) {
      return jsonResponse({ error: 'Content is required' }, 400);
    }

    const quiz = await generateQuiz(content, title || 'Untitled', env);

    return jsonResponse({ quiz });
  } catch (error: any) {
    console.error('Quiz generation endpoint error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// Generate study plan endpoint
async function generateStudyPlanEndpoint(request: Request, env: Env) {
  try {
    const body = await request.json() as any;
    const { subject, topic } = body;

    if (!subject || !topic) {
      return jsonResponse({ error: 'Subject and topic are required' }, 400);
    }

    const plan = await generateStudyPlan(subject, topic, env);

    return jsonResponse({ plan });
  } catch (error: any) {
    console.error('Study plan generation endpoint error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// Explain concept endpoint
async function explainConceptEndpoint(request: Request, env: Env) {
  try {
    const body = await request.json() as any;
    const { concept, subject } = body;

    if (!concept) {
      return jsonResponse({ error: 'Concept is required' }, 400);
    }

    const explanation = await explainConcept(concept, subject || 'General', env);

    return jsonResponse({ explanation });
  } catch (error: any) {
    console.error('Concept explanation endpoint error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// ============ AUTH ENDPOINTS ============

// Sign up endpoint
async function signupEndpoint(request: Request, env: Env) {
  try {
    // Check request size
    if (!validateRequestSize(request)) {
      return jsonResponse({ error: 'Request too large' }, 413, env);
    }

    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const canProceed = await checkRateLimit(ip, 'signup', env);
    if (!canProceed) {
      return jsonResponse({ error: 'Too many signup attempts. Please try again in 15 minutes.' }, 429, env);
    }

    const body = await request.json() as any;

    // Input validation with zod
    const validation = signupSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse({
        error: 'Invalid input',
        details: validation.error.errors
      }, 400, env);
    }

    const { name, email, password, class: userClass } = validation.data;

    // Check if user already exists
    const existing = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();

    if (existing) {
      return jsonResponse({ error: 'Email already registered' }, 409, env);
    }

    // Hash password with bcrypt
    const hashedPassword = await hashPassword(password);

    // Create new user
    const user = await env.DB.prepare(`
      INSERT INTO users (display_name, email, password_hash, class, role, notes_uploaded, total_likes, total_admin_upvotes, diamonds, created_at)
      VALUES (?, ?, ?, ?, 'student', 0, 0, 0, 0, datetime('now'))
      RETURNING id, email, display_name, class, role, notes_uploaded, total_likes, total_admin_upvotes, diamonds, description, photo_url
    `).bind(name, email, hashedPassword, userClass || null).first();

    if (!user) {
      return jsonResponse({ error: 'Failed to create user' }, 500, env);
    }

    // Access JWT, plus a refresh token when the client opted in (W2.1 / W2.3a)
    const { token, refreshToken } = await issueSession({
      id: (user as any).id,
      email: (user as any).email,
      role: (user as any).role
    }, env, sessionModeFor(request, body));

    // Calculate points (1 point per note upload, 1 point per like, 1 point per admin like)
    const points = ((user as any).notes_uploaded || 0) + ((user as any).total_likes || 0) + ((user as any).total_admin_upvotes || 0);

    return jsonResponse({
      token,
      ...(refreshToken ? { refreshToken } : {}),
      user: {
        id: (user as any).id,
        email: (user as any).email,
        name: (user as any).display_name,
        class: (user as any).class,
        role: (user as any).role,
        notes_count: (user as any).notes_uploaded || 0,
        total_likes: (user as any).total_likes || 0,
        total_admin_upvotes: (user as any).total_admin_upvotes || 0,
        diamonds: (user as any).diamonds || 0,
        points: points,
        description: (user as any).description || null,
        photo_url: (user as any).photo_url || null
      }
    }, 201, env);
  } catch (error: any) {
    console.error('Signup error:', error);
    if (error.message && error.message.includes('UNIQUE')) {
      return jsonResponse({ error: 'Email already registered' }, 409, env);
    }
    return jsonResponse({ error: error.message || 'Signup failed' }, 500, env);
  }
}

// Login endpoint
async function loginEndpoint(request: Request, env: Env) {
  try {
    console.log('[LOGIN] Request received');

    // Check request size
    if (!validateRequestSize(request)) {
      return jsonResponse({ error: 'Request too large' }, 413, env);
    }

    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const canProceed = await checkRateLimit(ip, 'login', env);
    if (!canProceed) {
      return jsonResponse({ error: 'Too many login attempts. Please try again in 15 minutes.' }, 429, env);
    }

    // Parse request body
    let body;
    try {
      body = await request.json() as any;
      console.log('[LOGIN] Body parsed:', { hasEmail: !!body?.email, hasPassword: !!body?.password });
    } catch (parseError) {
      console.error('[LOGIN] Body parse error:', parseError);
      return jsonResponse({ error: 'Invalid request body format' }, 400, env);
    }

    // Input validation with zod
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse({
        error: 'Invalid input',
        details: validation.error.errors
      }, 400, env);
    }

    const { email, password } = validation.data;

    // Query user from database
    let user;
    try {
      // Try to query with all columns first
      user = await env.DB.prepare(`
        SELECT
          id,
          email,
          display_name,
          password_hash,
          class,
          role,
          notes_uploaded,
          total_likes,
          total_admin_upvotes,
          COALESCE(diamonds, 0) as diamonds,
          description,
          photo_url,
          suspended,
          suspension_end_date,
          suspension_reason
        FROM users WHERE email = ?
      `).bind(email).first();
      console.log('[LOGIN] User query result:', { found: !!user, userId: (user as any)?.id });
    } catch (dbError: any) {
      console.error('[LOGIN] Database query error (attempt 1):', { message: dbError?.message });

      // Fallback: try without diamonds column
      try {
        user = await env.DB.prepare(`
          SELECT
            id,
            email,
            display_name,
            password_hash,
            class,
            role,
            notes_uploaded,
            total_likes,
            total_admin_upvotes,
            description,
            photo_url,
            suspended,
            suspension_end_date,
            suspension_reason
          FROM users WHERE email = ?
        `).bind(email).first();

        // Add diamonds with default value
        if (user) {
          (user as any).diamonds = 0;
        }
        console.log('[LOGIN] User query result (fallback):', { found: !!user, userId: (user as any)?.id });
      } catch (fallbackError: any) {
        console.error('[LOGIN] Database query error (attempt 2):', { message: fallbackError?.message });
        return jsonResponse({ error: `Database error: ${fallbackError?.message || 'could not query user'}` }, 500);
      }
    }

    if (!user) {
      console.log('[LOGIN] User not found');
      return jsonResponse({ error: 'Invalid email or password' }, 401);
    }

    // Verify password with bcrypt
    const isPasswordValid = await verifyPassword(password, (user as any).password_hash);
    if (!isPasswordValid) {
      console.log('[LOGIN] Password mismatch for user:', (user as any).id);
      return jsonResponse({ error: 'Invalid email or password' }, 401, env);
    }

    // Check if user is suspended
    if ((user as any).suspended === 1) {
      const now = new Date();
      const suspensionEndDate = (user as any).suspension_end_date ? new Date((user as any).suspension_end_date) : null;

      // If suspension has expired, clear it
      if (suspensionEndDate && now > suspensionEndDate) {
        console.log('[LOGIN] Suspension expired, clearing for user:', (user as any).id);
        await env.DB.prepare(
          'UPDATE users SET suspended = 0, suspension_end_date = NULL, suspension_reason = NULL, updated_at = datetime("now") WHERE id = ?'
        ).bind((user as any).id).run();
        (user as any).suspended = 0;
        (user as any).suspension_end_date = null;
        (user as any).suspension_reason = null;
      } else {
        // Suspension is still active
        console.log('[LOGIN] User is suspended:', (user as any).id);
        const daysRemaining = suspensionEndDate
          ? Math.ceil((suspensionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return jsonResponse({
          error: 'Account suspended',
          suspended: true,
          suspension_end_date: (user as any).suspension_end_date,
          suspension_reason: (user as any).suspension_reason || 'Suspended by admin',
          days_remaining: daysRemaining
        }, 403);
      }
    }

    console.log('[LOGIN] Creating token for user:', (user as any).id);

    // Access JWT, plus a refresh token when the client opted in (W2.1 / W2.3a)
    const { token, refreshToken } = await issueSession({
      id: (user as any).id,
      email: (user as any).email,
      role: (user as any).role || 'student'
    }, env, sessionModeFor(request, body));

    // Calculate points (1 point per note upload, 1 point per like, 1 point per admin like)
    const points = ((user as any).notes_uploaded || 0) + ((user as any).total_likes || 0) + ((user as any).total_admin_upvotes || 0);

    console.log('[LOGIN] Login successful for user:', (user as any).id);

    return jsonResponse({
      success: true,
      token,
      ...(refreshToken ? { refreshToken } : {}),
      user: {
        id: (user as any).id,
        email: (user as any).email,
        name: (user as any).display_name,
        class: (user as any).class,
        role: (user as any).role,
        notes_count: (user as any).notes_uploaded || 0,
        total_likes: (user as any).total_likes || 0,
        total_admin_upvotes: (user as any).total_admin_upvotes || 0,
        diamonds: (user as any).diamonds || 0,
        points: points,
        description: (user as any).description || null,
        photo_url: (user as any).photo_url || null
      }
    }, 200, env);
  } catch (error: any) {
    console.error('[LOGIN] Unexpected error:', error, { message: error?.message, stack: error?.stack });
    return jsonResponse({ error: `Login failed: ${error?.message || 'Unknown error'}` }, 500, env);
  }
}

// Get current user endpoint
async function meEndpoint(request: Request, env: Env) {
  try {
    const auth = request.headers.get('Authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) {
      console.error('[ME] No token provided');
      return jsonResponse({ error: 'Unauthorized - No token provided' }, 401, env);
    }

    // Validate and decode JWT token (never log the header or token, F16)
    const decoded = await verifyToken(token, env);
    if (!decoded || !decoded.id) {
      console.error('[ME] Invalid or expired token');
      return jsonResponse({ error: 'Invalid or expired token' }, 401, env);
    }

    console.log('[ME] Token verified for user:', decoded.id);
    const userId = decoded.id;

    try {
      let userData;
      try {
        userData = await env.DB.prepare(`
          SELECT
            id,
            email,
            display_name,
            photo_url,
            class,
            role,
            notes_uploaded,
            total_likes,
            total_admin_upvotes,
            COALESCE(diamonds, 0) as diamonds,
            description,
            suspended,
            suspension_end_date,
            suspension_reason,
            warning,
            warning_message,
            warning_first_viewed,
            warning_view_count,
            (notes_uploaded + total_likes + total_admin_upvotes) as points
          FROM users WHERE id = ?
        `).bind(userId).first() as any;
      } catch (e) {
        // Fallback without diamonds column
        userData = await env.DB.prepare(`
          SELECT
            id,
            email,
            display_name,
            photo_url,
            class,
            role,
            notes_uploaded,
            total_likes,
            total_admin_upvotes,
            description,
            suspended,
            suspension_end_date,
            suspension_reason,
            warning,
            warning_message,
            warning_first_viewed,
            warning_view_count,
            (notes_uploaded + total_likes + total_admin_upvotes) as points
          FROM users WHERE id = ?
        `).bind(userId).first() as any;
        if (userData) {
          userData.diamonds = 0;
        }
      }

      if (!userData) {
        return jsonResponse({ error: 'User not found' }, 404);
      }

      // Check if user is suspended and if suspension has expired
      if (userData.suspended === 1) {
        const now = new Date();
        const suspensionEndDate = userData.suspension_end_date ? new Date(userData.suspension_end_date) : null;

        // If suspension has expired, clear it
        if (suspensionEndDate && now > suspensionEndDate) {
          console.log('[ME] Suspension expired, clearing for user:', userId);
          await env.DB.prepare(
            'UPDATE users SET suspended = 0, suspension_end_date = NULL, suspension_reason = NULL, updated_at = datetime("now") WHERE id = ?'
          ).bind(userId).run();
          userData.suspended = 0;
          userData.suspension_end_date = null;
          userData.suspension_reason = null;
        }
      }

      // Handle warning tracking and auto-dismissal
      if (userData.warning === 1 && userData.warning_message) {
        const now = new Date();
        let shouldClearWarning = false;

        // Set first viewed timestamp if not set
        if (!userData.warning_first_viewed) {
          await env.DB.prepare(`
            UPDATE users
            SET warning_first_viewed = ?, warning_view_count = 1, updated_at = datetime("now")
            WHERE id = ?
          `).bind(now.toISOString(), userId).run();
          userData.warning_view_count = 1;
          userData.warning_first_viewed = now.toISOString();
        } else {
          // Check if 24 hours have passed
          const firstViewed = new Date(userData.warning_first_viewed);
          const hoursPassed = (now.getTime() - firstViewed.getTime()) / (1000 * 60 * 60);

          if (hoursPassed >= 24) {
            shouldClearWarning = true;
          } else {
            // Increment view count
            const newViewCount = (userData.warning_view_count || 0) + 1;

            if (newViewCount >= 5) {
              shouldClearWarning = true;
            } else {
              // Update view count
              await env.DB.prepare(`
                UPDATE users
                SET warning_view_count = ?, updated_at = datetime("now")
                WHERE id = ?
              `).bind(newViewCount, userId).run();
              userData.warning_view_count = newViewCount;
            }
          }
        }

        // Clear warning if conditions are met
        if (shouldClearWarning) {
          await env.DB.prepare(`
            UPDATE users
            SET warning = 0, warning_message = NULL, warning_first_viewed = NULL, warning_view_count = 0, updated_at = datetime("now")
            WHERE id = ?
          `).bind(userId).run();
          userData.warning = 0;
          userData.warning_message = null;
          userData.warning_first_viewed = null;
          userData.warning_view_count = 0;
        }
      }

      // Map database fields to frontend interface
      const user = {
        id: userData.id,
        email: userData.email,
        name: userData.display_name,
        class: userData.class,
        role: userData.role,
        notes_count: userData.notes_uploaded || 0,
        total_likes: userData.total_likes || 0,
        total_admin_upvotes: userData.total_admin_upvotes || 0,
        diamonds: userData.diamonds || 0,
        points: userData.points || 0,
        photo_url: userData.photo_url || null,
        description: userData.description || null,
        suspended: userData.suspended || 0,
        suspension_end_date: userData.suspension_end_date || null,
        suspension_reason: userData.suspension_reason || null,
        warning: userData.warning || 0,
        warning_message: userData.warning_message || null
      };

      return jsonResponse({ user });
    } catch (dbError: any) {
      console.error('Database query error:', dbError);
      return jsonResponse({ error: 'Failed to get user data' }, 500);
    }
  } catch (error: any) {
    console.error('Me endpoint error:', error);
    return jsonResponse({ error: error.message || 'Failed to get current user' }, 500);
  }
}

// ============ SESSION (REFRESH TOKEN) ENDPOINTS ============

interface RefreshTokenRow {
  id: number;
  user_id: number;
  family: string | null;
  expires_at: string;
  revoked_at: string | null;
}

// Computed in SQL (`revoked_at` is written with datetime('now'), so compare it there too).
interface PresentedRefreshTokenRow extends RefreshTokenRow {
  recently_revoked: number;
}

// A row of the family that can still rotate right now.
async function liveSuccessorExists(family: string, env: Env): Promise<boolean> {
  const row = await env.DB.prepare('SELECT id FROM refresh_tokens WHERE family = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1')
    .bind(family, new Date().toISOString())
    .first<{ id: number }>();
  return row !== null;
}

// One login = one family. Rotation inserts the successor into the same family so a
// replayed (already rotated) token can retire every descendant at once.
async function issueRefreshToken(userId: number, env: Env, family: string = crypto.randomUUID()): Promise<string> {
  const token = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at, family) VALUES (?, ?, ?, ?)')
    .bind(userId, await hashRefreshToken(token), expiresAt, family)
    .run();
  return token;
}

// Sign-in is the moment to drop the user's refresh rows that can never rotate again (W2.3c).
// `expires_at` is written by issueRefreshToken as an ISO 'T' timestamp, so it is compared in
// that format. Best-effort: a failed sweep is logged and never blocks the sign-in.
async function sweepExpiredRefreshTokens(userId: number, env: Env): Promise<void> {
  try {
    await env.DB.prepare('DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at < ?')
      .bind(userId, new Date().toISOString())
      .run();
  } catch (error) {
    console.error('[AUTH] Expired refresh-token sweep failed for user:', userId, error instanceof Error ? error.message : String(error));
  }
}

// What a sign-in hands out. 'refresh' (the client opted in): a 15-minute access JWT plus a
// fresh refresh family. 'legacy': the 24-hour JWT alone — no refresh row, no refreshToken.
// Either way the user's expired refresh rows are swept first.
async function issueSession(user: { id: number; email: string; role: string }, env: Env, mode: SessionMode): Promise<{ token: string; refreshToken?: string }> {
  await sweepExpiredRefreshTokens(user.id, env);
  if (mode === 'legacy') {
    return { token: await createToken(user, env, legacyAccessTtl(env)) };
  }
  const [token, refreshToken] = await Promise.all([createToken(user, env, ACCESS_TTL_REFRESH), issueRefreshToken(user.id, env)]);
  return { token, refreshToken };
}

async function revokeRefreshFamily(family: string | null, rowId: number, env: Env): Promise<void> {
  if (family) {
    await env.DB.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE family = ? AND revoked_at IS NULL").bind(family).run();
  } else {
    await env.DB.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").bind(rowId).run();
  }
}

const refreshSchema = z.object({ refreshToken: z.string().min(1).max(512) });

// POST /api/auth/refresh {refreshToken} → {token, refreshToken}. Every failure is 401 with
// the same message so nothing about the token's state leaks. A replayed token is treated as
// theft and kills its whole family (reuse detection) — unless it was rotated within the last
// REFRESH_ROTATION_GRACE_SECONDS and its successor is live, which is two clients racing.
// Only failures spend the per-IP budget (REFRESH_RATE_LIMIT_MAX_FAILURES per window).
async function refreshEndpoint(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await rateLimitReached(ip, 'refresh', env, REFRESH_RATE_LIMIT_MAX_FAILURES)) {
    return jsonResponse({ error: 'Too many refresh attempts. Please try again in 15 minutes.' }, 429, env);
  }
  const failed = async (response: Response) => {
    await recordFailedAttempt(ip, 'refresh', env);
    return response;
  };

  const body = await request.json().catch(() => null);
  const validation = refreshSchema.safeParse(body);
  if (!validation.success) {
    return failed(jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env));
  }

  const denied = () => failed(jsonResponse({ error: 'Invalid or expired refresh token' }, 401, env));
  const row = await env.DB.prepare(`
    SELECT id, user_id, family, expires_at, revoked_at,
      (revoked_at IS NOT NULL AND revoked_at >= datetime('now', ?)) AS recently_revoked
    FROM refresh_tokens WHERE token = ?
  `)
    .bind(`-${REFRESH_ROTATION_GRACE_SECONDS} seconds`, await hashRefreshToken(validation.data.refreshToken))
    .first<PresentedRefreshTokenRow>();
  if (!row) {
    return denied();
  }
  if (row.revoked_at) {
    if (row.recently_revoked === 1 && row.family && (await liveSuccessorExists(row.family, env))) {
      console.info('[REFRESH] Replay of a just-rotated refresh token for user:', row.user_id, '(concurrent rotation, family kept)');
      return denied();
    }
    console.warn('[REFRESH] Reuse of a retired refresh token for user:', row.user_id);
    await revokeRefreshFamily(row.family, row.id, env);
    return denied();
  }
  const expiresAt = new Date(row.expires_at).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    return denied();
  }

  // Same existence + suspension re-check as every bearer route (W1.12), by id.
  const user = await findUserById(row.user_id, env);
  if (!user || isSuspended(user)) {
    return denied();
  }

  // Retire this row atomically. Losing this update means another request rotated the same
  // token a moment ago (it was live when we read it): a race, so the winner's family stays.
  const retired = await env.DB.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL")
    .bind(row.id)
    .run();
  if ((retired.meta?.changes ?? 0) !== 1) {
    console.info('[REFRESH] Lost a concurrent rotation of a refresh token for user:', row.user_id, '(family kept)');
    return denied();
  }

  const [token, refreshToken] = await Promise.all([
    createToken({ id: user.id, email: user.email ?? '', role: user.role || 'student' }, env, ACCESS_TTL_REFRESH),
    issueRefreshToken(user.id, env, row.family ?? crypto.randomUUID()),
  ]);
  console.log('[REFRESH] Rotated session for user:', user.id);
  return jsonResponse({ token, refreshToken }, 200, env);
}

const logoutSchema = z.object({ refreshToken: z.string().min(1).max(512).optional() });

// POST /api/auth/logout (bearer) {refreshToken?} → {success}. Revokes the presented token's
// family when it belongs to the caller, or every refresh token of the caller when the body
// is empty or `{}`. A body that is present but malformed is 400 — it must never fall through
// to "revoke everything" (W2.3b). The access JWT stays valid until it expires (stateless).
async function logoutEndpoint(request: Request, env: Env) {
  const caller = await resolveBearerUser(request, env);
  if (!caller) {
    return jsonResponse({ error: 'Unauthorized - Invalid or missing token' }, 401, env);
  }
  const raw = await request.text().catch(() => '');
  let body: unknown = {};
  if (raw.trim().length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: 'Invalid input', details: 'Body is not JSON' }, 400, env);
    }
  }
  const validation = logoutSchema.safeParse(body);
  if (!validation.success) {
    return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
  }
  const presented = validation.data.refreshToken;

  if (presented) {
    const row = await env.DB.prepare('SELECT id, user_id, family, expires_at, revoked_at FROM refresh_tokens WHERE token = ? AND user_id = ?')
      .bind(await hashRefreshToken(presented), caller.id)
      .first<RefreshTokenRow>();
    if (row) {
      await revokeRefreshFamily(row.family, row.id, env);
    }
  } else {
    await env.DB.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").bind(caller.id).run();
  }
  console.log('[LOGOUT] Revoked refresh tokens for user:', caller.id, presented ? '(one family)' : '(all)');
  return jsonResponse({ success: true }, 200, env);
}

// Main request handler
let dbInitialized = false;

// Mock data for development/demo
const MOCK_SUBJECTS = [
  { id: 1, name: 'Filsafat', icon: '🧠', note_count: 0 },
  { id: 2, name: 'Fisika', icon: '⚛️', note_count: 0 },
  { id: 3, name: 'Matematika', icon: '📐', note_count: 0 },
  { id: 4, name: 'Bahasa Indonesia', icon: '🗣️', note_count: 0 },
  { id: 5, name: 'Bahasa Inggris', icon: '🇬🇧', note_count: 0 },
  { id: 6, name: 'Sosiologi', icon: '👥', note_count: 0 },
  { id: 7, name: 'Sejarah Indonesia', icon: '📜', note_count: 0 },
  { id: 8, name: 'Geografi', icon: '🌍', note_count: 0 },
  { id: 9, name: 'Ekonomi', icon: '💹', note_count: 0 },
  { id: 10, name: 'Sains', icon: '🔬', note_count: 0 },
  { id: 11, name: 'PKN', icon: '🏛️', note_count: 0 },
  { id: 12, name: 'PAK', icon: '⛪', note_count: 0 },
  { id: 13, name: 'Biologi', icon: '🧬', note_count: 0 },
  { id: 14, name: 'Kimia', icon: '🧪', note_count: 0 },
];

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight FIRST - before any other logic
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders(request, env), 'Access-Control-Max-Age': '86400' },
      });
    }

    // Initialize database on first request if available
    if (env.DB && !dbInitialized) {
      try {
        await initializeDatabase(env);
        dbInitialized = true;
      } catch (error) {
        console.log('Database initialization skipped, using mock data');
      }
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // One body-size gate for every route (the signup limiter, reused). Bodies without a
    // Content-Length (chunked) are stream-counted so the cap cannot be skipped and the
    // Worker never holds more than the cap in memory.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const limit = bodyLimitFor(path);
      if (!validateRequestSize(request, limit)) {
        return jsonResponse({ error: 'Request too large' }, 413, env);
      }
      if (!request.headers.has('content-length') && request.body) {
        const verdict = await measureStreamedBody(request, limit);
        if (verdict === 'too-large') {
          return jsonResponse({ error: 'Request too large' }, 413, env);
        }
        if (verdict === 'aborted') {
          return jsonResponse({ error: 'Request body could not be read' }, 400, env);
        }
      }
    }

    console.log(`[DEBUG] Request: ${request.method} ${path}`);
    console.log(`[DEBUG] env.DB available: ${!!env.DB}`);

    // Test endpoint to verify worker is responding
    if (path === '/test') {
      return jsonResponse({ message: 'Worker is running', timestamp: new Date().toISOString() });
    }

    try {
      // Auth routes
      if (path === '/api/auth/signup' && request.method === 'POST') {
        console.log('[DEBUG] Matched signup route');
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        return await signupEndpoint(request, env);
      }

      if (path === '/api/auth/login' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        return await loginEndpoint(request, env);
      }

      if (path === '/api/auth/me' && request.method === 'GET') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        return await meEndpoint(request, env);
      }

      if (path === '/api/auth/refresh' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        return await refreshEndpoint(request, env);
      }

      if (path === '/api/auth/logout' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        return await logoutEndpoint(request, env);
      }

      if (path === '/api/auth/admin-login' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        try {
          // Same per-IP throttle as login; every attempt counts (W1.11)
          if (!(await adminAttemptAllowed(request, env))) {
            return jsonResponse({ error: 'Too many admin login attempts. Please try again in 15 minutes.' }, 429, env);
          }

          const body = await request.json() as any;
          const { email, password, class: classValue } = body;

          console.log('[ADMIN-LOGIN] Request:', { hasEmail: typeof email === 'string', hasPassword: !!password, classValue });

          // Check admin credentials - constant-time compare against the ADMIN_PASSWORD secret
          const isAdminEmail = typeof email === 'string' && email.endsWith('@notarium.site');
          if (!isAdminEmail || !(await secretsMatch(password, env.ADMIN_PASSWORD))) {
            return jsonResponse({ error: 'Invalid admin credentials' }, 401, env);
          }

          // Validate class value
          const validClass = classValue || '10.1';
          console.log('[ADMIN-LOGIN] Validated class:', validClass, 'type:', typeof validClass);
          if (!['10.1', '10.2', '10.3'].includes(validClass)) {
            return jsonResponse({ error: 'Invalid class value' }, 400);
          }

          // Check if admin user exists or create
          console.log('[ADMIN-LOGIN] Checking for existing user...');
          let admin = await env.DB.prepare(
            `SELECT * FROM users WHERE email = ?`
          ).bind(email).first();
          console.log('[ADMIN-LOGIN] Existing user found:', !!admin);

          if (!admin) {
            // Create admin user with specified class - hash the password
            const hashedPassword = await hashPassword(password);
            const result = await env.DB.prepare(`
              INSERT INTO users (encrypted_yw_id, display_name, email, password_hash, class, role, created_at)
              VALUES (?, ?, ?, ?, ?, 'admin', datetime('now'))
              RETURNING id, email, display_name, class, role
            `).bind('admin_' + email, 'Admin', email, hashedPassword, validClass).first();
            admin = result;
          } else {
            // Update existing user: set role to admin and update class
            console.log('[ADMIN-LOGIN] Updating existing user:', (admin as any).id, 'with class:', validClass);
            try {
              await env.DB.prepare(
                `UPDATE users SET role = 'admin', class = ?, updated_at = datetime('now') WHERE email = ?`
              ).bind(validClass, email).run();
              console.log('[ADMIN-LOGIN] Update successful');

              // Re-fetch the updated user
              admin = await env.DB.prepare(
                `SELECT * FROM users WHERE email = ?`
              ).bind(email).first();
              console.log('[ADMIN-LOGIN] Re-fetched user:', (admin as any)?.id);
            } catch (updateError: any) {
              console.error('[ADMIN-LOGIN] Update failed:', updateError);
              console.error('[ADMIN-LOGIN] Error details:', JSON.stringify(updateError));
              throw new Error(`Failed to update admin user: ${updateError.message}`);
            }
          }

          // Access JWT, plus a refresh token when the client opted in (W2.1 / W2.3a)
          const { token, refreshToken } = await issueSession({
            id: (admin as any).id,
            email: (admin as any).email,
            role: 'admin'
          }, env, sessionModeFor(request, body));

          return jsonResponse({
            token,
            ...(refreshToken ? { refreshToken } : {}),
            user: {
              id: (admin as any).id,
              email: (admin as any).email,
              name: (admin as any).display_name,
              role: 'admin'
            }
          }, 200, env);
        } catch (error: any) {
          return jsonResponse({ error: error.message }, 500);
        }
      }

      // Debug ping — never served in production
      if (path === '/api/debug/ping' && request.method === 'POST' && env.ENVIRONMENT !== 'production') {
        console.log('[DEBUG] PING endpoint called!');
        return jsonResponse({ ok: true, message: 'Pong!' });
      }

      if (path === '/api/auth/profile' && request.method === 'PUT') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        try {
          // Identity comes only from a signature-verified JWT (was: unsigned base64 JSON, F2)
          const caller = await getUserFromToken(request, env);
          if (!caller) {
            return jsonResponse({ error: 'Unauthorized - Invalid or missing token' }, 401, env);
          }
          const userId = caller.id;

          // Parse request body
          let body;
          try {
            body = await request.json() as any;
          } catch (bodyError) {
            console.error('Body parse error:', bodyError);
            return jsonResponse({ error: 'Invalid request body' }, 400, env);
          }

          const validation = profileUpdateSchema.safeParse(body);
          if (!validation.success) {
            return jsonResponse({ error: 'Invalid input', details: validation.error.errors }, 400, env);
          }
          const { updates, values } = profileUpdateFields(validation.data);

          // Always update the timestamp
          updates.push('updated_at = ?');
          values.push(new Date().toISOString());

          if (updates.length === 1) {
            // Only updated_at, no real changes
            return jsonResponse({ success: true, updated: false }, 200, env);
          }

          try {
            values.push(userId); // Add userId for WHERE clause
            const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            await env.DB.prepare(sql).bind(...values).run();

            // Verify the update by reading it back
            const updated = await env.DB.prepare(`
              SELECT id, display_name, photo_url, email, class, description FROM users WHERE id = ?
            `).bind(userId).first() as any;

            return jsonResponse({ success: true, updated: true, user: updated }, 200, env);
          } catch (dbError: any) {
            console.error('[PROFILE] Database update error:', dbError);
            return jsonResponse({ error: 'Failed to update profile' }, 500, env);
          }
        } catch (error: any) {
          if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
          console.error('Profile update error:', error);
          return jsonResponse({ error: error.message || 'Internal server error' }, 500, env);
        }
      }

      // Change password (for logged-in users)
      if (path === '/api/auth/change-password' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        try {
          // Same DB-backed identity as every other bearer route (W1.12)
          const caller = await getUserFromToken(request, env);
          if (!caller) {
            return jsonResponse({ error: 'Unauthorized - Invalid or missing token' }, 401, env);
          }
          const userId = caller.id;

          const body = await request.json() as any;
          const { currentPassword, newPassword } = body;

          if (!currentPassword || !newPassword) {
            return jsonResponse({ error: 'Current password and new password are required' }, 400);
          }

          // Get user from database
          const user = await env.DB.prepare(`
            SELECT id, email, password_hash FROM users WHERE id = ?
          `).bind(userId).first() as any;

          if (!user) {
            return jsonResponse({ error: 'User not found' }, 404);
          }

          // Verify current password with bcrypt
          const isPasswordValid = await verifyPassword(currentPassword, user.password_hash);
          if (!isPasswordValid) {
            return jsonResponse({ error: 'Current password is incorrect' }, 401, env);
          }

          // Hash the new password with bcrypt
          const hashedNewPassword = await hashPassword(newPassword);

          // Update password in database
          await env.DB.prepare(`
            UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
          `).bind(hashedNewPassword, userId).run();

          console.log('[PASSWORD_CHANGE] Password changed successfully for user ID:', userId);
          return jsonResponse({ success: true, message: 'Password changed successfully' }, 200, env);
        } catch (error: any) {
          if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
          console.error('[PASSWORD_CHANGE] Error:', error);
          return jsonResponse({ error: error.message || 'Failed to change password' }, 500);
        }
      }

      // User routes (only if database available)
      if (env.DB && path === '/api/user/update' && request.method === 'POST') {
        return await updateUserInfo(request, env);
      }

      if (env.DB && path === '/api/user/me' && request.method === 'GET') {
        return await getCurrentUser(request, env);
      }

      if (env.DB && path === '/api/user/class' && request.method === 'PUT') {
        return await updateUserClass(request, env);
      }

      // Subject routes - use mock data as fallback
      if (path === '/api/subjects' && request.method === 'GET') {
        if (!env.DB) {
          return jsonResponse({ subjects: MOCK_SUBJECTS });
        }
        return await getSubjects(request, env);
      }

      // Note routes
      if (path.startsWith('/api/notes/subject/')) {
        const subjectId = path.split('/').pop();
        return await getNotesBySubject(subjectId!, request, env);
      }

      if (path === '/api/notes/search' && request.method === 'GET') {
        const query = url.searchParams.get('q') || '';
        return await searchNotes(query, request, env);
      }

      if (path === '/api/notes' && request.method === 'POST') {
        return await createNote(request, env);
      }

      if (path.match(/^\/api\/notes\/\d+$/) && request.method === 'PUT') {
        const noteId = path.split('/')[3];
        return await userUpdateNote(noteId, request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/summary$/) && request.method === 'PUT') {
        const noteId = path.split('/')[3];
        return await updateNoteSummary(noteId, request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/like$/) && request.method === 'POST') {
        const noteId = path.split('/')[3];
        return await toggleNoteLike(noteId, request, env);
      }

      // My Notes routes
      if (path === '/api/notes/my-notes' && request.method === 'GET') {
        return await getMyNotes(request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/publish$/) && request.method === 'POST') {
        const noteId = path.split('/')[3];
        return await publishDraftNote(noteId, request, env);
      }

      if (path.match(/^\/api\/notes\/\d+$/) && request.method === 'DELETE') {
        const noteId = path.split('/')[3];
        return await userDeleteNote(noteId, request, env);
      }

      // Leaderboard
      if (path === '/api/leaderboard' && request.method === 'GET') {
        return await getLeaderboard(env);
      }

      // Chat routes
      if (path === '/api/chat/sessions' && request.method === 'POST') {
        return await createChatSession(request, env);
      }

      if (path === '/api/chat/sessions' && request.method === 'GET') {
        return await getChatSessions(request, env);
      }

      if (path.match(/^\/api\/chat\/sessions\/\d+\/messages$/) && request.method === 'GET') {
        const sessionId = path.split('/')[4];
        return await getChatMessages(sessionId, request, env);
      }

      if (path.match(/^\/api\/chat\/sessions\/\d+\/messages$/) && request.method === 'POST') {
        const sessionId = path.split('/')[4];
        return await addChatMessage(sessionId, request, env);
      }

      if (path.match(/^\/api\/chat\/sessions\/\d+\/ai-response$/) && request.method === 'POST') {
        const sessionId = path.split('/')[4];
        if (!env.DB) {
          const body = await request.json() as any;
          const mockResponse = `That's a great question about ${body.message?.substring(0, 20) || 'this topic'}. Let me explain: This is an important concept in education. Understanding this will help you succeed in your studies. Feel free to ask follow-up questions!`;
          return jsonResponse({ response: mockResponse });
        }
        return await getAIResponse(sessionId, request, env);
      }

      // AI/Gemini routes
      if (path === '/api/gemini/quick-summary' && request.method === 'POST') {
        if (!env.GEMINI_API_KEY) {
          // Fallback when no API key
          const body = await request.json() as any;
          const summary = `${body.title || 'Study material'}: ${body.content?.substring(0, 80) || 'No content available'}...`;
          return jsonResponse({ success: true, summary });
        }

        try {
          const body = await request.json() as any;
          const { title, content } = body;

          if (!content) {
            return jsonResponse({ error: 'Content is required' }, 400);
          }

          const summary = await generateNoteSummary(content, title || 'Untitled', env);
          return jsonResponse({ success: true, summary });
        } catch (error: any) {
          console.error('Quick summary error:', error);
          return jsonResponse({ error: error.message || 'Failed to generate summary' }, 500);
        }
      }

      if (path === '/api/gemini/auto-tags' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { title, content } = body;

          const deepseekApiKey = env.DEEPSEEK_API_KEY;

          const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${deepseekApiKey}`
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [{
                role: 'user',
                content: `Generate 3-5 relevant study tags for this note. Return ONLY the tags as a comma-separated list, nothing else. Write the tags in Indonesian (Bahasa Indonesia).

Title: ${title || 'Untitled'}
Content: ${content?.substring(0, 500) || 'No content'}

Tags:`
              }],
              max_tokens: 50,
              temperature: 0.4
            })
          });

          const data = await response.json() as any;

          if (!response.ok || !data.choices || data.choices.length === 0) {
            throw new Error('DeepSeek API error');
          }

          const tagsText = data.choices[0].message.content.trim();
          const tags = tagsText.split(',').map((t: string) => t.trim()).filter((t: string) => t && t.length > 0).slice(0, 5);

          return jsonResponse({ success: true, tags: tags.length > 0 ? tags : ['study', 'notes'] });
        } catch (error: any) {
          console.error('Auto tags error:', error);
          // Fallback tags on error
          return jsonResponse({ success: true, tags: ['study', 'notes', 'learning'] });
        }
      }

      if (path === '/api/gemini/summarize' && request.method === 'POST') {
        if (!env.GEMINI_API_KEY) {
          const body = await request.json() as any;
          const summary = `${body.title || 'Topic'}: ${body.description || 'This covers key concepts'}.`;
          return jsonResponse({ success: true, summary });
        }

        try {
          const body = await request.json() as any;
          const summary = await generateNoteSummary(body.content || body.description, body.title || 'Untitled', env);
          return jsonResponse({ success: true, summary });
        } catch (error: any) {
          console.error('Summarize error:', error);
          return jsonResponse({ error: error.message }, 500);
        }
      }

      if (path === '/api/gemini/ocr' && request.method === 'POST') {
        return await performOCREndpoint(request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/summary$/) && request.method === 'POST') {
        const noteId = path.split('/')[3];
        return await generateNoteSummaryEndpoint(noteId, request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/quiz$/) && request.method === 'POST') {
        const noteId = path.split('/')[3];
        return await generateQuizEndpoint(noteId, request, env);
      }

      if (path === '/api/study-plan' && request.method === 'POST') {
        return await generateStudyPlanEndpoint(request, env);
      }

      if (path === '/api/concept-explain' && request.method === 'POST') {
        return await explainConceptEndpoint(request, env);
      }

      // Admin routes
      if (path === '/api/admin/verify' && request.method === 'POST') {
        return await verifyAdmin(request, env);
      }

      if (path.match(/^\/api\/admin\/upvote\/\d+$/) && request.method === 'POST') {
        const noteId = path.split('/')[4];
        return await adminUpvoteNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/notes\/\d+\/like$/) && request.method === 'POST') {
        const noteId = path.split('/')[4];
        return await adminLikeNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/notes\/\d+$/) && request.method === 'DELETE') {
        const noteId = path.split('/')[4];
        return await deleteNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/notes\/\d+$/) && request.method === 'PUT') {
        const noteId = path.split('/')[4];
        return await updateNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/suspend\/\d+$/) && request.method === 'POST') {
        const userId = path.split('/')[4];
        return await suspendUser(userId, request, env);
      }

      if (path.match(/^\/api\/admin\/warn\/\d+$/) && request.method === 'POST') {
        const userId = path.split('/')[4];
        return await warnUser(userId, request, env);
      }

      if (path.match(/^\/api\/admin\/unsuspend\/\d+$/) && request.method === 'POST') {
        const userId = path.split('/')[4];
        return await unsuspendUser(userId, request, env);
      }

      if (path.match(/^\/api\/admin\/user\/\d+$/) && request.method === 'DELETE') {
        const userId = path.split('/')[4];
        return await removeUser(userId, request, env);
      }

      if (path === '/api/admin/users' && request.method === 'GET') {
        return await getAllUsers(request, env);
      }

      if (path === '/api/admin/notes' && request.method === 'GET') {
        return await getAllNotes(request, env);
      }

      if (path === '/api/admin/activity-log' && request.method === 'GET') {
        return await getAdminActivityLogs(request, env);
      }

      if (path === '/api/admin/usage-stats' && request.method === 'GET') {
        return await getUsageStatistics(request, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error: any) {
      if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, env);
      console.error('API Error:', error);
      return jsonResponse({ error: error.message || 'Internal server error' }, 500);
    }
  },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handler.fetch(request, env);
    return withSecurityHeaders(response, request, env);
  },
};
