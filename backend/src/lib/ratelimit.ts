import type { Env } from './env';
import { MAX_REQUEST_SIZE, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_ATTEMPTS } from './env';

export async function checkRateLimit(
  ip: string,
  endpoint: string,
  env: Env,
  maxAttempts: number = RATE_LIMIT_MAX_ATTEMPTS,
): Promise<boolean> {
  // Prefer the Durable Object limiter — a DO instance is single-threaded, so its
  // read-modify-write is atomic (no burst can slip past like it can with KV).
  if (env.RATE_LIMITER) {
    try {
      const id = env.RATE_LIMITER.idFromName(`${endpoint}:${ip}`);
      const stub = env.RATE_LIMITER.get(id);
      const res = await stub.fetch(`https://rl/?limit=${maxAttempts}&window=${RATE_LIMIT_WINDOW}`);
      const data = (await res.json()) as { allowed?: boolean };
      return data.allowed !== false;
    } catch {
      // DO unavailable — fall through to the KV limiter below.
    }
  }

  // KV fallback (non-atomic sliding window): used when the DO binding is absent
  // (e.g. tests) or the DO call fails. Fails open on any KV error.
  const key = `ratelimit:${endpoint}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - RATE_LIMIT_WINDOW;

  try {
    const attemptsData = await env.RATE_LIMIT.get(key);
    const attempts: number[] = attemptsData ? JSON.parse(attemptsData) : [];
    const recentAttempts = attempts.filter((timestamp) => timestamp > windowStart);

    if (recentAttempts.length >= maxAttempts) {
      return false;
    }
    recentAttempts.push(now);
    await env.RATE_LIMIT.put(key, JSON.stringify(recentAttempts), {
      expirationTtl: RATE_LIMIT_WINDOW,
    });
    return true;
  } catch (error) {
    return true;
  }
}

export function sanitizeAIInput(input: string): string {
  if (!input) return '';
  let sanitized = input
    .replace(/system\s*:/gi, '')
    .replace(/assistant\s*:/gi, '')
    .replace(/user\s*:/gi, '')
    .replace(/<\|.*?\|>/g, '')
    .replace(/\[INST\]|\[\/INST\]/g, '')
    .trim();
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized;
}

export function validateRequestSize(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
    return false;
  }
  return true;
}

/**
 * Enforce MAX_REQUEST_SIZE on the bytes actually received, not only on the
 * Content-Length header (a client can omit it or forge it with a chunked
 * upload). Returns a copy of the request with the body fully buffered — the
 * handlers' `request.json()` would have buffered it anyway — or null once the
 * cap is exceeded, in which case the caller answers 413.
 */
export async function capRequestBody(request: Request): Promise<Request | null> {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_REQUEST_SIZE) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body });
}
