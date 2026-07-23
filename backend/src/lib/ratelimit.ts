import type { Env } from './env';
import { MAX_REQUEST_SIZE, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_ATTEMPTS } from './env';

export async function checkRateLimit(ip: string, endpoint: string, env: Env): Promise<boolean> {
  const key = `ratelimit:${endpoint}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - RATE_LIMIT_WINDOW;

  try {
    const attemptsData = await env.RATE_LIMIT.get(key);
    const attempts: number[] = attemptsData ? JSON.parse(attemptsData) : [];
    const recentAttempts = attempts.filter((timestamp) => timestamp > windowStart);

    if (recentAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
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
