/**
 * CORS origin resolution, security headers, and the shared JSON response helper.
 */
import type { Env } from './env';

export function getAllowedOrigin(env: Env, requestOrigin?: string | null): string {
  const primary = env.FRONTEND_URL || 'https://notarium-site.vercel.app';
  const extras = env.EXTRA_ALLOWED_ORIGINS
    ? env.EXTRA_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];
  const all = [primary, ...extras];
  if (requestOrigin && all.includes(requestOrigin)) return requestOrigin;
  // also allow any vercel preview deploy for this project
  if (requestOrigin && /^https:\/\/notariumm[a-z0-9-]*\.vercel\.app$/.test(requestOrigin))
    return requestOrigin;
  return primary;
}

export function getCorsHeaders(env: Env, requestOrigin?: string | null) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(env, requestOrigin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Encrypted-Yw-ID, X-Is-Login',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

// Ready-made Cache-Control values for opt-in HTTP caching on jsonResponse.
export const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=300';
export const PRIVATE_CACHE = 'private, max-age=60';

export function jsonResponse(
  data: any,
  status: number = 200,
  env?: Env,
  requestOrigin?: string | null,
  cache?: string,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env) {
    Object.assign(headers, getCorsHeaders(env, requestOrigin), SECURITY_HEADERS);
  } else {
    Object.assign(headers, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Encrypted-Yw-ID, X-Is-Login',
    });
  }

  if (cache) {
    headers['Cache-Control'] = cache;
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}
