import { describe, it, expect } from 'vitest';
import { verifyTotp, base32Encode, generateBackupCodes, consumeBackupCode } from '../totp';

// RFC 6238 test vector: ASCII secret "12345678901234567890", SHA1, T=59s.
// The reference 8-digit TOTP is 94287082 -> 6-digit truncation is 287082.
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('accepts the reference code at the reference time', async () => {
    expect(await verifyTotp(RFC_SECRET, '287082', 59 * 1000)).toBe(true);
  });

  it('rejects a wrong code', async () => {
    expect(await verifyTotp(RFC_SECRET, '000000', 59 * 1000)).toBe(false);
  });

  it('tolerates one step of clock drift', async () => {
    // 287082 is valid for step at T=59s; still accepted 30s earlier via +1 window.
    expect(await verifyTotp(RFC_SECRET, '287082', 29 * 1000)).toBe(true);
  });
});

describe('backup codes', () => {
  it('consumes a valid code once and never mutates the input', async () => {
    const { plain, hashes } = await generateBackupCodes(3);
    const remaining = await consumeBackupCode(plain[0], hashes);
    expect(remaining).not.toBeNull();
    expect(remaining!.length).toBe(2);
    expect(hashes.length).toBe(3); // input untouched
    expect(await consumeBackupCode('99999999', hashes)).toBeNull();
  });
});
