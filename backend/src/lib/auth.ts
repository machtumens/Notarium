import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import type { Env, User } from './env';
import { JWT_EXPIRATION } from './env';
import { jsonResponse } from './response';
import { isoUtc } from './time';

type Identity = { id: number; email: string; role: string; admin_role?: string; iat?: number };

/**
 * Domains that only the worker itself may hand out. `@notarium.internal` holds
 * the admin-login rows; `@notariumadmin.com` is the legacy admin sign-in. The
 * latter did not resolve in DNS on 29 Oct 2026, so anyone could register it and
 * own a Google account on it — no signup or Google sign-in may claim either.
 */
const RESERVED_ADMIN_DOMAINS = ['@notarium.internal', '@notariumadmin.com'];

export function isReservedAdminEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return RESERVED_ADMIN_DOMAINS.some((d) => e.endsWith(d));
}

/**
 * A suspension still in force. One whose end date has passed counts as lifted —
 * the next password login clears the columns, exactly as before.
 */
export function isSuspendedNow(row: {
  suspended?: number | null;
  suspension_end_date?: string | null;
}): boolean {
  if (row.suspended !== 1) return false;
  if (!row.suspension_end_date) return true;
  return new Date(row.suspension_end_date).getTime() > Date.now();
}

// Firebase ID tokens are RS256, signed by Google's securetoken service. We verify
// against Google's public JWKS with `jose` — no Firebase Admin SDK (it needs Node
// APIs that don't run on Workers). The set is cached in-isolate by createRemoteJWKSet.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);

/**
 * Verify a Firebase ID token and resolve it to a local D1 user. Roles live in the
 * `users` row (not custom claims), so identity = verified token → local lookup.
 * Linking an existing account by email is gated on `email_verified` to prevent
 * hijack via an unverified Firebase signup. Unknown users are JIT-provisioned.
 * Returns null for anything that isn't a valid Firebase token (caller falls back).
 */
async function verifyFirebaseToken(token: string, env: Env): Promise<Identity | null> {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    const uid = typeof payload.sub === 'string' ? payload.sub : null;
    if (!uid) return null;
    const email = typeof payload.email === 'string' ? payload.email : '';
    const emailVerified = payload.email_verified === true;
    // Same rule as the Google OAuth callback: a reserved admin address is never
    // linked or provisioned from a third-party identity.
    if (email && isReservedAdminEmail(email)) return null;

    const byUid = await env.DB.prepare(
      `SELECT id, email, role, admin_role FROM users WHERE firebase_uid = ?`,
    )
      .bind(uid)
      .first();
    if (byUid) return byUid as unknown as Identity;

    // JIT-link an existing local account, but only on a verified email.
    if (email && emailVerified) {
      const byEmail = await env.DB.prepare(
        `SELECT id, email, role, admin_role FROM users WHERE email = ? AND role != 'admin'`,
      )
        .bind(email)
        .first();
      if (byEmail) {
        await env.DB.prepare(`UPDATE users SET firebase_uid = ? WHERE id = ?`)
          .bind(uid, (byEmail as { id: number }).id)
          .run();
        return byEmail as unknown as Identity;
      }
    }

    // JIT-provision a brand-new Firebase signup. Profile enrichment (class, etc.)
    // happens on the frontend sync call in Phase 2.
    const name = typeof payload.name === 'string' ? payload.name : null;
    const photo = typeof payload.picture === 'string' ? payload.picture : null;
    const created = await env.DB.prepare(
      `INSERT INTO users (firebase_uid, email, display_name, photo_url, role)
       VALUES (?, ?, ?, ?, 'student')
       RETURNING id, email, role, admin_role`,
    )
      .bind(uid, email || null, name, photo)
      .first();
    return (created as unknown as Identity) ?? null;
  } catch {
    return null;
  }
}

/**
 * Unified token resolver for the dual-auth window: try a Firebase ID token first,
 * then fall back to the legacy HS256 JWT. ponytail: the legacy fallback is deleted
 * at Phase 4 cutover once all clients issue Firebase tokens.
 */
async function resolveIdentity(token: string, env: Env): Promise<Identity | null> {
  const fb = await verifyFirebaseToken(token, env);
  if (fb) return fb;
  return await verifyToken(token, env);
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function createToken(
  payload: {
    id: number;
    email: string;
    role: string;
    admin_role?: string;
    /** Marks a refresh token. `verifyToken` refuses one unless asked to allow it. */
    typ?: 'refresh';
    /** Unique per refresh token: without it two minted in the same second are identical. */
    jti?: string;
    /** Rotation family — the chain this refresh token belongs to (one per device). */
    fam?: string;
  },
  env: Env,
  expiresIn: string = JWT_EXPIRATION,
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/**
 * Verify an access token. A refresh token (`typ: 'refresh'`) is signed with the
 * same secret and carries the same claims, so without this guard a stolen
 * refresh token would double as a seven-day access token. Only the refresh
 * endpoint passes `allowRefresh`.
 */
export async function verifyToken(
  token: string,
  env: Env,
  opts: { allowRefresh?: boolean } = {},
): Promise<{
  id: number;
  email: string;
  role: string;
  admin_role?: string;
  typ?: 'refresh';
  fam?: string;
  iat?: number;
} | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    // Pinned: HS256 is the only algorithm this secret signs with.
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const typ = payload.typ === 'refresh' ? ('refresh' as const) : undefined;
    if (typ === 'refresh' && !opts.allowRefresh) return null;
    return {
      id: payload.id as number,
      email: payload.email as string,
      role: payload.role as string,
      admin_role: payload.admin_role as string | undefined,
      typ,
      fam: payload.fam as string | undefined,
      iat: payload.iat,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Bearer token → identity, refused while the account is suspended. A token
 * outlives the suspension that should end it (24 h), so the row is the
 * authority, not the token. ponytail: one indexed read per call; cache it per
 * request if D1 reads ever show up in the bill.
 */
async function activeIdentity(request: Request, env: Env): Promise<Identity | null> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const decoded = await resolveIdentity(token, env);
  if (!decoded?.id) return null;
  const row = (await env.DB.prepare(`SELECT suspended, suspension_end_date FROM users WHERE id = ?`)
    .bind(decoded.id)
    .first()) as { suspended: number | null; suspension_end_date: string | null } | null;
  if (!row || isSuspendedNow(row)) return null;
  return decoded;
}

export async function getUserIdFromToken(request: Request, env: Env): Promise<number | null> {
  return (await activeIdentity(request, env))?.id || null;
}

export async function getUserFromToken(request: Request, env: Env): Promise<Identity | null> {
  return await activeIdentity(request, env);
}

export async function requireAdmin(
  request: Request,
  env: Env,
): Promise<{ id: number; email: string; role: string } | Response> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401, env);
  const decoded = await resolveIdentity(token, env);
  if (!decoded) return jsonResponse({ error: 'Invalid or expired token' }, 401, env);
  if (decoded.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403, env);
  return decoded;
}

export async function requireRole(
  request: Request,
  env: Env,
  allowed: string[],
): Promise<{ id: number; email: string; role: string; admin_role?: string } | Response> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401, env);
  const decoded = await resolveIdentity(token, env);
  if (!decoded) return jsonResponse({ error: 'Invalid or expired token' }, 401, env);
  if (decoded.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403, env);
  // Least-privilege: a token without admin_role must NOT be treated as super.
  // Only tokens explicitly carrying admin_role='super' receive superuser access.
  // This prevents stale or forged tokens missing the field from escalating.
  const sub = decoded.admin_role ?? 'none';
  if (sub === 'super') return decoded;
  if (!allowed.includes(sub)) return jsonResponse({ error: 'Forbidden' }, 403, env);
  return decoded;
}

/**
 * Constant-time string comparison for Workers (no Node.js crypto.timingSafeEqual).
 * Signs both strings with an ephemeral HMAC-SHA-256 key and compares the digests
 * byte-by-byte so that short-circuit evaluation of the strings cannot occur.
 * An absent or empty `secret` NEVER matches any `candidate`.
 */
export async function timingSafeEqualStr(
  secret: string | undefined,
  candidate: string,
): Promise<boolean> {
  if (!secret || secret.length === 0) return false;
  // Generate a fresh random key per call so the digests are not reusable.
  // Cast: HMAC generateKey always returns a CryptoKey (not a CryptoKeyPair).
  const key = (await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])) as CryptoKey;
  const enc = new TextEncoder();
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(secret)),
    crypto.subtle.sign('HMAC', key, enc.encode(candidate)),
  ]);
  const a = new Uint8Array(sigA);
  const b = new Uint8Array(sigB);
  // Both digests are the same length (32 bytes); XOR-accumulate so every byte is
  // always read regardless of any mismatch found earlier.
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export const requireModerator = (request: Request, env: Env) =>
  requireRole(request, env, ['moderator']);
export const requireTechnical = (request: Request, env: Env) =>
  requireRole(request, env, ['technical']);

const USER_COLUMNS =
  'id, encrypted_yw_id, display_name, email, photo_url, description, class, ' +
  'grade_class_id, role, admin_role, notes_uploaded, total_likes, total_admin_upvotes, ' +
  'diamonds, suspended, suspension_end_date, suspension_reason, warning, ' +
  'warning_message, warning_first_viewed, warning_view_count, ' +
  'last_seen_at, timezone, created_at, updated_at';

/**
 * How stale `last_seen_at` may get before the next authenticated request
 * refreshes it. The column feeds the `active_users` figure in the daily usage
 * snapshot, which asks "did this person use the app today" — a fifteen-minute
 * resolution answers that exactly as well as a per-request write would, for a
 * fraction of the writes.
 */
const LAST_SEEN_THROTTLE_MS = 15 * 60 * 1000;

/**
 * Record that `userId` is currently using the app.
 *
 * Pass `knownLastSeen` when the caller already has the row: a fresh value
 * short-circuits in JS and D1 is never touched, so the common request pays
 * nothing. The SQL guard repeats the same condition so two concurrent requests
 * cannot both write.
 *
 * Never throws. This is telemetry — a failure here must not turn a working
 * request into an error.
 */
export async function touchLastSeen(
  env: Env,
  userId: number,
  knownLastSeen?: string | null,
): Promise<void> {
  const now = new Date();

  if (knownLastSeen) {
    const seen = Date.parse(knownLastSeen);
    if (!Number.isNaN(seen) && now.getTime() - seen < LAST_SEEN_THROTTLE_MS) return;
  }

  const staleBefore = isoUtc(new Date(now.getTime() - LAST_SEEN_THROTTLE_MS));
  try {
    await env.DB.prepare(
      `UPDATE users
          SET last_seen_at = ?
        WHERE id = ?
          AND (last_seen_at IS NULL OR last_seen_at < ?)`,
    )
      .bind(isoUtc(now), userId, staleBefore)
      .run();
  } catch {
    // Deliberately swallowed — see the doc comment.
  }
}

/**
 * JWT-only identity resolver. Returns the full user row for a valid Bearer
 * token, or null when the request is unauthenticated (or the token's user no
 * longer exists). Never trusts a client header and never creates a user —
 * account creation happens only through signup / OAuth / admin-login.
 *
 * Use this for endpoints that should work for guests too (personalization is
 * optional): treat a null result as "anonymous".
 */
export async function getAuthedUser(request: Request, env: Env): Promise<User | null> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = token ? (await resolveIdentity(token, env))?.id : null;
  if (!userId) return null;
  const user = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(userId)
    .first();
  // Same rule as activeIdentity, read off the row we already fetched.
  if (!user || isSuspendedNow(user as { suspended?: number })) return null;

  // USER_COLUMNS already carries last_seen_at, so this is free unless a write
  // is actually due.
  await touchLastSeen(env, userId, (user as unknown as User).last_seen_at);
  return user as unknown as User;
}

/**
 * Identity for endpoints that REQUIRE an authenticated user (all mutations and
 * per-user reads). Throws when unauthenticated so the caller/handler denies the
 * request. Formerly this trusted an `X-Encrypted-Yw-ID` header and auto-created
 * a user from it — a full authentication bypass — which has been removed.
 */
export async function getOrCreateUser(request: Request, env: Env): Promise<User> {
  const user = await getAuthedUser(request, env);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
