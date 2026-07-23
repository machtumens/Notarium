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

// Subset of index.ts Env relevant to these routes
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

// ─── Scopes ──────────────────────────────────────────────────────────────────

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

// One-time-code exchange (FIX #6): opaque code -> { jwt, exp } stored in the
// RATE_LIMIT KV, single-use, short-lived.
const EXCHANGE_TTL_SECONDS = 60;
const EXCHANGE_KV_PREFIX = 'oauth_exchange:';

function exchangeKvKey(code: string): string {
  return `${EXCHANGE_KV_PREFIX}${code}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function feBase(env: OAuthEnv): string {
  return (env.FRONTEND_URL ?? 'https://notarium-site.vercel.app').replace(/\/$/, '');
}

/**
 * Guard against open redirects. Accepts ONLY:
 *  - a same-origin relative path (starts with a single '/', not '//')
 *  - an absolute URL whose origin exactly equals feBase(env)
 * Anything else (protocol-relative, foreign origin, javascript:, malformed)
 * falls back to the default frontend URL.
 */
function sanitizeRedirect(candidate: string | null | undefined, env: OAuthEnv): string {
  const fallback = feBase(env);
  if (!candidate) return fallback;

  // Same-origin relative path: single leading slash, not protocol-relative ('//'),
  // and no backslash (browsers normalize '/\evil.com' to 'https://evil.com/').
  if (candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.includes('\\')) {
    return candidate;
  }

  // Absolute URL: origin must exactly match the configured frontend origin.
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
  payload: { id: number; email: string; role: string },
  env: OAuthEnv,
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

// Cached remote JWK set for Google's OAuth signing keys. createRemoteJWKSet
// returns a function that fetches + caches the keys, so we build it once.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Cryptographically verify a Google id_token: checks the RS256 signature
 * against Google's published JWKS and asserts issuer + audience. Returns the
 * verified payload, or throws when the token is forged/invalid/expired.
 */
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

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleStart(url: URL, request: Request, env: OAuthEnv): Promise<Response> {
  const intent = url.searchParams.get('intent') ?? '';
  const rawRedirectTo = url.searchParams.get('redirect_to');
  // Validate before storing: only same-origin/relative destinations survive.
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

  // Single-use: delete before any further processing
  await env.DB.prepare(`DELETE FROM oauth_states WHERE state = ?`).bind(state).run();

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
    return errorRedirect(env, 'token_exchange_failed');
  }

  if (!tokens.idToken) {
    console.error('[oauth] id_token missing from token response');
    return errorRedirect(env, 'id_token_missing');
  }

  let idPayload: JWTPayload;
  try {
    idPayload = await verifyIdToken(tokens.idToken, env);
  } catch (err: unknown) {
    console.error(
      '[oauth] id_token verification failed:',
      err instanceof Error ? err.message : err,
    );
    return errorRedirect(env, 'id_token_invalid');
  }

  // Validate aud and iss
  if (idPayload.aud !== env.GOOGLE_CLIENT_ID) {
    console.error('[oauth] id_token aud mismatch');
    return errorRedirect(env, 'id_token_aud_mismatch');
  }
  if (!GOOGLE_ISSUERS.has(idPayload.iss as string)) {
    console.error('[oauth] id_token iss invalid:', idPayload.iss);
    return errorRedirect(env, 'id_token_iss_invalid');
  }

  const email = idPayload.email as string | undefined;
  const sub = idPayload.sub as string | undefined;

  if (!email || !sub) {
    return errorRedirect(env, 'id_token_missing_claims');
  }

  const { intent } = stateRow;

  if (intent === 'signup') {
    // Find or create user by email
    let user = (await env.DB.prepare(`SELECT id, email, role FROM users WHERE email = ?`)
      .bind(email)
      .first()) as { id: number; email: string; role: string } | null;

    if (!user) {
      const name = (idPayload.name as string | undefined) ?? email.split('@')[0];
      const picture = (idPayload.picture as string | undefined) ?? null;
      user = (await env.DB.prepare(
        `INSERT INTO users (encrypted_yw_id, display_name, email, photo_url, google_id, oauth_provider, role, created_at)
         VALUES (?, ?, ?, ?, ?, 'google', 'student', datetime('now'))
         RETURNING id, email, role`,
      )
        .bind(`google_${sub}`, name, email, picture, sub)
        .first()) as { id: number; email: string; role: string };
    }

    if (!user) {
      console.error('[oauth] failed to find or create user for email:', email);
      return errorRedirect(env, 'user_create_failed');
    }

    const jwt = await issueJwt({ id: user.id, email: user.email, role: user.role }, env);

    // One-time-code exchange: never put the JWT in the redirect URL (it would
    // leak into browser history / server logs / Referer). Instead store the JWT
    // under a random opaque code in KV (single-use, 60s TTL) and redirect with
    // the code. The frontend exchanges it via POST /auth/google/exchange.
    const oneTimeCode = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
    await env.RATE_LIMIT.put(
      exchangeKvKey(oneTimeCode),
      JSON.stringify({ jwt, exp: now + EXCHANGE_TTL_SECONDS }),
      { expirationTtl: EXCHANGE_TTL_SECONDS },
    );

    // signup flow always lands on the frontend auth callback route.
    return Response.redirect(`${feBase(env)}/auth/callback?code=${oneTimeCode}`, 302);
  }

  // classroom | docs: require existing user from state
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

  // Re-validate at use time (defense-in-depth against a tampered stored value).
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
      // Log but don't block — still delete the local row
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
  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return jsonErr('Invalid JSON body', 400);
  }

  const code = typeof body.code === 'string' ? body.code : null;
  if (!code) {
    return jsonErr('Missing code', 400);
  }

  const kvKey = exchangeKvKey(code);
  const stored = await env.RATE_LIMIT.get(kvKey);
  if (!stored) {
    return jsonErr('Invalid or expired code', 400);
  }

  // Single-use: delete immediately so a replayed code cannot be reused.
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

// ─── Public mount point ───────────────────────────────────────────────────────

/**
 * Call from index.ts _handle(). Returns a Response when path matches, null otherwise.
 */
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
