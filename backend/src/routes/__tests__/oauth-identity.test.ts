// The account-creation door. Sign-up is OPEN (owner decision, 27 Oct): any
// Google account may hold a Notarium account, so this no longer asks WHICH
// mailbox it is. What it still asks is whether Google actually proved the
// mailbox, and whether there is an address at all.
//
// This file replaces oauth-domain-lock.test.ts, which pinned the opposite rule.
// Several cases below are kept from it with their expectations inverted on
// purpose: a gmail account and another school's address are now the point, not
// the attack, and the lookalike-domain cases are kept to show that nothing is
// pattern-matching the address any more.
import { describe, it, expect } from 'vitest';
import { checkIdentity } from '../oauth';

const account = (over: Record<string, unknown> = {}) => ({
  email: 'siswa@sekolahkristencalvin.org',
  email_verified: true,
  hd: 'sekolahkristencalvin.org',
  ...over,
});

describe('checkIdentity', () => {
  it('lets a verified school Workspace account in', () => {
    expect(checkIdentity(account())).toEqual({ ok: true });
  });

  it('lets the school address in when Google sends no hd claim', () => {
    const { hd: _hd, ...noHd } = account();
    expect(checkIdentity(noHd)).toEqual({ ok: true });
  });

  it.each([
    ['a gmail account', { email: 'someone@gmail.com', hd: undefined }],
    ['another school', { email: 'a@other.sch.id', hd: 'other.sch.id' }],
    ['a personal domain with no Workspace behind it', { email: 'me@example.net', hd: undefined }],
    // Kept from the domain-lock suite with the expectation inverted: these were
    // the near-miss attacks when the suffix decided who got in. Nothing reads
    // the address shape now, so they are ordinary accounts.
    ['the school domain as a prefix, not a suffix', { email: 'a@sekolahkristencalvin.org.evil.com' }],
    ['the school domain in the local part', { email: 'sekolahkristencalvin.org@gmail.com', hd: undefined }],
    // An hd naming someone else's Workspace used to be a refusal on its own.
    ['an hd claim naming another domain', { hd: 'evil.com' }],
  ])('lets in %s', (_label, over) => {
    expect(checkIdentity(account(over))).toEqual({ ok: true });
  });

  // The two checks that are NOT about which mailbox it is, and must survive
  // opening sign-up.
  it.each([[undefined], [false], ['true']])('refuses email_verified = %s', (verified) => {
    expect(checkIdentity(account({ email_verified: verified }))).toEqual({
      ok: false,
      reason: 'email_unverified',
    });
  });

  it.each([
    ['no email claim at all', undefined],
    ['an email claim that is not a string', 12345],
    ['an empty address', ''],
    ['an address that is only whitespace', '   '],
  ])('refuses %s — the address is the account key', (_label, email) => {
    expect(checkIdentity(account({ email }))).toEqual({ ok: false, reason: 'email_missing' });
  });

  it('checks verification before the address, so an unverified empty token says so', () => {
    expect(checkIdentity(account({ email_verified: false, email: undefined }))).toEqual({
      ok: false,
      reason: 'email_unverified',
    });
  });
});
