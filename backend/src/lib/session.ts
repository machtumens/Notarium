/**
 * Rotating refresh tokens for the short-session client.
 *
 * Opt-in. A sign-in that carries `X-Notarium-Session: refresh` gets a 15-minute
 * access token plus a refresh token; a sign-in that does not ask gets the flat
 * 24-hour token exactly as before. Nothing here changes an existing client.
 *
 * The refresh token is itself a signed JWT carrying `typ: 'refresh'`, so its
 * user and expiry need no database read, and only its SHA-256 is stored in
 * `refresh_tokens.token` — a dump of that table cannot be replayed. `verifyToken`
 * refuses a `typ: 'refresh'` token, so a refresh token is never also a 7-day
 * access token.
 *
 * Rotation is single-use: each refresh deletes the row it spent and writes the
 * next one under the same `family`. A token presented twice therefore has no
 * row, which is either a replay of a stolen token or a lost race — both end that
 * family. The user's other devices have their own families and are untouched.
 */
import { createToken, verifyToken } from './auth';
import type { Env } from './env';
import { ACCESS_TOKEN_EXPIRATION_SHORT, REFRESH_TOKEN_EXPIRATION } from './env';

/** The header a client sends to ask for a short access token plus a refresh token. */
const OPT_IN_HEADER = 'X-Notarium-Session';

export interface SessionUser {
  id: number;
  email: string;
  role: string;
  admin_role?: string;
}

export interface SessionPair {
  token: string;
  refreshToken: string;
}

/** Did this request ask for a short session? Anything else keeps the 24-hour token. */
export function wantsShortSession(request: Request): boolean {
  return request.headers.get(OPT_IN_HEADER)?.trim().toLowerCase() === 'refresh';
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 7 days from now, in the ISO shape every other timestamp column uses. */
function refreshExpiry(): string {
  const days = Number(REFRESH_TOKEN_EXPIRATION.replace('d', '')) || 7;
  return new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Mint an access/refresh pair and store the refresh token's hash. `family` ties a
 * rotation chain to one device: omit it to start a new one.
 */
export async function issueSessionPair(
  user: SessionUser,
  env: Env,
  family: string = crypto.randomUUID(),
): Promise<SessionPair> {
  const token = await createToken(
    { id: user.id, email: user.email, role: user.role, admin_role: user.admin_role },
    env,
    ACCESS_TOKEN_EXPIRATION_SHORT,
  );
  // `jti` is what makes two refresh tokens different. Without it, jose's
  // setIssuedAt() has one-second resolution and the claims are otherwise
  // identical, so a rotation inside the same second re-minted the SAME string —
  // which silently defeats single-use rotation and replay detection.
  const refreshToken = await createToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      admin_role: user.admin_role,
      typ: 'refresh',
      jti: crypto.randomUUID(),
      // The family travels inside the token so a REPLAY can be scoped: the row is
      // gone by then, and without this claim the only safe reaction would be to
      // revoke every session the user has, signing their other devices out too.
      fam: family,
    },
    env,
    REFRESH_TOKEN_EXPIRATION,
  );
  await env.DB.prepare(
    `INSERT INTO refresh_tokens (user_id, token, family, expires_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(user.id, await sha256Hex(refreshToken), family, refreshExpiry())
    .run();
  return { token, refreshToken };
}

/** What a presented refresh token turned out to be. */
export type RotateResult =
  | { outcome: 'rotated'; pair: SessionPair }
  /** Not ours, tampered with, expired, or not a refresh token at all. Nothing was revoked. */
  | { outcome: 'invalid' }
  /** Correctly signed but already spent: the family is now revoked. */
  | { outcome: 'replayed' };

/**
 * Spend `raw` and hand back the next pair. A correctly-signed token with no row
 * is a replay — that family dies rather than being re-issued.
 */
export async function rotateRefreshToken(raw: string, env: Env): Promise<RotateResult> {
  const claims = await verifyToken(raw, env, { allowRefresh: true });
  if (!claims || claims.typ !== 'refresh') return { outcome: 'invalid' };

  const hash = await sha256Hex(raw);
  const row = (await env.DB.prepare(
    `SELECT id, family, expires_at FROM refresh_tokens WHERE token = ? AND user_id = ?`,
  )
    .bind(hash, claims.id)
    .first()) as { id: number; family: string; expires_at: string } | null;

  if (!row) {
    // Signed by us and still inside its 7 days, yet no row holds it: it was spent
    // already (or logged out). We cannot tell a thief from the rightful holder,
    // so this chain ends — whoever holds the live token in it signs in again.
    // Scoped to the family from the token's own signed claim, so the user's other
    // devices keep their sessions. A family already emptied by logout just
    // deletes nothing.
    if (claims.fam) {
      await env.DB.prepare(`DELETE FROM refresh_tokens WHERE user_id = ? AND family = ?`)
        .bind(claims.id, claims.fam)
        .run();
    } else {
      // Pre-`fam` token (issued by an earlier build): no family to scope to, so
      // fall back to the blunt instrument rather than letting a replay stand.
      await env.DB.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).bind(claims.id).run();
    }
    return { outcome: 'replayed' };
  }

  // Single use: the row goes before the replacement is written, so a crash in
  // between costs the user a sign-in rather than leaving a token spendable twice.
  await env.DB.prepare(`DELETE FROM refresh_tokens WHERE id = ?`).bind(row.id).run();
  if (row.expires_at <= refreshNow()) return { outcome: 'invalid' };

  // ponytail: opportunistic sweep of this user's dead rows — no cron, and the only
  // rows that can pile up belong to someone who is signing in right now anyway.
  await env.DB.prepare(`DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at <= ?`)
    .bind(claims.id, refreshNow())
    .run();

  const pair = await issueSessionPair(
    { id: claims.id, email: claims.email, role: claims.role, admin_role: claims.admin_role },
    env,
    row.family,
  );
  return { outcome: 'rotated', pair };
}

function refreshNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Sign out. With a refresh token, only that device's family goes; without one,
 * every refresh token the user has does — which is what a client that never got
 * a refresh token means by "log me out".
 */
export async function revokeSession(
  userId: number,
  raw: string | undefined,
  env: Env,
): Promise<void> {
  if (!raw) {
    await env.DB.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).bind(userId).run();
    return;
  }
  const hash = await sha256Hex(raw);
  const row = (await env.DB.prepare(
    `SELECT family FROM refresh_tokens WHERE token = ? AND user_id = ?`,
  )
    .bind(hash, userId)
    .first()) as { family: string } | null;
  // A token that is already gone (rotated, or someone else's) must not take a
  // family down with it — fall back to this caller's own tokens only.
  if (!row) {
    await env.DB.prepare(`DELETE FROM refresh_tokens WHERE token = ? AND user_id = ?`)
      .bind(hash, userId)
      .run();
    return;
  }
  await env.DB.prepare(`DELETE FROM refresh_tokens WHERE user_id = ? AND family = ?`)
    .bind(userId, row.family)
    .run();
}
