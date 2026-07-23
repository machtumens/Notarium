/**
 * Header-based (X-Encrypted-Yw-ID) user info endpoints.
 */
import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getOrCreateUser } from '../lib/auth';

// Update user info
export async function updateUserInfo(request: Request, env: Env) {
  const userId = request.headers.get('X-Encrypted-Yw-ID');
  const body = (await request.json()) as any;

  // First check if user exists
  const { results } = await env.DB.prepare('SELECT * FROM users WHERE encrypted_yw_id = ?')
    .bind(userId)
    .all();

  if (results.length === 0) {
    // Create new user (with default class)
    await env.DB.prepare(
      'INSERT INTO users (encrypted_yw_id, display_name, photo_url, email, class) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(userId, body.display_name, body.photo_url, body.email, '10.1')
      .run();
  } else {
    // Update existing user
    await env.DB.prepare(
      'UPDATE users SET display_name = ?, photo_url = ?, email = ?, updated_at = datetime("now") WHERE encrypted_yw_id = ?',
    )
      .bind(body.display_name, body.photo_url, body.email, userId)
      .run();
  }

  return jsonResponse({ success: true });
}

// Get current user info
export async function getCurrentUser(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  return jsonResponse({ user });
}

// Update user class
export async function updateUserClass(request: Request, env: Env) {
  const userId = request.headers.get('X-Encrypted-Yw-ID');
  const body = (await request.json()) as any;

  await env.DB.prepare(
    'UPDATE users SET class = ?, updated_at = datetime("now") WHERE encrypted_yw_id = ?',
  )
    .bind(body.class, userId)
    .run();

  return jsonResponse({ success: true });
}
