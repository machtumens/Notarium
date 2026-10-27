// The account-creation door: only @sekolahkristencalvin.org may hold a Notarium
// account, and the Google callback is the one path that creates a user without
// ever passing through signupEndpoint's own domain check.
import { describe, it, expect } from 'vitest';
import { checkSchoolIdentity } from '../oauth';

const school = (over: Record<string, unknown> = {}) => ({
  email: 'siswa@sekolahkristencalvin.org',
  email_verified: true,
  hd: 'sekolahkristencalvin.org',
  ...over,
});

describe('checkSchoolIdentity', () => {
  it('lets a verified school Workspace account in', () => {
    expect(checkSchoolIdentity(school())).toEqual({ ok: true });
  });

  it('lets the school address in when Google sends no hd claim', () => {
    const { hd: _hd, ...noHd } = school();
    expect(checkSchoolIdentity(noHd)).toEqual({ ok: true });
  });

  it.each([
    ['a gmail account', { email: 'someone@gmail.com', hd: undefined }],
    ['another school', { email: 'a@other.sch.id', hd: 'other.sch.id' }],
    ['the domain as a prefix, not a suffix', { email: 'a@sekolahkristencalvin.org.evil.com' }],
    ['the domain in the local part', { email: 'sekolahkristencalvin.org@gmail.com', hd: undefined }],
    ['no email claim at all', { email: undefined }],
  ])('refuses %s', (_label, over) => {
    expect(checkSchoolIdentity(school(over))).toEqual({ ok: false, reason: 'domain' });
  });

  it('refuses a school address whose hd says a different domain', () => {
    expect(checkSchoolIdentity(school({ hd: 'evil.com' }))).toEqual({
      ok: false,
      reason: 'domain',
    });
  });

  it.each([[undefined], [false], ['true']])('refuses email_verified = %s', (verified) => {
    expect(checkSchoolIdentity(school({ email_verified: verified }))).toEqual({
      ok: false,
      reason: 'email_unverified',
    });
  });

  it('is case- and whitespace-insensitive about the address', () => {
    expect(checkSchoolIdentity(school({ email: '  Siswa@SekolahKristenCalvin.ORG  ' }))).toEqual({
      ok: true,
    });
  });
});
