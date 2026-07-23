import { describe, it, expect } from 'vitest';
import { generatePkcePair, importAesKey, encryptToken, decryptToken } from '../google-oauth.js';

describe('generatePkcePair', () => {
  it('returns a verifier between 43 and 128 chars', async () => {
    const { verifier } = await generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('verifier contains only base64url characters', async () => {
    const { verifier } = await generatePkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('challenge is a non-empty base64url string', async () => {
    const { challenge } = await generatePkcePair();
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('each call produces a unique verifier', async () => {
    const a = await generatePkcePair();
    const b = await generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('AES-GCM encrypt / decrypt', () => {
  function randomBase64Key(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes));
  }

  it('round-trips plaintext', async () => {
    const key = await importAesKey(randomBase64Key());
    const original = 'supersecret-access-token';
    const ct = await encryptToken(key, original);
    const plain = await decryptToken(key, ct);
    expect(plain).toBe(original);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const key = await importAesKey(randomBase64Key());
    const ct1 = await encryptToken(key, 'same');
    const ct2 = await encryptToken(key, 'same');
    expect(ct1).not.toBe(ct2);
  });

  it('throws when decrypting with wrong key', async () => {
    const key1 = await importAesKey(randomBase64Key());
    const key2 = await importAesKey(randomBase64Key());
    const ct = await encryptToken(key1, 'secret');
    await expect(decryptToken(key2, ct)).rejects.toThrow();
  });
});
