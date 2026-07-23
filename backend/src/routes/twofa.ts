import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getUserFromToken, createToken, hashPassword, verifyPassword } from '../lib/auth';
import {
  generateTotpSecret,
  buildOtpAuthUri,
  verifyTotp,
  generateBackupCodes,
  consumeBackupCode,
  createMfaChallenge,
  verifyMfaChallenge,
} from '../lib/totp';

async function authUser(request: Request, env: Env) {
  const decoded = await getUserFromToken(request, env);
  if (!decoded?.id) return null;
  return decoded;
}

/** POST /api/auth/2fa/setup — issue a pending secret + provisioning URI. */
export async function setup2fa(request: Request, env: Env) {
  const decoded = await authUser(request, env);
  if (!decoded) return jsonResponse({ error: 'Unauthorized' }, 401, env);
  const secret = generateTotpSecret();
  await env.DB.prepare(
    `UPDATE users SET totp_secret = ?, totp_enabled = 0, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(secret, decoded.id)
    .run();
  return jsonResponse({ secret, otpauth_uri: buildOtpAuthUri(secret, decoded.email) }, 200, env);
}

/** POST /api/auth/2fa/enable — confirm a code, activate 2FA, return backup codes once. */
export async function enable2fa(request: Request, env: Env) {
  const decoded = await authUser(request, env);
  if (!decoded) return jsonResponse({ error: 'Unauthorized' }, 401, env);
  const { code } = (await request.json()) as any;
  const user = (await env.DB.prepare(`SELECT totp_secret FROM users WHERE id = ?`)
    .bind(decoded.id)
    .first()) as any;
  if (!user?.totp_secret) {
    return jsonResponse({ error: 'Run 2FA setup first' }, 400, env);
  }
  if (!(await verifyTotp(user.totp_secret, String(code || '')))) {
    return jsonResponse({ error: 'Invalid code' }, 400, env);
  }
  const { plain, hashes } = await generateBackupCodes();
  await env.DB.prepare(
    `UPDATE users SET totp_enabled = 1, totp_backup_codes = ?, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(JSON.stringify(hashes), decoded.id)
    .run();
  return jsonResponse({ success: true, backup_codes: plain }, 200, env);
}

/** POST /api/auth/2fa/disable — verify current password OR a TOTP code, then clear 2FA. */
export async function disable2fa(request: Request, env: Env) {
  const decoded = await authUser(request, env);
  if (!decoded) return jsonResponse({ error: 'Unauthorized' }, 401, env);
  const { code, password } = (await request.json()) as any;
  const user = (await env.DB.prepare(`SELECT totp_secret, password_hash FROM users WHERE id = ?`)
    .bind(decoded.id)
    .first()) as any;
  if (!user) return jsonResponse({ error: 'User not found' }, 404, env);
  const codeOk = code && user.totp_secret && (await verifyTotp(user.totp_secret, String(code)));
  const pwOk =
    password && user.password_hash && (await verifyPassword(String(password), user.password_hash));
  if (!codeOk && !pwOk) {
    return jsonResponse({ error: 'Provide a valid current code or password' }, 400, env);
  }
  await env.DB.prepare(
    `UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(decoded.id)
    .run();
  return jsonResponse({ success: true }, 200, env);
}

/**
 * POST /api/auth/2fa/verify — second step of login. Consumes the challenge
 * token from loginEndpoint plus a TOTP code or backup code, then issues the
 * real session token.
 */
export async function verify2fa(request: Request, env: Env) {
  const { challenge, code } = (await request.json()) as any;
  const userId = await verifyMfaChallenge(String(challenge || ''), env);
  if (!userId) return jsonResponse({ error: 'Invalid or expired challenge' }, 401, env);

  const user = (await env.DB.prepare(
    `SELECT id, email, display_name, class, grade, role, notes_uploaded, total_likes,
            total_admin_upvotes, COALESCE(diamonds, 0) as diamonds, description, photo_url,
            totp_secret, totp_backup_codes
     FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first()) as any;
  if (!user?.totp_secret) return jsonResponse({ error: 'User not found' }, 404, env);

  const codeStr = String(code || '');
  let ok = await verifyTotp(user.totp_secret, codeStr);
  if (!ok && user.totp_backup_codes) {
    const remaining = await consumeBackupCode(codeStr, JSON.parse(user.totp_backup_codes));
    if (remaining) {
      ok = true;
      await env.DB.prepare(`UPDATE users SET totp_backup_codes = ? WHERE id = ?`)
        .bind(JSON.stringify(remaining), userId)
        .run();
    }
  }
  if (!ok) return jsonResponse({ error: 'Invalid code' }, 401, env);

  const token = await createToken({ id: user.id, email: user.email, role: user.role }, env);
  const points =
    (user.notes_uploaded || 0) + (user.total_likes || 0) + (user.total_admin_upvotes || 0);
  return jsonResponse(
    {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.display_name,
        class: user.class,
        grade: user.grade || null,
        role: user.role,
        notes_count: user.notes_uploaded || 0,
        total_likes: user.total_likes || 0,
        total_admin_upvotes: user.total_admin_upvotes || 0,
        diamonds: user.diamonds || 0,
        points,
        description: user.description || null,
        photo_url: user.photo_url || null,
      },
    },
    200,
    env,
  );
}

/**
 * POST /api/auth/forgot-password — "recover via Google". Always 200 (no account
 * enumeration). Tells the client whether Google recovery is available.
 */
export async function forgotPassword(request: Request, env: Env) {
  const { email } = (await request.json()) as any;
  if (!email) return jsonResponse({ error: 'Email is required' }, 400, env);
  const user = (await env.DB.prepare(`SELECT google_id, oauth_provider FROM users WHERE email = ?`)
    .bind(email)
    .first()) as any;
  const googleLinked = !!user && (user.google_id || user.oauth_provider === 'google');
  if (googleLinked) {
    return jsonResponse(
      {
        recovery: 'google',
        message:
          'This account is linked to Google. Sign in with Google, then set a new password from your account settings.',
      },
      200,
      env,
    );
  }
  return jsonResponse(
    {
      recovery: 'none',
      message: 'If an account exists, contact an administrator to reset the password.',
    },
    200,
    env,
  );
}

/**
 * POST /api/auth/set-password — set a password for the logged-in user WITHOUT
 * the old one. Safe because the session token itself proves identity; this is
 * the endpoint a Google-recovered user hits to (re)establish a password.
 */
export async function setPassword(request: Request, env: Env) {
  const decoded = await authUser(request, env);
  if (!decoded) return jsonResponse({ error: 'Unauthorized' }, 401, env);
  const { newPassword } = (await request.json()) as any;
  if (!newPassword || String(newPassword).length < 8) {
    return jsonResponse({ error: 'Password must be at least 8 characters' }, 400, env);
  }
  const hashed = await hashPassword(String(newPassword));
  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(hashed, decoded.id)
    .run();
  return jsonResponse({ success: true, message: 'Password set successfully' }, 200, env);
}

// Re-exported so loginEndpoint can mint the challenge when totp_enabled = 1.
export { createMfaChallenge };
