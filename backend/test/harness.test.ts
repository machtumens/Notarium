import { beforeAll, describe, expect, it } from 'vitest';
import { api, initTestDatabase, json, signup } from './setup';

beforeAll(initTestDatabase);

describe('test harness', () => {
  it('boots the Worker against the local D1 and KV bindings', async () => {
    const res = await api('/test');
    expect(res.status).toBe(200);
    expect((await json(res)).message).toBe('Worker is running');
  });

  it('signup() returns a JWT that /api/auth/me accepts', async () => {
    const session = await signup();
    expect(session.token.split('.')).toHaveLength(3);
    const me = await api('/api/auth/me', { token: session.token });
    expect(me.status).toBe(200);
    expect((await json(me)).user.email).toBe(session.user.email);
  });
});
