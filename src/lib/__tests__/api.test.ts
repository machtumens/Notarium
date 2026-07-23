import { describe, it, expect, beforeEach } from 'vitest';
import api from '../api';

describe('api.isAuthenticated', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns true when a token exists in sessionStorage', () => {
    sessionStorage.setItem('notarium_token', 'test-token-abc');
    expect(api.isAuthenticated()).toBe(true);
  });

  it('returns false when no token is present', () => {
    expect(api.isAuthenticated()).toBe(false);
  });
});
