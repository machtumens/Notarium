// Frontend RBAC helpers — the client-side mirror of the backend requireRole
// gates. These decide which dashboards a user can even navigate to.
import { describe, it, expect } from 'vitest';
import { canModerate, canOps } from '../roles';

describe('roles.canModerate', () => {
  it('denies anonymous / null users', () => {
    expect(canModerate(null)).toBe(false);
    expect(canModerate(undefined)).toBe(false);
  });

  it('denies plain students', () => {
    expect(canModerate({ role: 'student' })).toBe(false);
  });

  it('allows super and legacy (null admin_role) admins', () => {
    expect(canModerate({ role: 'admin', admin_role: 'super' })).toBe(true);
    expect(canModerate({ role: 'admin' })).toBe(true); // legacy null = superuser
  });

  it('allows moderators, denies technical-only admins', () => {
    expect(canModerate({ role: 'admin', admin_role: 'moderator' })).toBe(true);
    expect(canModerate({ role: 'admin', admin_role: 'technical' })).toBe(false);
  });
});

describe('roles.canOps', () => {
  it('gates the ops dashboard to super/technical (not moderator)', () => {
    expect(canOps({ role: 'admin', admin_role: 'technical' })).toBe(true);
    expect(canOps({ role: 'admin', admin_role: 'super' })).toBe(true);
    expect(canOps({ role: 'admin' })).toBe(true);
    expect(canOps({ role: 'admin', admin_role: 'moderator' })).toBe(false);
    expect(canOps({ role: 'student' })).toBe(false);
  });
});
