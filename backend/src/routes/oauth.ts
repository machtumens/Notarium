import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import type { JWTPayload } from 'jose';
import {
  buildAuthorizeUrl,
  decryptToken,
  encryptToken,
  exchangeCode,
  generatePkcePair,
  importAesKey,
  revokeToken,
} from '../services/google-oauth';
import { currentAcademicYear } from '../lib/academicYear';
import { oauthExchangeSchema, parseBody } from '../lib/validation';
import { isReservedAdminEmail } from '../lib/auth';

export interface OAuthEnv {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_URI?: string;
  OAUTH_TOKEN_AES_KEY?: string;
  FRONTEND_URL?: string;
}

const SIGNUP_SCOPES = ['openid', 'email', 'profile'];
const CLASSROOM_SCOPES = [
  ...SIGNUP_SCOPES,
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
];
const DOCS_SCOPES = [
  ...SIGNUP_SCOPES,
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
];

const INTENT_SCOPES: Record<string, string[]> = {
  signup: SIGNUP_SCOPES,
  classroom: CLASSROOM_SCOPES,
  docs: DOCS_SCOPES,
};

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const EXCHANGE_TTL_SECONDS = 60;
const EXCHANGE_KV_PREFIX = 'oauth_exchange:';

function exchangeKvKey(code: string): string {
  return `${EXCHANGE_KV_PREFIX}${code}`;
}

function feBase(env: OAuthEnv): string {
  return (env.FRONTEND_URL ?? 'https://notarium-site.vercel.app').replace(/\/$/, '');
}

function sanitizeRedirect(candidate: string | null | undefined, env: OAuthEnv): string {
  const fallback = feBase(env);
  if (!candidate) return fallback;

  if (candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.includes('\\')) {
    return candidate;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.origin === new URL(fallback).origin) {
      return candidate;
    }
  } catch {
    // not a valid absolute URL — fall through to fallback
  }

  return fallback;
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorRedirect(env: OAuthEnv, reason: string): Response {
  return Response.redirect(
    `${feBase(env)}/settings?google=error&reason=${encodeURIComponent(reason)}`,
    302,
  );
}

/**
 * A failure during the *signup* intent belongs on the sign-in screen — the
 * visitor has no session yet, so /settings would only bounce them again.
 */
function signinErrorRedirect(env: OAuthEnv, reason: string): Response {
  return Response.redirect(
    `${feBase(env)}/login?google=error&reason=${encodeURIComponent(reason)}`,
    302,
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function currentUser(
  request: Request,
  env: OAuthEnv,
): Promise<{ id: number; email: string; role: string } | null> {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as number,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

async function issueJwt(
  payload: { id: number; email: string; role: string; admin_role?: string },
  env: OAuthEnv,
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

async function verifyIdToken(idToken: string, env: OAuthEnv): Promise<JWTPayload> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID not configured');
  }
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  });
  return payload;
}

async function handleStart(url: URL, request: Request, env: OAuthEnv): Promise<Response> {
  const intent = url.searchParams.get('intent') ?? '';
  const rawRedirectTo = url.searchParams.get('redirect_to');
  const redirectTo = rawRedirectTo ? sanitizeRedirect(rawRedirectTo, env) : undefined;

  if (!INTENT_SCOPES[intent]) {
    return jsonErr('Invalid or missing intent', 400);
  }

  if (!env.GOOGLE_CLIENT_ID || !env.OAUTH_REDIRECT_URI) {
    return jsonErr('OAuth not configured', 501);
  }

  const user = await currentUser(request, env);

  if ((intent === 'classroom' || intent === 'docs') && !user) {
    return jsonErr('Authentication required', 401);
  }

  const { verifier, challenge } = await generatePkcePair();
  const stateRaw = crypto.getRandomValues(new Uint8Array(32));
  const state = toBase64Url(stateRaw.buffer);
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO oauth_states (state, user_id, redirect_to, pkce_verifier, intent, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(state, user?.id ?? null, redirectTo ?? null, verifier, intent, now, now + 600)
    .run();

  const authorizeUrl = buildAuthorizeUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: env.OAUTH_REDIRECT_URI,
    scopes: INTENT_SCOPES[intent],
    state,
    challenge,
    loginHint: user?.email,
  });

  return Response.redirect(authorizeUrl, 302);
}

/**
 * THE DOOR. Google proves who holds the mailbox; this decides whether that is
 * enough to hold an account. Pure on purpose — it is the whole account-creation
 * rule, and a rule worth one direct test is worth not burying in a 150-line
 * handler.
 *
 * Sign-up is OPEN: any Google account may hold a Notarium account (owner
 * decision, 27 Oct). The school-domain restriction that used to live here is
 * gone, and with it the `hd` hint on the authorize URL — a picker filtered to
 * the school Workspace would have hidden exactly the accounts now allowed in.
 * What remains are the two things that are not about *which* mailbox it is:
 *
 *  - `email_verified` must be true: without it an administrator of any
 *    Workspace could hand out an unverified alias carrying someone else's
 *    address, and we would seat them as that person.
 *  - the token must actually carry an address. It is the account's identity and
 *    its only unique key, so a token without one cannot create a user — this is
 *    the check the removed domain test was quietly also performing.
 */
export function checkIdentity(
  payload: JWTPayload,
): { ok: true } | { ok: false; reason: 'email_unverified' | 'email_missing' } {
  if (payload.email_verified !== true) return { ok: false, reason: 'email_unverified' };
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (email === '') return { ok: false, reason: 'email_missing' };
  return { ok: true };
}

async function handleCallback(url: URL, _request: Request, env: OAuthEnv): Promise<Response> {
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return errorRedirect(env, oauthError);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return errorRedirect(env, 'missing_params');
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.OAUTH_REDIRECT_URI) {
    return errorRedirect(env, 'oauth_not_configured');
  }

  const now = Math.floor(Date.now() / 1000);

  const stateRow = (await env.DB.prepare(
    `SELECT state, user_id, redirect_to, pkce_verifier, intent, expires_at FROM oauth_states WHERE state = ?`,
  )
    .bind(state)
    .first()) as {
    state: string;
    user_id: number | null;
    redirect_to: string | null;
    pkce_verifier: string;
    intent: string;
    expires_at: number;
  } | null;

  if (!stateRow) {
    console.error('[oauth] state not found');
    return errorRedirect(env, 'invalid_state');
  }

  if (stateRow.expires_at < now) {
    await env.DB.prepare(`DELETE FROM oauth_states WHERE state = ?`).bind(state).run();
    return errorRedirect(env, 'state_expired');
  }

  await env.DB.prepare(`DELETE FROM oauth_states WHERE state = ?`).bind(state).run();

  // Everything from here on knows which flow it is, so a failure can land on the
  // screen that can do something about it: /login for a visitor, /settings for a
  // signed-in account linking Classroom or Docs.
  const fail = stateRow.intent === 'signup' ? signinErrorRedirect : errorRedirect;

  let tokens;
  try {
    tokens = await exchangeCode({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.OAUTH_REDIRECT_URI,
      code,
      verifier: stateRow.pkce_verifier,
    });
  } catch (err: unknown) {
    console.error('[oauth] exchangeCode failed:', err instanceof Error ? err.message : err);
    return fail(env, 'token_exchange_failed');
  }

  if (!tokens.idToken) {
    console.error('[oauth] id_token missing from token response');
    return fail(env, 'id_token_missing');
  }

  let idPayload: JWTPayload;
  try {
    idPayload = await verifyIdToken(tokens.idToken, env);
  } catch (err: unknown) {
    console.error(
      '[oauth] id_token verification failed:',
      err instanceof Error ? err.message : err,
    );
    return fail(env, 'id_token_invalid');
  }

  if (idPayload.aud !== env.GOOGLE_CLIENT_ID) {
    console.error('[oauth] id_token aud mismatch');
    return fail(env, 'id_token_aud_mismatch');
  }
  if (!GOOGLE_ISSUERS.has(idPayload.iss as string)) {
    console.error('[oauth] id_token iss invalid:', idPayload.iss);
    return fail(env, 'id_token_iss_invalid');
  }

  const email = idPayload.email as string | undefined;
  const sub = idPayload.sub as string | undefined;

  if (!email || !sub) {
    return fail(env, 'id_token_missing_claims');
  }

  const { intent } = stateRow;

  if (intent === 'signup') {
    const allowed = checkIdentity(idPayload);
    if (!allowed.ok) {
      console.error('[oauth] rejected google account:', email, '-', allowed.reason);
      return fail(env, allowed.reason);
    }

    const mail = email.trim().toLowerCase();
    // Admin rows live on reserved domains and sign in only through the admin
    // password paths. Whoever owns a Google account at such an address (the
    // legacy domain is registrable) must not land in one.
    if (isReservedAdminEmail(mail)) {
      console.error('[oauth] reserved admin domain refused:', mail);
      return fail(env, 'admin_oauth_forbidden');
    }
    // The display name is Google's, not the student's: it is re-read on every
    // sign-in, so a rename in the school directory follows them here and no
    // Notarium screen offers to edit it.
    const name = (idPayload.name as string | undefined)?.trim() || mail.split('@')[0];
    const picture = (idPayload.picture as string | undefined) ?? null;

    let user = (await env.DB.prepare(
      `SELECT id, email, role, admin_role, suspended FROM users WHERE LOWER(email) = ?`,
    )
      .bind(mail)
      .first()) as {
      id: number;
      email: string;
      role: string;
      admin_role: string | null;
      suspended: number;
    } | null;

    if (user) {
      // An account that signed up with a password keeps its row and gains the
      // Google link; `class` is left exactly as it was, so an existing student
      // is not sent back through the profile step.
      await env.DB.prepare(
        `UPDATE users
            SET display_name = ?,
                photo_url = COALESCE(?, photo_url),
                google_id = COALESCE(google_id, ?),
                oauth_provider = CASE WHEN password_hash IS NULL THEN 'google' ELSE oauth_provider END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
          WHERE id = ?`,
      )
        .bind(name, picture, sub, user.id)
        .run();
    } else {
      // `class` stays NULL on purpose: it is the flag the frontend reads to send
      // a brand-new account through the profile step before the app proper.
      user = (await env.DB.prepare(
        `INSERT INTO users (encrypted_yw_id, display_name, email, photo_url, google_id, oauth_provider, role, academic_year, created_at)
         VALUES (?, ?, ?, ?, ?, 'google', 'student', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
         RETURNING id, email, role, admin_role, suspended`,
      )
        .bind(`google_${sub}`, name, mail, picture, sub, currentAcademicYear())
        .first()) as {
        id: number;
        email: string;
        role: string;
        admin_role: string | null;
        suspended: number;
      };
    }

    if (!user) {
      console.error('[oauth] failed to find or create user for email:', mail);
      return fail(env, 'user_create_failed');
    }

    if (user.suspended === 1) {
      console.error('[oauth] suspended account tried to sign in:', mail);
      return fail(env, 'suspended');
    }
    // Defence in depth for an admin row on any other domain: Google proves the
    // mailbox, not the right to an admin seat.
    if (user.role === 'admin') {
      console.error('[oauth] admin account refused on google sign-in:', mail);
      return fail(env, 'admin_oauth_forbidden');
    }

    // `admin_role` rides along for the same reason the password path carries it: `requireRole`
    // reads a missing claim as 'none', so an admin who signs in with Google would otherwise be
    // refused by every requireModerator/requireTechnical route. NULL omits the claim entirely.
    const jwt = await issueJwt(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        admin_role: user.admin_role || undefined,
      },
      env,
    );

    const oneTimeCode = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
    await env.RATE_LIMIT.put(
      exchangeKvKey(oneTimeCode),
      JSON.stringify({ jwt, exp: now + EXCHANGE_TTL_SECONDS }),
      { expirationTtl: EXCHANGE_TTL_SECONDS },
    );

    return Response.redirect(`${feBase(env)}/auth/callback?code=${oneTimeCode}`, 302);
  }

  if (!stateRow.user_id) {
    console.error('[oauth] no user_id in state for intent:', intent);
    return errorRedirect(env, 'auth_required');
  }

  if (!env.OAUTH_TOKEN_AES_KEY) {
    console.error('[oauth] OAUTH_TOKEN_AES_KEY not set');
    return errorRedirect(env, 'encryption_not_configured');
  }

  const aesKey = await importAesKey(env.OAUTH_TOKEN_AES_KEY);
  const accessTokenEnc = await encryptToken(aesKey, tokens.accessToken);
  const refreshTokenEnc = tokens.refreshToken
    ? await encryptToken(aesKey, tokens.refreshToken)
    : null;

  await env.DB.prepare(
    `INSERT INTO oauth_tokens (user_id, provider, access_token_enc, refresh_token_enc, scope, expires_at, created_at, updated_at)
     VALUES (?, 'google', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       scope = excluded.scope,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      stateRow.user_id,
      accessTokenEnc,
      refreshTokenEnc,
      tokens.scope,
      tokens.expiresAt,
      now,
      now,
    )
    .run();

  const dest = stateRow.redirect_to
    ? sanitizeRedirect(stateRow.redirect_to, env)
    : `${feBase(env)}/settings?google=ok`;
  return Response.redirect(dest, 302);
}

async function handleDisconnect(request: Request, env: OAuthEnv): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) {
    return jsonErr('Unauthorized', 401);
  }

  const row = (await env.DB.prepare(
    `SELECT access_token_enc, refresh_token_enc FROM oauth_tokens WHERE user_id = ? AND provider = 'google'`,
  )
    .bind(user.id)
    .first()) as {
    access_token_enc: string;
    refresh_token_enc: string | null;
  } | null;

  if (!row) {
    return new Response(null, { status: 204 });
  }

  if (env.OAUTH_TOKEN_AES_KEY) {
    try {
      const aesKey = await importAesKey(env.OAUTH_TOKEN_AES_KEY);
      const tokenToRevoke = row.refresh_token_enc
        ? await decryptToken(aesKey, row.refresh_token_enc)
        : await decryptToken(aesKey, row.access_token_enc);
      await revokeToken(tokenToRevoke);
    } catch (err: unknown) {
      console.error('[oauth] revoke failed:', err instanceof Error ? err.message : err);
    }
  }

  await env.DB.prepare(`DELETE FROM oauth_tokens WHERE user_id = ? AND provider = 'google'`)
    .bind(user.id)
    .run();

  return new Response(null, { status: 204 });
}

async function handleStatus(request: Request, env: OAuthEnv): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return jsonErr('Unauthorized', 401);
  const row = (await env.DB.prepare(
    `SELECT scope FROM oauth_tokens WHERE user_id = ? AND provider = 'google'`,
  )
    .bind(user.id)
    .first()) as { scope: string } | null;
  return new Response(JSON.stringify({ linked: !!row, scopes: row ? row.scope.split(' ') : [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleExchange(request: Request, env: OAuthEnv): Promise<Response> {
  // parseBody answers a malformed or non-object body with the shared 400; the
  // outer fetch re-stamps CORS and the security headers on it like any other.
  const body = await parseBody(request, oauthExchangeSchema);
  if (body instanceof Response) return body;

  const code = typeof body.code === 'string' ? body.code : null;
  if (!code) {
    return jsonErr('Missing code', 400);
  }

  const kvKey = exchangeKvKey(code);
  const stored = await env.RATE_LIMIT.get(kvKey);
  if (!stored) {
    return jsonErr('Invalid or expired code', 400);
  }

  await env.RATE_LIMIT.delete(kvKey);

  let parsed: { jwt?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(stored) as { jwt?: unknown; exp?: unknown };
  } catch {
    return jsonErr('Invalid or expired code', 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = typeof parsed.jwt === 'string' ? parsed.jwt : null;
  const exp = typeof parsed.exp === 'number' ? parsed.exp : 0;

  if (!jwt || exp < now) {
    return jsonErr('Invalid or expired code', 400);
  }

  return new Response(JSON.stringify({ token: jwt }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleOAuthRoutes(
  path: string,
  url: URL,
  request: Request,
  env: OAuthEnv,
): Promise<Response | null> {
  if (path === '/auth/google/start' && request.method === 'GET') {
    return handleStart(url, request, env);
  }
  if (path === '/auth/google/callback' && request.method === 'GET') {
    return handleCallback(url, request, env);
  }
  if (path === '/auth/google/exchange' && request.method === 'POST') {
    return handleExchange(request, env);
  }
  if (path === '/auth/google/disconnect' && request.method === 'POST') {
    return handleDisconnect(request, env);
  }
  if (path === '/auth/google/status' && request.method === 'GET') {
    return handleStatus(request, env);
  }
  return null;
}
