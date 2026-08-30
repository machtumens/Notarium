import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import type { Env, User } from './env';
import { JWT_EXPIRATION } from './env';
import { jsonResponse } from './response';

type Identity = { id: number; email: string; role: string; admin_role?: string };

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

    const byUid = await env.DB.prepare(
      `SELECT id, email, role, admin_role FROM users WHERE firebase_uid = ?`,
    )
      .bind(uid)
      .first();
    if (byUid) return byUid as unknown as Identity;

    // JIT-link an existing local account, but only on a verified email.
    if (email && emailVerified) {
      const byEmail = await env.DB.prepare(
        `SELECT id, email, role, admin_role FROM users WHERE email = ?`,
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
  payload: { id: number; email: string; role: string; admin_role?: string },
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

export async function verifyToken(
  token: string,
  env: Env,
): Promise<{ id: number; email: string; role: string; admin_role?: string } | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as number,
      email: payload.email as string,
      role: payload.role as string,
      admin_role: payload.admin_role as string | undefined,
    };
  } catch (error) {
    return null;
  }
}

export async function getUserIdFromToken(request: Request, env: Env): Promise<number | null> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return null;
  }

  const decoded = await resolveIdentity(token, env);
  return decoded?.id || null;
}

export async function getUserFromToken(
  request: Request,
  env: Env,
): Promise<{ id: number; email: string; role: string; admin_role?: string } | null> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return null;
  }

  return await resolveIdentity(token, env);
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
 * JWT-only identity resolver. Returns the full user row for a valid Bearer
 * token, or null when the request is unauthenticated (or the token's user no
 * longer exists). Never trusts a client header and never creates a user —
 * account creation happens only through signup / OAuth / admin-login.
 *
 * Use this for endpoints that should work for guests too (personalization is
 * optional): treat a null result as "anonymous".
 */
export async function getAuthedUser(request: Request, env: Env): Promise<User | null> {
  const userId = await getUserIdFromToken(request, env);
  if (!userId) return null;
  const user = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(userId)
    .first();
  return (user as unknown as User) ?? null;
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
