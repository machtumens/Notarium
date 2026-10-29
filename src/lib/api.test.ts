import { describe, expect, it, vi } from 'vitest';
import { ApiError, api, apiRequest, noteText, onUnauthorized, refreshToken, token } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
/** Every fetch gets the same answer; returns the mock so headers can be inspected. */
function answer(res: Response | Error) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    res instanceof Error ? Promise.reject(res) : Promise.resolve(res),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('request', () => {
  it('sends the bearer token only when one is stored', async () => {
    const fetchMock = answer(json(200, { subjects: [] }));
    await api.subjects();
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
    token.set('tok');
    await api.subjects();
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('turns a network failure into status 0 with the connection copy', async () => {
    answer(new TypeError('Failed to fetch'));
    const err = await api.subjects().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 0,
      message: 'Could not reach Notarium. Check your connection and try again.',
    });
  });
});

describe('onUnauthorized', () => {
  it('fires once for a 401 that carried a token, and the call rejects with the expired-session copy', async () => {
    token.set('tok');
    answer(json(401, { error: 'Unauthorized' }));
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).rejects.toMatchObject({
      status: 401,
      message: 'Your session has expired. Sign in again.',
    });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('stays quiet for a 401 with no token, so sign-in keeps the worker wording', async () => {
    answer(json(401, { error: 'Invalid email or password' }));
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.auth.login('arga@sman4.sch.id', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('stays quiet for other failures with a token', async () => {
    token.set('tok');
    answer(json(500, { error: 'boom' }));
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).rejects.toMatchObject({
      status: 500,
      message: 'Notarium is having trouble right now. Try again in a minute.',
    });
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('stops notifying after unsubscribe', async () => {
    token.set('tok');
    answer(json(401, { error: 'Unauthorized' }));
    const cb = vi.fn();
    onUnauthorized(cb)();
    await expect(api.notes.mine()).rejects.toBeInstanceOf(ApiError);
    expect(cb).not.toHaveBeenCalled();
  });
});

/** Path-aware fetch stub: each route answers from the request init, so it can differ by bearer. Unlisted paths → 404. */
function routes(table: Record<string, (init?: RequestInit) => Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const route = table[new URL(String(input)).pathname];
    return Promise.resolve(route ? route(init) : json(404, { error: 'Not found' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const bearer = (init?: RequestInit) =>
  (init?.headers as Record<string, string> | undefined)?.Authorization;
const callsTo = (fetchMock: ReturnType<typeof routes>, path: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === path);
const bodyOf = (call: [input: RequestInfo | URL, init?: RequestInit]) =>
  JSON.parse(String(call[1]?.body));

describe('refresh once on 401 (W2.2a)', () => {
  it('refreshes once and replays with the new token — two concurrent 401s share one refresh call', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/notes/my-notes': (init) =>
        bearer(init) === 'Bearer new'
          ? json(200, { notes: [{ id: 1 }] })
          : json(401, { error: 'Invalid or expired token' }),
      // Two different GETs: identical ones are now merged into one request by the GET cache.
      '/api/subjects': (init) =>
        bearer(init) === 'Bearer new'
          ? json(200, { subjects: [{ id: 2 }] })
          : json(401, { error: 'Invalid or expired token' }),
      '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    const [a, b] = await Promise.all([api.notes.mine(), api.subjects()]);
    expect(a).toEqual([{ id: 1 }]);
    expect(b).toEqual([{ id: 2 }]);
    const refreshCalls = callsTo(fetchMock, '/api/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
    expect(bodyOf(refreshCalls[0])).toEqual({ refreshToken: 'rt1' });
    expect(bearer(refreshCalls[0][1])).toBeUndefined();
    // two originals with the dead token, two replays with the new one
    const notes = [
      ...callsTo(fetchMock, '/api/notes/my-notes'),
      ...callsTo(fetchMock, '/api/subjects'),
    ].map(([, init]) => bearer(init));
    expect(notes.filter((h) => h === 'Bearer old')).toHaveLength(2);
    expect(notes.filter((h) => h === 'Bearer new')).toHaveLength(2);
    expect(localStorage.getItem('token')).toBe('new');
    expect(localStorage.getItem('refreshToken')).toBe('rt2');
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('replays exactly once: a 401 on the replay ends the session instead of refreshing again', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/notes/my-notes': () => json(401, { error: 'Invalid or expired token' }),
      '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).rejects.toMatchObject({
      status: 401,
      message: 'Your session has expired. Sign in again.',
    });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    expect(callsTo(fetchMock, '/api/notes/my-notes')).toHaveLength(2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    off();
  });

  it('when the refresh is rejected: clears both tokens, notifies once, rejects with the ORIGINAL 401', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/notes/my-notes': () => json(401, { error: 'Invalid or expired token' }),
      '/api/auth/refresh': () => json(401, { error: 'Invalid or expired refresh token' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    const err = await api.notes.mine().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, message: 'Your session has expired. Sign in again.' });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    expect(callsTo(fetchMock, '/api/notes/my-notes')).toHaveLength(1); // no replay
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('a refresh that comes back without a token pair counts as rejected', async () => {
    token.set('old');
    refreshToken.set('rt1');
    routes({
      '/api/notes/my-notes': () => json(401, { error: 'x' }),
      '/api/auth/refresh': () => json(200, { ok: true }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('with no refresh token stored (older session) a 401 still signs out without calling refresh', async () => {
    token.set('old');
    const fetchMock = routes({
      '/api/notes/my-notes': () => json(401, { error: 'x' }),
      '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).rejects.toMatchObject({ status: 401 });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(0);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('a credential 401 never refreshes, never signs out, and leaves the stored tokens alone', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/auth/login': () => json(401, { error: 'Invalid email or password' }),
      '/api/auth/signup': () => json(401, { error: 'nope' }),
      '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.auth.login('arga@sman4.sch.id', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
    await expect(api.auth.signup('arga@sman4.sch.id', 'x', 'Arga')).rejects.toMatchObject({
      status: 401,
    });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(0);
    expect(cb).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('old');
    expect(localStorage.getItem('refreshToken')).toBe('rt1');
    off();
  });

  it('other failures never refresh', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/notes/my-notes': () => json(500, { error: 'boom' }),
      '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
    });
    await expect(api.notes.mine()).rejects.toMatchObject({ status: 500 });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(0);
    expect(localStorage.getItem('token')).toBe('old');
  });
});

describe('refresh token storage (W2.2a)', () => {
  it('login and signup keep the refresh token the worker hands out, next to the access token key', async () => {
    routes({
      '/api/auth/login': () =>
        json(200, { success: true, token: 'jwt-login', refreshToken: 'rt-login', user: { id: 1 } }),
      '/api/auth/signup': () =>
        json(201, { token: 'jwt-signup', refreshToken: 'rt-signup', user: { id: 2 } }),
    });
    const login = await api.auth.login('arga@sman4.sch.id', 'pw');
    expect(login).toMatchObject({ token: 'jwt-login', refreshToken: 'rt-login' });
    expect(localStorage.getItem('refreshToken')).toBe('rt-login');
    const signup = await api.auth.signup('baru@sman4.sch.id', 'pw', 'Baru');
    expect(signup).toMatchObject({ token: 'jwt-signup' });
    expect(localStorage.getItem('refreshToken')).toBe('rt-signup');
  });

  it('tolerates a worker that sends no refreshToken (older deploy): nothing is stored, sign-in still works', async () => {
    refreshToken.set('stale-from-before');
    routes({
      '/api/auth/login': () => json(200, { success: true, token: 'jwt', user: { id: 1 } }),
    });
    await expect(api.auth.login('arga@sman4.sch.id', 'pw')).resolves.toMatchObject({
      token: 'jwt',
    });
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('refreshToken helper mirrors token: get/set/clear on localStorage under `refreshToken`', () => {
    expect(refreshToken.get()).toBeNull();
    refreshToken.set('rt');
    expect(localStorage.getItem('refreshToken')).toBe('rt');
    expect(refreshToken.get()).toBe('rt');
    refreshToken.clear();
    expect(refreshToken.get()).toBeNull();
  });
});

describe('logout (W2.2a)', () => {
  it('posts the stored refresh token with the bearer', async () => {
    token.set('tok');
    refreshToken.set('rt1');
    const fetchMock = routes({ '/api/auth/logout': () => json(200, { success: true }) });
    await expect(api.auth.logout()).resolves.toEqual({ success: true });
    const [call] = callsTo(fetchMock, '/api/auth/logout');
    expect(call[1]?.method).toBe('POST');
    expect(bearer(call[1])).toBe('Bearer tok');
    expect(bodyOf(call)).toEqual({ refreshToken: 'rt1' });
  });

  it('sends an empty body when no refresh token is stored (the worker then revokes every family)', async () => {
    token.set('tok');
    const fetchMock = routes({ '/api/auth/logout': () => json(200, { success: true }) });
    await api.auth.logout();
    expect(bodyOf(callsTo(fetchMock, '/api/auth/logout')[0])).toEqual({});
  });

  it('a 401 on logout is refreshed and replayed like any other call, but never notifies onUnauthorized', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/auth/logout': (init) =>
        bearer(init) === 'Bearer new' ? json(200, { success: true }) : json(401, { error: 'x' }),
      '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.auth.logout()).resolves.toEqual({ success: true });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('a logout whose refresh is rejected clears both tokens without notifying (the caller is already signing out)', async () => {
    token.set('old');
    refreshToken.set('rt1');
    routes({
      '/api/auth/logout': () => json(401, { error: 'x' }),
      '/api/auth/refresh': () => json(401, { error: 'x' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.auth.logout()).rejects.toMatchObject({ status: 401 });
    expect(cb).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    off();
  });
});

describe('refresh outcomes are tri-state (W2.3e)', () => {
  const deadToken = () => json(401, { error: 'Invalid or expired token' });

  it.each([
    [
      429,
      { error: 'Too many refresh attempts. Please try again in 15 minutes.' },
      'Too many requests — wait a moment.',
    ],
    [503, { error: 'upstream' }, 'Notarium is having trouble right now. Try again in a minute.'],
  ])(
    'a %s from refresh is "unavailable": both keys and the session stay, nobody is notified, the transient error surfaces',
    async (status, body, message) => {
      token.set('old');
      refreshToken.set('rt1');
      const fetchMock = routes({
        '/api/notes/my-notes': deadToken,
        '/api/auth/refresh': () => json(status, body),
      });
      const cb = vi.fn();
      const off = onUnauthorized(cb);
      await expect(api.notes.mine()).rejects.toMatchObject({ status, message });
      expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
      expect(callsTo(fetchMock, '/api/notes/my-notes')).toHaveLength(1); // no replay
      expect(localStorage.getItem('token')).toBe('old');
      expect(localStorage.getItem('refreshToken')).toBe('rt1');
      expect(cb).not.toHaveBeenCalled();
      // the next call tries again from the same keys (nothing was thrown away)
      routes({
        '/api/notes/my-notes': (init) =>
          bearer(init) === 'Bearer new' ? json(200, { notes: [] }) : deadToken(),
        '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
      });
      await expect(api.notes.mine()).resolves.toEqual([]);
      expect(localStorage.getItem('refreshToken')).toBe('rt2');
      off();
    },
  );

  it('a network failure during refresh is "unavailable" too: keys stay, the connection copy surfaces', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      new URL(String(input)).pathname === '/api/auth/refresh'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(deadToken()),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach Notarium. Check your connection and try again.',
    });
    expect(localStorage.getItem('token')).toBe('old');
    expect(localStorage.getItem('refreshToken')).toBe('rt1');
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('a 400 from refresh is "rejected" like a 401: both keys go, subscribers hear it, the original 401 is thrown', async () => {
    token.set('old');
    refreshToken.set('rt1');
    routes({
      '/api/notes/my-notes': deadToken,
      '/api/auth/refresh': () => json(400, { error: 'Invalid input' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).rejects.toMatchObject({
      status: 401,
      message: 'Your session has expired. Sign in again.',
    });
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('a logout whose refresh is unavailable keeps both keys (the store drops them) and rejects with the transient error', async () => {
    token.set('old');
    refreshToken.set('rt1');
    routes({
      '/api/auth/logout': () => json(401, { error: 'x' }),
      '/api/auth/refresh': () => json(429, { error: 'slow down' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.auth.logout()).rejects.toMatchObject({ status: 429 });
    expect(localStorage.getItem('token')).toBe('old');
    expect(localStorage.getItem('refreshToken')).toBe('rt1');
    expect(cb).not.toHaveBeenCalled();
    off();
  });
});

describe('other tabs rotate too (W2.3e)', () => {
  /** What the worker says to a refresh token another tab already rotated: 401, family kept (backend W2.3b). */
  const staleRefresh = () => json(401, { error: 'Invalid or expired refresh token' });
  const byBearer = (init?: RequestInit) =>
    bearer(init) === 'Bearer tab2-jwt'
      ? json(200, { notes: [{ id: 7 }] })
      : json(401, { error: 'Invalid or expired token' });

  it('another tab rotated while our refresh was in flight: its pair is kept, no sign-out, the replay uses its token, one refresh call', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/notes/my-notes': byBearer,
      '/api/auth/refresh': () => {
        localStorage.setItem('token', 'tab2-jwt');
        localStorage.setItem('refreshToken', 'tab2-rt');
        return staleRefresh();
      },
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).resolves.toEqual([{ id: 7 }]);
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    expect(callsTo(fetchMock, '/api/notes/my-notes').map(([, init]) => bearer(init))).toEqual([
      'Bearer old',
      'Bearer tab2-jwt',
    ]);
    expect(localStorage.getItem('token')).toBe('tab2-jwt');
    expect(localStorage.getItem('refreshToken')).toBe('tab2-rt');
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('the token changed under the request itself: replay straight away, no refresh call at all', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/notes/my-notes': (init) => {
        if (bearer(init) === 'Bearer old') {
          localStorage.setItem('token', 'tab2-jwt');
          localStorage.setItem('refreshToken', 'tab2-rt');
        }
        return byBearer(init);
      },
      '/api/auth/refresh': () => json(200, { token: 'never', refreshToken: 'never' }),
    });
    await expect(api.notes.mine()).resolves.toEqual([{ id: 7 }]);
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(0);
    expect(callsTo(fetchMock, '/api/notes/my-notes').map(([, init]) => bearer(init))).toEqual([
      'Bearer old',
      'Bearer tab2-jwt',
    ]);
    expect(localStorage.getItem('token')).toBe('tab2-jwt');
  });

  it('the rotation runs under the `notarium-refresh` Web Lock when the browser has one, and a pair rotated by another tab while we waited is used without a request', async () => {
    token.set('old');
    refreshToken.set('rt1');
    const request = vi.fn(async (_name: string, cb: () => Promise<unknown>) => {
      // another tab held the lock first and rotated
      localStorage.setItem('token', 'tab2-jwt');
      localStorage.setItem('refreshToken', 'tab2-rt');
      return cb();
    });
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const fetchMock = routes({
      '/api/notes/my-notes': byBearer,
      '/api/auth/refresh': () => json(200, { token: 'never', refreshToken: 'never' }),
    });
    await expect(api.notes.mine()).resolves.toEqual([{ id: 7 }]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('notarium-refresh');
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(0);
    expect(localStorage.getItem('refreshToken')).toBe('tab2-rt');
  });

  it("keys cleared by another tab (it signed out): a 401 here still ends this tab's session, without calling refresh", async () => {
    token.set('old');
    refreshToken.set('rt1');
    const fetchMock = routes({
      '/api/notes/my-notes': () => {
        localStorage.clear();
        return json(401, { error: 'Invalid or expired token' });
      },
      '/api/auth/refresh': () => json(200, { token: 'never', refreshToken: 'never' }),
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).rejects.toMatchObject({
      status: 401,
      message: 'Your session has expired. Sign in again.',
    });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(0);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBeNull();
    off();
  });

  it('a rejected refresh never wipes keys another tab wrote in the meantime', async () => {
    token.set('old');
    refreshToken.set('rt1');
    // the worker refuses our token; by then another tab has a fresh pair and our replay must use it
    routes({
      '/api/notes/my-notes': byBearer,
      '/api/auth/refresh': () => {
        localStorage.setItem('token', 'tab2-jwt');
        localStorage.setItem('refreshToken', 'tab2-rt');
        return json(400, { error: 'Invalid input' });
      },
    });
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    await expect(api.notes.mine()).resolves.toEqual([{ id: 7 }]);
    expect(localStorage.getItem('token')).toBe('tab2-jwt');
    expect(localStorage.getItem('refreshToken')).toBe('tab2-rt');
    expect(cb).not.toHaveBeenCalled();
    off();
  });
});

describe('opting in to short sessions (W2.3e)', () => {
  it('login and signup send X-Notarium-Session: refresh; other calls do not', async () => {
    const fetchMock = routes({
      '/api/auth/login': () =>
        json(200, { success: true, token: 'jwt', refreshToken: 'rt', user: { id: 1 } }),
      '/api/auth/signup': () => json(201, { token: 'jwt', refreshToken: 'rt', user: { id: 2 } }),
      '/api/subjects': () => json(200, { subjects: [] }),
      '/api/auth/me': () => json(200, { user: { id: 1 } }),
    });
    await api.auth.login('arga@sman4.sch.id', 'pw');
    await api.auth.signup('baru@sman4.sch.id', 'pw', 'Baru');
    await api.subjects();
    await api.auth.me();
    const header = (path: string) =>
      (callsTo(fetchMock, path)[0][1]?.headers as Record<string, string>)['X-Notarium-Session'];
    expect(header('/api/auth/login')).toBe('refresh');
    expect(header('/api/auth/signup')).toBe('refresh');
    expect(header('/api/subjects')).toBeUndefined();
    expect(header('/api/auth/me')).toBeUndefined();
    // and the opt-in never leaks a stale bearer onto the credential call
    expect(bearer(callsTo(fetchMock, '/api/auth/login')[0][1])).toBeUndefined();
  });
});

describe('main lineage shapes (R1)', () => {
  const ME = {
    id: 1,
    email: 'arga@sekolahkristencalvin.org',
    name: 'Arga',
    class: '10.1',
    role: 'student',
    notes_count: 0,
    total_likes: 0,
    total_admin_upvotes: 0,
    points: 0,
    photo_url: null,
  };

  it('login: main answers {success, token, user} and never a refreshToken — the session is the token alone', async () => {
    refreshToken.set('stale');
    routes({ '/api/auth/login': () => json(200, { success: true, token: 'jwt', user: ME }) });
    await expect(api.auth.login('arga@sekolahkristencalvin.org', 'pw')).resolves.toMatchObject({
      token: 'jwt',
      user: { id: 1 },
    });
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('login: a 2FA challenge (200 with requires_2fa and no token) rejects instead of opening a session without a token', async () => {
    routes({ '/api/auth/login': () => json(200, { requires_2fa: true, challenge: 'c1' }) });
    const err = await api.auth
      .login('arga@sekolahkristencalvin.org', 'pw')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/two-factor/i);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('signup: main answers 201 {token, user} with no success field and no refreshToken', async () => {
    routes({ '/api/auth/signup': () => json(201, { token: 'jwt', user: ME }) });
    await expect(
      api.auth.signup('arga@sekolahkristencalvin.org', 'password1', 'Arga', '10.1'),
    ).resolves.toMatchObject({ token: 'jwt', user: { id: 1 } });
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it("leaderboard: points is main's learning_points (what the board is ranked by), falling back to its notes+likes+upvotes sum", async () => {
    routes({
      '/api/leaderboard': () =>
        json(200, {
          leaderboard: [
            {
              display_name: 'Nadia',
              photo_url: null,
              class: '10.1',
              notes_uploaded: 1,
              total_likes: 2,
              total_admin_upvotes: 0,
              learning_points: 42,
              current_streak: 3,
              points: 3,
            },
            {
              display_name: 'Bima',
              photo_url: null,
              class: null,
              notes_uploaded: 2,
              total_likes: 5,
              total_admin_upvotes: 1,
              learning_points: null,
              current_streak: 0,
              points: 8,
            },
            {
              display_name: 'Old',
              class: null,
              notes_uploaded: 1,
              total_likes: 1,
              total_admin_upvotes: 1,
            },
          ],
        }),
    });
    const board = await api.leaderboard();
    expect(board.map((l) => [l.display_name, l.points])).toEqual([
      ['Nadia', 42],
      ['Bima', 8],
      ['Old', 3],
    ]);
  });

  it("notes.like resolves to main's {liked}", async () => {
    token.set('tok');
    routes({ '/api/notes/7/like': () => json(200, { liked: true }) });
    await expect(api.notes.like(7)).resolves.toEqual({ liked: true });
  });

  it('noteText reads the body the way main stores it: extracted_text first, then content, then description', () => {
    const base = {
      id: 1,
      title: 't',
      subject_id: 1,
      tags: null,
      likes: 0,
      admin_upvotes: 0,
      created_at: '2026-09-20T00:00:00Z',
      status: 'published',
      visibility: 'everyone',
    };
    // a my-notes row: no content, no description
    expect(noteText({ ...base, extracted_text: 'from ocr', summary: null })).toBe('from ocr');
    // a note this app wrote before it mirrored the text into extracted_text
    expect(
      noteText({ ...base, extracted_text: '', content: '## Konsep', description: 'short' }),
    ).toBe('## Konsep');
    expect(noteText({ ...base, extracted_text: null, content: null, description: 'short' })).toBe(
      'short',
    );
    expect(noteText({ ...base })).toBe('');
  });
});

describe('notes.create against main (R3)', () => {
  const NOTE = {
    id: 9,
    title: 'Stoikiometri',
    subject_id: 14,
    tags: '["remix-ok"]',
    likes: 0,
    admin_upvotes: 0,
    created_at: '2026-09-20T10:00:00Z',
    status: 'published',
    visibility: 'class',
    extracted_text: 'Mol.',
    content: 'Mol.',
    description: 'Mol.',
  };

  it("resolves with main's {note, notes, success, totalParts} when a row was written", async () => {
    token.set('tok');
    routes({
      '/api/notes': () => json(200, { note: NOTE, notes: [NOTE], success: true, totalParts: 1 }),
    });
    await expect(
      api.notes.create({
        title: 'Stoikiometri',
        content: 'Mol.',
        extracted_text: 'Mol.',
        description: 'Mol.',
        subject_id: 14,
        tags: ['remix-ok'],
        status: 'published',
        visibility: 'class',
      }),
    ).resolves.toMatchObject({ note: { id: 9 }, totalParts: 1 });
  });

  it('rejects when main answers success with no note — it stores nothing for a text-only note today — so the editor never flashes a false "Published"', async () => {
    token.set('tok');
    routes({ '/api/notes': () => json(200, { notes: [], success: true, totalParts: 0 }) });
    const err = await api.notes
      .create({
        title: 'Stoikiometri',
        content: 'Mol.',
        extracted_text: 'Mol.',
        subject_id: 14,
        status: 'published',
        visibility: 'class',
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/did not save/i);
  });
});

describe('GET cache', () => {
  it('merges repeat GETs, and a write makes the next GET go out again', async () => {
    token.set('t');
    const fetchMock = routes({
      '/api/subjects': () => json(200, { subjects: [{ id: 1 }] }),
      '/api/notes': () => json(201, { id: 9 }),
    });
    await Promise.all([api.subjects(), api.subjects()]);
    await api.subjects();
    expect(callsTo(fetchMock, '/api/subjects')).toHaveLength(1);
    await apiRequest('/api/notes', { method: 'POST', body: {} });
    await api.subjects();
    expect(callsTo(fetchMock, '/api/subjects')).toHaveLength(2);
  });
});
