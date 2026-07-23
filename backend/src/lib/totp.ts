import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { Env } from './env';

// RFC 4648 base32 (no padding) — the encoding authenticator apps expect.
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Generate a new base32 TOTP secret (160 bits). */
export function generateTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

/** otpauth:// provisioning URI — the frontend renders this as a QR code. */
export function buildOtpAuthUri(secret: string, account: string, issuer = 'Notarium'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

async function hotp(secret: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secret);
  // 8-byte big-endian counter.
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    msg[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = sig[19] & 0x0f;
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return (bin % 1_000_000).toString().padStart(6, '0');
}

/**
 * Verify a 6-digit TOTP code against the secret, allowing ±1 step (30s) of
 * clock drift. `nowMs` is injectable for testing.
 */
export async function verifyTotp(
  secret: string,
  code: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const step = Math.floor(nowMs / 1000 / 30);
  for (const drift of [-1, 0, 1]) {
    if ((await hotp(secret, step + drift)) === normalized) return true;
  }
  return false;
}

/** Generate N single-use backup codes (plaintext for the user, bcrypt hashes for storage). */
export async function generateBackupCodes(
  count = 8,
): Promise<{ plain: string[]; hashes: string[] }> {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 100_000_000;
    plain.push(n.toString().padStart(8, '0'));
  }
  const hashes = await Promise.all(plain.map((c) => bcrypt.hash(c, 10)));
  return { plain, hashes };
}

/**
 * Consume a backup code: returns the remaining hashes if `code` matched one,
 * else null. Immutable — never mutates the input array.
 */
export async function consumeBackupCode(code: string, hashes: string[]): Promise<string[] | null> {
  const normalized = code.replace(/\s/g, '');
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalized, hashes[i])) {
      return hashes.filter((_, idx) => idx !== i);
    }
  }
  return null;
}

// Short-lived challenge token issued after password passes but before the
// second factor. Purpose-scoped so it can never be used as a session token.
export async function createMfaChallenge(userId: number, env: Env): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return await new SignJWT({ id: userId, purpose: 'mfa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
}

export async function verifyMfaChallenge(token: string, env: Env): Promise<number | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== 'mfa' || typeof payload.id !== 'number') return null;
    return payload.id;
  } catch {
    return null;
  }
}
