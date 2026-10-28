import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, type User } from '@/lib/api';
import { AI_SEED, AppProvider, useApp } from '@/store';

// Only the auth calls are faked; `token` (localStorage) and `ApiError` stay real.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { ...actual.api, auth: { login: vi.fn(), signup: vi.fn(), me: vi.fn(), logout: vi.fn() } },
  };
});
const auth = vi.mocked(api.auth);

const USER: User = {
  id: 1,
  email: 'arga@sman4.sch.id',
  name: 'Arga Pratama',
  class: '10A',
  role: 'student',
  points: 0,
  notes_count: 0,
  total_likes: 0,
  total_admin_upvotes: 0,
  photo_url: null,
};

const mount = () => renderHook(() => useApp(), { wrapper: AppProvider });
const settled = async (r: ReturnType<typeof mount>) => {
  await waitFor(() => expect(r.result.current.sessionChecked).toBe(true));
  return r;
};

beforeEach(() => {
  auth.me.mockReset();
  auth.signup.mockReset();
  auth.login.mockReset();
  auth.logout.mockReset();
  auth.logout.mockResolvedValue({ success: true });
});

describe('store bootstrap', () => {
  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useApp())).toThrow('useApp outside AppProvider');
  });

  it('finishes the session check with no session when nothing is stored', async () => {
    const { result } = await settled(mount());
    expect(result.current.session).toBeNull();
    expect(auth.me).not.toHaveBeenCalled();
  });

  it('restores the account behind a stored token', async () => {
    localStorage.setItem('token', 'tok');
    auth.me.mockResolvedValue({ user: USER });
    const { result } = await settled(mount());
    expect(result.current.session).toEqual({ kind: 'user', user: USER });
    expect(result.current.learner).toBe('Arga');
    expect(result.current.isUser).toBe(true);
  });

  it('drops a stored token the worker rejects and stays signed out', async () => {
    localStorage.setItem('token', 'stale');
    auth.me.mockRejectedValue(new ApiError('Your session has expired. Sign in again.', 401));
    const { result } = await settled(mount());
    expect(result.current.session).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('drops the refresh token too when the bootstrap check fails for good', async () => {
    localStorage.setItem('token', 'stale');
    localStorage.setItem('refreshToken', 'rt-stale');
    auth.me.mockRejectedValue(new ApiError('Your session has expired. Sign in again.', 401));
    const { result } = await settled(mount());
    expect(result.current.session).toBeNull();
    expect(result.current.offline).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  // W5.4: only a verdict ends the session. No verdict (the worker could not be reached, or answered 429 / 5xx) keeps both keys.
  it.each([
    [503, 'Notarium is having trouble right now. Try again in a minute.'],
    [429, 'Too many requests — wait a moment.'],
    [0, 'Could not reach Notarium. Check your connection and try again.'],
  ])(
    'keeps both keys when the bootstrap check gets no verdict (%s): signed out for now, flagged offline',
    async (status, message) => {
      localStorage.setItem('token', 'tok');
      localStorage.setItem('refreshToken', 'rt1');
      auth.me.mockRejectedValue(new ApiError(message, status));
      const { result } = await settled(mount());
      expect(result.current).toMatchObject({ session: null, isUser: false, offline: true });
      expect(localStorage.getItem('token')).toBe('tok');
      expect(localStorage.getItem('refreshToken')).toBe('rt1');
    },
  );

  it('recheckSession runs the check again: an answer opens the account and clears offline', async () => {
    localStorage.setItem('token', 'tok');
    auth.me
      .mockRejectedValueOnce(
        new ApiError('Notarium is having trouble right now. Try again in a minute.', 503),
      )
      .mockResolvedValueOnce({ user: USER });
    const { result } = await settled(mount());
    expect(result.current.offline).toBe(true);
    let opened = false;
    await act(async () => {
      opened = await result.current.recheckSession();
    });
    expect(opened).toBe(true);
    expect(result.current).toMatchObject({
      session: { kind: 'user', user: USER },
      learner: 'Arga',
      offline: false,
      sessionChecked: true,
    });
    expect(auth.me).toHaveBeenCalledTimes(2);
  });

  it('a recheck that is still unanswered keeps the token and stays offline', async () => {
    localStorage.setItem('token', 'tok');
    auth.me.mockRejectedValue(
      new ApiError('Could not reach Notarium. Check your connection and try again.', 0),
    );
    const { result } = await settled(mount());
    let opened = true;
    await act(async () => {
      opened = await result.current.recheckSession();
    });
    expect(opened).toBe(false);
    expect(result.current).toMatchObject({ session: null, offline: true });
    expect(localStorage.getItem('token')).toBe('tok');
  });

  it('a recheck that comes back 401 drops the keys and clears offline, so the sign-in form takes over', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('refreshToken', 'rt1');
    auth.me
      .mockRejectedValueOnce(
        new ApiError('Notarium is having trouble right now. Try again in a minute.', 503),
      )
      .mockRejectedValueOnce(new ApiError('Your session has expired. Sign in again.', 401));
    const { result } = await settled(mount());
    let opened = true;
    await act(async () => {
      opened = await result.current.recheckSession();
    });
    expect(opened).toBe(false);
    expect(result.current).toMatchObject({ session: null, offline: false });
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

describe('session transitions', () => {
  it('signIn opens the account, stores the token and resets the study context', async () => {
    const { result } = await settled(mount());
    act(() => result.current.setCtx('exam'));
    expect(result.current).toMatchObject({ ctx: 'exam', mode: 'Exam' });

    act(() => result.current.signIn(USER, 'tok'));
    expect(localStorage.getItem('token')).toBe('tok');
    expect(result.current).toMatchObject({
      session: { kind: 'user', user: USER },
      learner: 'Arga',
      isUser: true,
      sessionChecked: true,
      ctx: 'normal',
      mode: 'Study',
    });
  });

  it('continueAsGuest opens the demo without a token', async () => {
    const { result } = await settled(mount());
    act(() => result.current.setCtx('exam'));
    act(() => result.current.continueAsGuest());
    expect(result.current).toMatchObject({
      session: { kind: 'guest' },
      isUser: false,
      sessionChecked: true,
      learner: 'Arga',
      ctx: 'normal',
      mode: 'Study',
    });
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('signOut ends the session on screen at once and clears the token once the worker has been told', async () => {
    localStorage.setItem('refreshToken', 'rt1');
    const { result } = await settled(mount());
    act(() => result.current.signIn(USER, 'tok'));
    act(() => result.current.signOut());
    expect(result.current).toMatchObject({ session: null, isUser: false, sessionChecked: true });
    expect(auth.logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull());
  });

  it('signOut with no refresh token stored (a 24-hour token from main, which has no /api/auth/logout) is local only: no worker call, keys gone at once', async () => {
    const { result } = await settled(mount());
    act(() => result.current.signIn(USER, 'tok'));
    act(() => result.current.signOut());
    expect(result.current).toMatchObject({ session: null, isUser: false, sessionChecked: true });
    expect(auth.logout).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('signOut keeps both keys in place until the logout call has settled (W2.3f), then clears them', async () => {
    localStorage.setItem('refreshToken', 'rt1');
    let settle!: () => void;
    auth.logout.mockImplementation(() => {
      expect(localStorage.getItem('token')).toBe('tok');
      expect(localStorage.getItem('refreshToken')).toBe('rt1');
      return new Promise<{ success: boolean }>((resolve) => {
        settle = () => resolve({ success: true });
      });
    });
    const { result } = await settled(mount());
    act(() => result.current.signIn(USER, 'tok'));
    act(() => result.current.signOut());
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ session: null, isUser: false });
    // the request is still in flight: it may need the keys to refresh-and-replay a 401
    expect(localStorage.getItem('token')).toBe('tok');
    expect(localStorage.getItem('refreshToken')).toBe('rt1');
    settle();
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull());
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('signOut is best-effort about the worker: a failed logout still ends the session locally', async () => {
    localStorage.setItem('refreshToken', 'rt1');
    auth.logout.mockRejectedValue(
      new ApiError('Could not reach Notarium. Check your connection and try again.', 0),
    );
    const { result } = await settled(mount());
    act(() => result.current.signIn(USER, 'tok'));
    expect(() => act(() => result.current.signOut())).not.toThrow();
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull());
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('a sign-in that lands while the logout is still in flight keeps its own keys (W2.3f)', async () => {
    localStorage.setItem('refreshToken', 'rt1');
    let settle!: () => void;
    auth.logout.mockImplementation(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          settle = () => resolve({ success: true });
        }),
    );
    const { result } = await settled(mount());
    act(() => result.current.signIn(USER, 'tok'));
    act(() => result.current.signOut());
    act(() => result.current.signIn({ ...USER, id: 2, name: 'Bima' }, 'tok-2'));
    localStorage.setItem('refreshToken', 'rt-2'); // what api.auth.login/signup store next to the new token
    settle();
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0)); // let the logout's finally run
    expect(localStorage.getItem('token')).toBe('tok-2');
    expect(localStorage.getItem('refreshToken')).toBe('rt-2');
    expect(result.current).toMatchObject({
      session: { kind: 'user', user: { id: 2 } },
      learner: 'Bima',
    });
  });

  it('the keys are cleared even when the logout comes back 401 (W2.3f)', async () => {
    localStorage.setItem('refreshToken', 'rt1');
    auth.logout.mockRejectedValue(new ApiError('Your session has expired. Sign in again.', 401));
    const { result } = await settled(mount());
    act(() => result.current.signIn(USER, 'tok'));
    act(() => result.current.signOut());
    expect(result.current.session).toBeNull();
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull());
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('signOut keeps the visual preferences and resets everything about the session (W2.2b)', async () => {
    const { result } = await settled(mount());
    act(() => result.current.signIn(USER, 'tok'));
    const tray = [{ label: 'Pomodoro', meta: 'core' }];
    act(() =>
      result.current.set({
        theme: 'Cobalt field',
        bgMode: 'Smooth',
        grid: ['Mastery', 'Calendar'],
        tray,
        density: 'Cockpit',
        adapt: 'Manual',
        gamification: false,
        ctx: 'exam',
        aiThread: [],
        createPhase: 'publish',
        chat: [],
        learner: 'Someone',
      }),
    );
    act(() => result.current.signOut());
    // preferences survive
    expect(result.current).toMatchObject({
      theme: 'Cobalt field',
      bgMode: 'Smooth',
      grid: ['Mastery', 'Calendar'],
      density: 'Cockpit',
      adapt: 'Manual',
      gamification: false,
    });
    expect(result.current.tray).toEqual(tray);
    // the session and its working state are back to the start
    expect(result.current).toMatchObject({
      session: null,
      isUser: false,
      sessionChecked: true,
      learner: 'Arga',
      ctx: 'normal',
      mode: 'Study',
      createPhase: 'write',
    });
    expect(result.current.aiThread).toEqual(AI_SEED);
    expect(result.current.chat).toHaveLength(1);
  });

  it('a guest signing out never calls the worker', async () => {
    const { result } = await settled(mount());
    act(() => result.current.continueAsGuest());
    act(() => result.current.signOut());
    expect(auth.logout).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it('signUp creates the account on the worker, then opens it exactly like signIn', async () => {
    auth.signup.mockResolvedValue({
      token: 'fresh',
      user: { ...USER, name: 'Nama Baru', class: '10B' },
    });
    const { result } = await settled(mount());
    await act(async () => {
      await result.current.signUp('baru@sman4.sch.id', 'rahasia123', 'Nama Baru', '10B');
    });
    expect(auth.signup).toHaveBeenCalledWith('baru@sman4.sch.id', 'rahasia123', 'Nama Baru', '10B');
    expect(localStorage.getItem('token')).toBe('fresh');
    expect(result.current).toMatchObject({
      session: { kind: 'user', user: { name: 'Nama Baru' } },
      learner: 'Nama',
      isUser: true,
    });
  });

  it('signUp passes the worker error through and leaves the visitor signed out', async () => {
    auth.signup.mockRejectedValue(new ApiError('Email already registered', 409));
    const { result } = await settled(mount());
    await expect(
      result.current.signUp('dup@sman4.sch.id', 'rahasia123', 'Dup'),
    ).rejects.toMatchObject({ status: 409, message: 'Email already registered' });
    expect(result.current.session).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('guest persistence (F2)', () => {
  it('keeps a guest session across a remount without asking the worker', async () => {
    const first = await settled(mount());
    act(() => first.result.current.continueAsGuest());
    first.unmount();

    const { result } = await settled(mount());
    expect(result.current.session).toEqual({ kind: 'guest' });
    expect(auth.me).not.toHaveBeenCalled();
  });

  it('keeps the guest in this tab only: nothing lands in localStorage, a fresh tab starts over', async () => {
    const first = await settled(mount());
    act(() => first.result.current.continueAsGuest());
    first.unmount();
    expect(localStorage.length).toBe(0);

    sessionStorage.clear();
    const { result } = await settled(mount());
    expect(result.current.session).toBeNull();
  });

  it('signOut ends the guest session for good', async () => {
    const first = await settled(mount());
    act(() => first.result.current.continueAsGuest());
    act(() => first.result.current.signOut());
    first.unmount();

    const { result } = await settled(mount());
    expect(result.current.session).toBeNull();
  });

  it('a stored token wins over a stored guest flag', async () => {
    const first = await settled(mount());
    act(() => first.result.current.continueAsGuest());
    first.unmount();
    localStorage.setItem('token', 'tok');
    auth.me.mockResolvedValue({ user: USER });

    const { result } = await settled(mount());
    expect(result.current.session).toEqual({ kind: 'user', user: USER });
    expect(auth.me).toHaveBeenCalledTimes(1);
  });

  it('still opens the guest in memory and finishes the session check when sessionStorage throws', async () => {
    // jsdom's Storage is a named-property proxy, so spying on the `sessionStorage` instance would just store the mock as an item; the prototype is what the calls hit.
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    try {
      const { result } = await settled(mount());
      expect(result.current.sessionChecked).toBe(true);
      expect(() => act(() => result.current.continueAsGuest())).not.toThrow();
      expect(result.current.session).toEqual({ kind: 'guest' });
      expect(setItem).toHaveBeenCalled();
      expect(getItem).toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });
});
