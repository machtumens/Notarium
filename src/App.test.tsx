import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { api, type User } from '@/lib/api';
import { AppProvider, useApp } from '@/store';

/**
 * Route guards through the real router tree and the real store. The worker is faked at the fetch
 * boundary: `routes` answer by path, anything unlisted stays pending like a slow network, so pages
 * never resolve data they were not given (and never reach the real API).
 */
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
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    return path in routes ? Promise.resolve(routes[path](init)) : new Promise<Response>(() => {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const bearer = (init?: RequestInit) =>
  (init?.headers as Record<string, string> | undefined)?.Authorization;
const callsTo = (fetchMock: ReturnType<typeof stubFetch>, path: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === path);

/** Where the router is and who the store thinks is here — the behaviour the guards are responsible for. */
function Probe() {
  const loc = useLocation();
  const { session, sessionChecked } = useApp();
  const state = loc.state as { from?: string; reason?: string } | null;
  return (
    <div hidden data-testid="probe">
      {JSON.stringify({
        path: loc.pathname,
        search: loc.search,
        from: state?.from ?? null,
        reason: state?.reason ?? null,
        session: session?.kind ?? null,
        checked: sessionChecked,
      })}
    </div>
  );
}
const probe = () =>
  JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
    path: string;
    search: string;
    from: string | null;
    reason: string | null;
    session: 'user' | 'guest' | null;
    checked: boolean;
  };

/** A guest session is sessionStorage, not a button: the sign-in screen is school Google only now. */

// The browser URL follows the router in real life; the store reads it to decide whether to prefetch Home.
const renderAt = (path: string) => {
  window.history.replaceState(null, '', path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <App />
        <Probe />
      </AppProvider>
    </MemoryRouter>,
  );
};

/**
 * Pick a subject on Create, waiting for the OPTIONS and not just the `<select>`.
 *
 * `findByLabelText('Subject')` resolves the moment the select is in the DOM, which is before the
 * `/api/subjects` fetch has filled it. Selecting then throws `Value "14" not found in options` —
 * a race this machine almost always wins and a cold CI runner does not, so it reads as a flake
 * on an unrelated commit (it failed CI on a STATE.md-only push while passing locally).
 */
async function selectSubject(user: ReturnType<typeof userEvent.setup>, value: string) {
  const select = (await screen.findByLabelText('Subject')) as HTMLSelectElement;
  await waitFor(() => expect([...select.options].some((o) => o.value === value)).toBe(true));
  await user.selectOptions(select, value);
}

describe('RequireSession', () => {
  it('holds an /app route on the session check until the stored token is verified', () => {
    localStorage.setItem('token', 'tok');
    stubFetch({});
    renderAt('/app/notes');
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(probe()).toMatchObject({ path: '/app/notes', session: null, checked: false });
  });

  it('sends a visitor with no session to /login and remembers where they were going', async () => {
    stubFetch({});
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({
        path: '/login',
        from: '/app/notes',
        session: null,
        checked: true,
      }),
    );
  });
});

describe('archived demo routes', () => {
  it('sends an old /app/practice bookmark to /app/home', async () => {
    localStorage.setItem('token', 'tok');
    stubFetch({ '/api/auth/me': () => json(200, { user: USER }) });
    renderAt('/app/practice');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/home', session: 'user', checked: true }),
    );
  });
});

describe('session expiry (F1)', () => {
  it('signs the account out and returns to /login with `from` when a request comes back 401', async () => {
    localStorage.setItem('token', 'tok');
    stubFetch({
      '/api/auth/me': () => json(200, { user: USER }),
      '/api/notes/my-notes': () => json(401, { error: 'Unauthorized' }),
    });
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({
        path: '/login',
        from: '/app/notes',
        session: null,
        checked: true,
      }),
    );
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('still ends signed out at /login when the stored token is rejected during bootstrap', async () => {
    localStorage.setItem('token', 'stale');
    stubFetch({ '/api/auth/me': () => json(401, { error: 'Unauthorized' }) });
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({
        path: '/login',
        from: '/app/notes',
        session: null,
        checked: true,
      }),
    );
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('bootstrap without a verdict (W5.4)', () => {
  it('a 503 on the session check keeps the token, sends the visitor to /login with reason "offline", and Retry picks the page back up', async () => {
    localStorage.setItem('token', 'tok');
    let checks = 0;
    const fetchMock = stubFetch({
      '/api/auth/me': () =>
        ++checks === 1 ? json(503, { error: 'Service Unavailable' }) : json(200, { user: USER }),
      '/api/notes/my-notes': () => json(200, { notes: [] }),
    });
    const user = userEvent.setup();
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({
        path: '/login',
        from: '/app/notes',
        reason: 'offline',
        session: null,
        checked: true,
      }),
    );
    expect(localStorage.getItem('token')).toBe('tok');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach Notarium — try again');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/notes', session: 'user', checked: true }),
    );
    expect(callsTo(fetchMock, '/api/auth/me')).toHaveLength(2);
    expect(localStorage.getItem('token')).toBe('tok');
  });

  it('a Retry that comes back 401 clears the token and leaves the plain sign-in form', async () => {
    localStorage.setItem('token', 'tok');
    let checks = 0;
    stubFetch({
      '/api/auth/me': () =>
        ++checks === 1
          ? json(503, { error: 'Service Unavailable' })
          : json(401, { error: 'Unauthorized' }),
    });
    const user = userEvent.setup();
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/login', reason: 'offline', session: null }),
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(probe()).toMatchObject({ path: '/login', session: null });
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });

  it('a 401 on the session check shows no retry — the token was rejected, not unanswered', async () => {
    localStorage.setItem('token', 'stale');
    stubFetch({ '/api/auth/me': () => json(401, { error: 'Unauthorized' }) });
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({
        path: '/login',
        from: '/app/notes',
        reason: null,
        session: null,
        checked: true,
      }),
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('refresh once on 401 (W2.2a)', () => {
  it('a dead access token is refreshed and the request replayed: the account stays on its page', async () => {
    localStorage.setItem('token', 'old');
    localStorage.setItem('refreshToken', 'rt1');
    const fetchMock = stubFetch({
      '/api/auth/me': (init) =>
        bearer(init) === 'Bearer new'
          ? json(200, { user: USER })
          : json(401, { error: 'Invalid or expired token' }),
      '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
    });
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/notes', session: 'user', checked: true }),
    );
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    expect(localStorage.getItem('token')).toBe('new');
    expect(localStorage.getItem('refreshToken')).toBe('rt2');
  });

  it('signs out to /login with `from` when the refresh is rejected too, clearing both keys', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('refreshToken', 'rt1');
    const fetchMock = stubFetch({
      '/api/auth/me': () => json(200, { user: USER }),
      '/api/notes/my-notes': () => json(401, { error: 'Invalid or expired token' }),
      '/api/auth/refresh': () => json(401, { error: 'Invalid or expired refresh token' }),
    });
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({
        path: '/login',
        from: '/app/notes',
        session: null,
        checked: true,
      }),
    );
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('a rejected bootstrap whose refresh also fails ends at /login with both keys gone', async () => {
    localStorage.setItem('token', 'stale');
    localStorage.setItem('refreshToken', 'rt-stale');
    const fetchMock = stubFetch({
      '/api/auth/me': () => json(401, { error: 'Unauthorized' }),
      '/api/auth/refresh': () => json(401, { error: 'x' }),
    });
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({
        path: '/login',
        from: '/app/notes',
        session: null,
        checked: true,
      }),
    );
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('the Sign out control tells the worker (bearer + refresh token) and lands on /login signed out', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('refreshToken', 'rt1');
    const fetchMock = stubFetch({
      '/api/auth/me': () => json(200, { user: USER }),
      '/api/auth/logout': () => json(200, { success: true }),
    });
    const user = userEvent.setup();
    renderAt('/app/home');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/home', session: 'user', checked: true }),
    );
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(probe()).toMatchObject({ path: '/login', session: null }));
    const [logout] = callsTo(fetchMock, '/api/auth/logout');
    expect(logout).toBeDefined();
    expect(bearer(logout[1])).toBe('Bearer tok');
    expect(JSON.parse(String(logout[1]?.body))).toEqual({ refreshToken: 'rt1' });
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull());
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('signing out with an expired access token still revokes on the worker: the 401 is refreshed and the logout replayed, then both keys go (W2.3f)', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('refreshToken', 'rt1');
    const fetchMock = stubFetch({
      '/api/auth/me': () => json(200, { user: USER }),
      '/api/auth/logout': (init) =>
        bearer(init) === 'Bearer new'
          ? json(200, { success: true })
          : json(401, { error: 'Invalid or expired token' }),
      '/api/auth/refresh': () => json(200, { token: 'new', refreshToken: 'rt2' }),
    });
    const user = userEvent.setup();
    renderAt('/app/home');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/home', session: 'user', checked: true }),
    );
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(probe()).toMatchObject({ path: '/login', session: null }));
    await waitFor(() => expect(callsTo(fetchMock, '/api/auth/logout')).toHaveLength(2));
    const [first, replay] = callsTo(fetchMock, '/api/auth/logout');
    expect(bearer(first[1])).toBe('Bearer tok');
    expect(bearer(replay[1])).toBe('Bearer new');
    // the body names the family that was signed in, so the worker revokes it — its successor included
    expect(JSON.parse(String(replay[1]?.body))).toEqual({ refreshToken: 'rt1' });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull());
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(probe()).toMatchObject({ path: '/login', session: null });
  });
});

describe('refresh unavailable (W2.3e)', () => {
  it('a 429 on refresh keeps the account signed in on its page with both keys, and the page shows the transient error', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('refreshToken', 'rt1');
    const fetchMock = stubFetch({
      '/api/auth/me': () => json(200, { user: USER }),
      '/api/subjects': () => json(200, { subjects: [] }),
      '/api/notes/my-notes': () => json(401, { error: 'Invalid or expired token' }),
      '/api/auth/refresh': () =>
        json(429, { error: 'Too many refresh attempts. Please try again in 15 minutes.' }),
    });
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/notes', session: 'user', checked: true }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests — wait a moment.',
    );
    expect(probe()).toMatchObject({ path: '/app/notes', session: 'user' });
    expect(callsTo(fetchMock, '/api/auth/refresh')).toHaveLength(1);
    expect(localStorage.getItem('token')).toBe('tok');
    expect(localStorage.getItem('refreshToken')).toBe('rt1');
  });

  it('signing in with a password opts in to short sessions', async () => {
    const fetchMock = stubFetch({
      '/api/auth/login': () =>
        json(200, { success: true, token: 'jwt', refreshToken: 'rt', user: USER }),
    });
    await api.auth.login('arga@sman4.sch.id', 'rahasia123');
    const [login] = callsTo(fetchMock, '/api/auth/login');
    expect((login[1]?.headers as Record<string, string>)['X-Notarium-Session']).toBe('refresh');
    expect(localStorage.getItem('refreshToken')).toBe('rt');
  });
});

describe('accounts get no AI entry points (R2)', () => {
  // Main has no /api/chat/* (removed on purpose), so accounts get no AI entry points at all.
  const accountApi = {
    '/api/auth/me': () => json(200, { user: USER }),
    '/api/subjects': () =>
      json(200, { subjects: [{ id: 14, name: 'Kimia', icon: '🧪', note_count: 0 }] }),
    '/api/leaderboard': () => json(200, { leaderboard: [] }),
    '/api/notes/top': () => json(200, { notes: [] }),
    '/api/notes/3/view': () =>
      json(200, {
        note: {
          id: 3,
          title: 'Stoikiometri',
          subject_id: 14,
          subject_name: 'Kimia',
          extracted_text: 'Mol adalah satuan jumlah zat.',
          summary: null,
          tags: null,
          likes: 0,
          admin_upvotes: 0,
          created_at: '2026-09-20T10:00:00Z',
          status: 'published',
          visibility: 'class',
        },
      }),
    '/api/notes/my-notes': () =>
      json(200, {
        notes: [
          {
            id: 3,
            title: 'Stoikiometri',
            subject_id: 14,
            subject_name: 'Kimia',
            extracted_text: 'Mol adalah satuan jumlah zat.',
            summary: null,
            tags: null,
            likes: 0,
            admin_upvotes: 0,
            created_at: '2026-09-20T10:00:00Z',
            status: 'published',
            visibility: 'class',
          },
        ],
      }),
  };

  it('bounces a signed-in account from /app/ai to /app/home', async () => {
    localStorage.setItem('token', 'tok');
    stubFetch(accountApi);
    renderAt('/app/ai');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/home', session: 'user', checked: true }),
    );
  });

  it('shows an account neither the "Ask Notarium AI" button, the AI tab, nor the Home AI panel', async () => {
    localStorage.setItem('token', 'tok');
    stubFetch(accountApi);
    renderAt('/app/home');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/home', session: 'user', checked: true }),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Your notes' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Ask Notarium AI/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'AI' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ask Notarium AI' })).toBeNull();
  });

  it("renders an account's Notes without the companion column", async () => {
    localStorage.setItem('token', 'tok');
    stubFetch(accountApi);
    renderAt('/app/notes');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/notes', session: 'user', checked: true }),
    );
    // the my-notes row has no `content`: the body renders from `extracted_text`, at full width, with no companion
    // Re-queried for the same reason as the publish test below: a node captured by
    // findByText can be detached by Notes' next render before the matcher runs.
    await waitFor(() =>
      expect(screen.getByText('Mol adalah satuan jumlah zat.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Stoikiometri' })).toBeInTheDocument();
    expect(screen.queryByText('AI companion')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quiz me on this note' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My notes');
  });
});

describe("Create posts main's note contract (R3)", () => {
  it('publishes the block text as extracted_text + content (+ a description), tags as an array, and hands over to Notes with the flash', async () => {
    localStorage.setItem('token', 'tok');
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
    };
    const fetchMock = stubFetch({
      '/api/auth/me': () => json(200, { user: USER }),
      '/api/subjects': () =>
        json(200, { subjects: [{ id: 14, name: 'Kimia', icon: '🧪', note_count: 0 }] }),
      '/api/notes': () => json(200, { note: NOTE, notes: [NOTE], success: true, totalParts: 1 }),
      '/api/notes/my-notes': () =>
        json(200, {
          notes: [
            {
              ...NOTE,
              subject_name: 'Kimia',
              extracted_text: 'Mol adalah satuan jumlah zat.\n\n$$ n = m / Mr',
              summary: 'Mol adalah satuan jumlah zat. n = m / Mr',
            },
          ],
        }),
      '/api/notes/9/view': () =>
        json(200, {
          note: {
            ...NOTE,
            subject_name: 'Kimia',
            extracted_text: 'Mol adalah satuan jumlah zat.\n\n$$ n = m / Mr',
            summary: 'Mol adalah satuan jumlah zat. n = m / Mr',
          },
        }),
    });
    const user = userEvent.setup();
    renderAt('/app/create');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/create', session: 'user', checked: true }),
    );
    await selectSubject(user, '14');
    await user.type(screen.getByLabelText('Title'), 'Stoikiometri');
    await user.type(screen.getByLabelText('Paragraph'), 'Mol adalah satuan jumlah zat.');
    await user.click(screen.getByRole('button', { name: '+ Formula' }));
    await user.type(screen.getByLabelText('Formula'), 'n = m / Mr');
    // W5.5: the draft is in this tab's storage before publishing, and gone after
    await waitFor(() => expect(sessionStorage.getItem('create:1')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(probe()).toMatchObject({ path: '/app/notes', session: 'user' }));
    // Waited, not read once: the waitFor above only settles the ROUTE. The flash
    // is rendered by the screen that route lands on, so on a slow runner it can
    // still be a paint behind.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Published to my class'),
    );
    expect(sessionStorage.getItem('create:1')).toBeNull();
    const [post] = callsTo(fetchMock, '/api/notes');
    expect(post[1]?.method).toBe('POST');
    expect(bearer(post[1])).toBe('Bearer tok');
    const text = 'Mol adalah satuan jumlah zat.\n\n$$ n = m / Mr';
    // the description is the plain-text summary of the whole note: markers stripped, whitespace collapsed, 160 max
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      title: 'Stoikiometri',
      subject_id: 14,
      extracted_text: text,
      content: text,
      description: 'Mol adalah satuan jumlah zat. n = m / Mr',
      tags: [],
      status: 'published',
      visibility: 'class',
    });
    // Notes opens the row main just wrote, by id; the body renders from extracted_text and main's summary
    // (= the description = the plain-text summary of the body) is not shown a second time under it
    expect(probe()).toMatchObject({ path: '/app/notes', search: '?note=9' });
    // Re-queried inside waitFor rather than `expect(await findByText(...))`.
    // findByText resolves with a NODE; Notes then re-renders as its second fetch
    // lands, replacing that node, and the matcher is left holding a detached one
    // — which jest-dom reports as "element could not be found in the document",
    // the exact failure this test produced in CI run 40679322132 while passing
    // locally. Re-querying each attempt cannot strand a node.
    await waitFor(() => expect(screen.getByText('n = m / Mr')).toBeInTheDocument());
    expect(screen.getAllByText('Mol adalah satuan jumlah zat.')).toHaveLength(1);
    expect(screen.queryByText('Summary')).toBeNull();
  });

  it('shows the failure instead of the flash when main stored nothing', async () => {
    localStorage.setItem('token', 'tok');
    stubFetch({
      '/api/auth/me': () => json(200, { user: USER }),
      '/api/subjects': () =>
        json(200, { subjects: [{ id: 14, name: 'Kimia', icon: '🧪', note_count: 0 }] }),
      '/api/notes': () => json(200, { notes: [], success: true, totalParts: 0 }),
    });
    const user = userEvent.setup();
    renderAt('/app/create');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/create', session: 'user', checked: true }),
    );
    await selectSubject(user, '14');
    await user.type(screen.getByLabelText('Title'), 'Stoikiometri');
    await user.type(screen.getByLabelText('Paragraph'), 'Mol.');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not save/i);
    expect(probe()).toMatchObject({ path: '/app/create' });
  });
});

describe('Create keeps a draft per account in this tab (W5.5, Feature A)', () => {
  const accountApi = {
    '/api/auth/me': () => json(200, { user: USER }),
    '/api/subjects': () =>
      json(200, {
        subjects: [
          { id: 14, name: 'Kimia', icon: '🧪', note_count: 0 },
          { id: 15, name: 'Fisika', icon: '⚛️', note_count: 0 },
        ],
      }),
  };
  const savedAt = new Date(2026, 8, 21, 9, 5).getTime();
  const saved = {
    title: 'Stoikiometri',
    blocks: [
      { kind: 'p', text: 'Mol adalah satuan jumlah zat.' },
      { kind: 'f', text: 'n = m / Mr' },
    ],
    subjectId: 15,
    audience: 'All of Notarium',
    savedAt,
  };

  it('saves title, blocks, subject and audience under create:{userId} half a second after the last change', async () => {
    localStorage.setItem('token', 'tok');
    stubFetch(accountApi);
    const user = userEvent.setup();
    renderAt('/app/create');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/create', session: 'user', checked: true }),
    );
    await selectSubject(user, '14');
    await user.type(screen.getByLabelText('Title'), 'Stoikiometri');
    await user.type(screen.getByLabelText('Paragraph'), 'Mol.');
    expect(sessionStorage.getItem('create:1')).toBeNull();
    await waitFor(() => expect(sessionStorage.getItem('create:1')).not.toBeNull());
    const draft = JSON.parse(sessionStorage.getItem('create:1')!);
    expect(draft).toMatchObject({
      title: 'Stoikiometri',
      blocks: [{ kind: 'p', text: 'Mol.' }],
      subjectId: 14,
      audience: 'My class',
    });
    expect(typeof draft.savedAt).toBe('number');
    expect(localStorage.getItem('create:1')).toBeNull();
  });

  it('offers the saved draft on return, and Restore fills the editor back in', async () => {
    localStorage.setItem('token', 'tok');
    sessionStorage.setItem('create:1', JSON.stringify(saved));
    stubFetch(accountApi);
    const user = userEvent.setup();
    renderAt('/app/create');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/create', session: 'user', checked: true }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Restore your unsaved draft from 09:05?');
    await screen.findByRole('option', { name: 'Fisika' });
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByLabelText('Title')).toHaveValue('Stoikiometri');
    expect(screen.getByLabelText('Paragraph')).toHaveValue('Mol adalah satuan jumlah zat.');
    expect(screen.getByLabelText('Formula')).toHaveValue('n = m / Mr');
    expect(screen.getByLabelText('Subject')).toHaveValue('15');
    expect(screen.getByRole('button', { name: 'All of Notarium' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(sessionStorage.getItem('create:1')).not.toBeNull();
  });

  it('Discard forgets the draft and leaves the editor empty', async () => {
    localStorage.setItem('token', 'tok');
    sessionStorage.setItem('create:1', JSON.stringify(saved));
    stubFetch(accountApi);
    const user = userEvent.setup();
    renderAt('/app/create');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/create', session: 'user', checked: true }),
    );
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(sessionStorage.getItem('create:1')).toBeNull();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Paragraph')).toHaveValue('');
  });

  it('survives in-app navigation (even mid-debounce) and is offered on return', async () => {
    localStorage.setItem('token', 'tok');
    stubFetch({ ...accountApi, '/api/notes/my-notes': () => json(200, { notes: [] }) });
    const user = userEvent.setup();
    renderAt('/app/create');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/create', session: 'user', checked: true }),
    );
    await user.type(await screen.findByLabelText('Title'), 'Half a second');
    await user.click(screen.getAllByRole('link', { name: 'Notes' })[0]);
    await waitFor(() => expect(probe()).toMatchObject({ path: '/app/notes' }));
    expect(JSON.parse(sessionStorage.getItem('create:1') ?? 'null')).toMatchObject({
      title: 'Half a second',
      subjectId: 0,
      audience: 'My class',
    });

    await user.click(screen.getAllByRole('link', { name: 'New note' })[0]);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /^Restore your unsaved draft from \d\d:\d\d\?/,
    );
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });
});

describe('selectSubject waits for the options, not just the select', () => {
  it('picks the subject even when /api/subjects answers after the form has rendered', async () => {
    localStorage.setItem('token', 'tok');
    // The race, made deterministic: the select renders first and its options arrive a tick later,
    // which is the ordering a cold CI runner produces. Selecting without waiting throws
    // `Value "14" not found in options`, so this fails if selectSubject stops waiting.
    let releaseSubjects: () => void = () => {};
    const subjectsArrived = new Promise<void>((resolve) => {
      releaseSubjects = resolve;
    });
    stubFetch({
      '/api/auth/me': () => json(200, { user: USER }),
      '/api/subjects': async () => {
        await subjectsArrived;
        return json(200, { subjects: [{ id: 14, name: 'Kimia', icon: 'flask', note_count: 0 }] });
      },
    });
    const user = userEvent.setup();
    renderAt('/app/create');
    await waitFor(() =>
      expect(probe()).toMatchObject({ path: '/app/create', session: 'user', checked: true }),
    );

    const select = (await screen.findByLabelText('Subject')) as HTMLSelectElement;
    expect([...select.options].some((o) => o.value === '14')).toBe(false);

    releaseSubjects();
    await selectSubject(user, '14');
    expect(select.value).toBe('14');
  });
});
