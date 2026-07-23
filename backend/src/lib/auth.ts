/**
 * Password hashing, JWT sign/verify, token extraction, and user resolution helpers.
 */
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
  payload: { id: number; email: string; role: string },
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
): Promise<{ id: number; email: string; role: string } | null> {
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
): Promise<{ id: number; email: string; role: string } | null> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return null;
  }

  return await verifyToken(token, env);
}

// privilege model:
// - students may only edit/delete their own notes and their own profile
// - admins may edit/delete any content and manage users
// - all admin routes must go through requireAdmin()

// returns the decoded token payload or a 401/403 Response (caller must check with instanceof Response)
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

// Explicit column list for user resolution — excludes password_hash and other
// heavy/sensitive columns that the app never reads off the resolved user object.
const USER_COLUMNS =
  'id, encrypted_yw_id, display_name, email, photo_url, description, class, ' +
  'grade_class_id, role, notes_uploaded, total_likes, total_admin_upvotes, ' +
  'diamonds, suspended, suspension_end_date, suspension_reason, warning, ' +
  'warning_message, warning_first_viewed, warning_view_count, ' +
  'last_seen_at, created_at, updated_at';

export async function getOrCreateUser(request: Request, env: Env): Promise<User> {
  // Try to get user ID from Bearer token first
  const userIdFromToken = await getUserIdFromToken(request, env);

  if (userIdFromToken) {
    // Get user from database using ID
    const user = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
      .bind(userIdFromToken)
      .first();

    if (user) {
      return user as unknown as User;
    }
  }

  // Fallback to old header-based method
  const userId = request.headers.get('X-Encrypted-Yw-ID');

  if (!userId) {
    throw new Error('User ID not found');
  }

  // Check if user exists
  const { results } = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE encrypted_yw_id = ?`,
  )
    .bind(userId)
    .all();

  if (results.length > 0) {
    return results[0] as unknown as User;
  }

  // Create new user (with default class for students who upload notes)
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
