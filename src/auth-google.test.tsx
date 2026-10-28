import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { type User } from '@/lib/api';
import { AppProvider, useApp } from '@/store';

/**
 * Google sign-in, end to end through the real router and store, with the worker
 * faked at the fetch boundary: the one-time code is swapped for a token, /me
 * says who it is, and the account's class decides whether the profile step
 * stands between them and the app.
 */
const base: User = {
  id: 7,
  email: 'siswa@sekolahkristencalvin.org',
  name: 'Siswa Calvin',
  class: null,
  role: 'student',
  points: 0,
  notes_count: 0,
  total_likes: 0,
  total_admin_upvotes: 0,
  photo_url: null,
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    return path in routes ? Promise.resolve(routes[path](init)) : new Promise<Response>(() => {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function Probe() {
  const loc = useLocation();
  const { session } = useApp();
  return (
    <div hidden data-testid="probe">
      {JSON.stringify({ path: loc.pathname, session: session?.kind ?? null })}
    </div>
  );
}
const probe = () =>
  JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
    path: string;
    session: string | null;
  };

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <App />
        <Probe />
      </AppProvider>
    </MemoryRouter>,
  );

describe('/auth/callback — the one-time code', () => {
  it('swaps the code for a session and sends a new account to the profile step', async () => {
    const fetchMock = stubFetch({
      '/auth/google/exchange': () => json(200, { token: 'jwt-from-google' }),
      '/api/auth/me': () => json(200, { user: base }),
    });
    renderAt('/auth/callback?code=onetime');

    await waitFor(() => expect(probe()).toMatchObject({ path: '/welcome', session: 'user' }));
    expect(localStorage.getItem('token')).toBe('jwt-from-google');
    // The code travels in a POST body, never in the URL of the exchange call.
    const [, init] = fetchMock.mock.calls.find(
      ([i]) => new URL(String(i)).pathname === '/auth/google/exchange',
    )!;
    expect(JSON.parse(String(init?.body))).toEqual({ code: 'onetime' });
  });

  it('sends an account that already has a class straight into the app', async () => {
    stubFetch({
      '/auth/google/exchange': () => json(200, { token: 'jwt' }),
      '/api/auth/me': () => json(200, { user: { ...base, class: '11.2' } }),
    });
    renderAt('/auth/callback?code=onetime');
    await waitFor(() => expect(probe()).toMatchObject({ path: '/app/home', session: 'user' }));
  });

  it('returns to where the visitor was headed before Google took over', async () => {
    sessionStorage.setItem('google:return', '/app/notes');
    stubFetch({
      '/auth/google/exchange': () => json(200, { token: 'jwt' }),
      '/api/auth/me': () => json(200, { user: { ...base, class: '11.2' } }),
    });
    renderAt('/auth/callback?code=onetime');
    await waitFor(() => expect(probe()).toMatchObject({ path: '/app/notes' }));
    // One trip only — a later sign-in must not be hijacked by a stale return path.
    expect(sessionStorage.getItem('google:return')).toBe(null);
  });

  it('says why, and opens no session, when the worker refuses the domain', async () => {
    stubFetch({});
    renderAt('/auth/callback?google=error&reason=domain');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/not a school account/i),
    );
    expect(probe()).toMatchObject({ path: '/auth/callback', session: null });
    expect(localStorage.getItem('token')).toBe(null);
  });

  it('says so when the code has already been spent', async () => {
    stubFetch({ '/auth/google/exchange': () => json(400, { error: 'Invalid or expired code' }) });
    renderAt('/auth/callback?code=stale');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid or expired code/i),
    );
    expect(localStorage.getItem('token')).toBe(null);
  });
});

describe('the profile step is a gate, not a suggestion', () => {
  it('holds an account with no class on /welcome wherever in /app it goes', async () => {
    localStorage.setItem('token', 'tok');
    stubFetch({ '/api/auth/me': () => json(200, { user: base }) });
    renderAt('/app/create');
    await waitFor(() => expect(probe()).toMatchObject({ path: '/welcome', session: 'user' }));
  });

  it('lets a guest through — a guest has no class and never needs one', async () => {
    sessionStorage.setItem('notarium:guest', '1');
    stubFetch({});
    renderAt('/app/home');
    await waitFor(() => expect(probe()).toMatchObject({ path: '/app/home', session: 'guest' }));
  });

  it('sends a visitor with no session at all to /login, not to /welcome', async () => {
    stubFetch({});
    renderAt('/welcome');
    await waitFor(() => expect(probe()).toMatchObject({ path: '/login', session: null }));
  });
});
