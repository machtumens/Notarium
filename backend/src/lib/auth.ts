import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { Env, User } from './env';
import { JWT_EXPIRATION } from './env';
import { jsonResponse } from './response';

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

  const decoded = await verifyToken(token, env);
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

  return await verifyToken(token, env);
}

export async function requireAdmin(
  request: Request,
  env: Env,
): Promise<{ id: number; email: string; role: string } | Response> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401, env);
  const decoded = await verifyToken(token, env);
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
  const decoded = await verifyToken(token, env);
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
  'last_seen_at, created_at, updated_at';

export async function getOrCreateUser(request: Request, env: Env): Promise<User> {
  const userIdFromToken = await getUserIdFromToken(request, env);

  if (userIdFromToken) {
    const user = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
      .bind(userIdFromToken)
      .first();

    if (user) {
      return user as unknown as User;
    }
  }

  const userId = request.headers.get('X-Encrypted-Yw-ID');

  if (!userId) {
    throw new Error('User ID not found');
  }

  const { results } = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE encrypted_yw_id = ?`,
  )
    .bind(userId)
    .all();

  if (results.length > 0) {
    return results[0] as unknown as User;
  }

  const insertResult = await env.DB.prepare(
    'INSERT INTO users (encrypted_yw_id, role, class) VALUES (?, ?, ?) RETURNING *',
  )
    .bind(userId, 'student', '10.1')
    .first();

  if (!insertResult) {
    throw new Error('Failed to create user');
  }

  return insertResult as unknown as User;
}
