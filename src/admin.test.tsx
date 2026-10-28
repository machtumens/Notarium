import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import type { User } from '@/lib/api';
import { AppProvider } from '@/store';

/**
 * The admin dashboard, through the real router, the real store and the real admin client — only
 * the worker is faked, at the fetch boundary, exactly as `App.test.tsx` does it. What is proven
 * here is the part that is ours: the route guard, the per-panel 403 handling (which is the normal
 * answer for an admin whose token carries no `admin_role`), and the request bodies the write
 * panels build, since a wrong field name there fails silently as a 400 the admin has to read.
 */
const ADMIN: User = {
  id: 1,
  email: 'head@notarium.site',
  name: 'Dewi Head',
  class: null,
  role: 'admin',
  points: 0,
  notes_count: 0,
  total_likes: 0,
  total_admin_upvotes: 0,
  photo_url: null,
};
const STUDENT: User = {
  ...ADMIN,
  id: 9,
  email: 'arga@school.id',
  name: 'Arga',
  class: '10.1',
  role: 'student',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const forbidden = () => json(403, { error: 'Forbidden' });

function stubFetch(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    return path in routes ? Promise.resolve(routes[path](init)) : new Promise<Response>(() => {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body ?? '{}'));
const callTo = (m: ReturnType<typeof stubFetch>, path: string) =>
  m.mock.calls.find(([input]) => new URL(String(input)).pathname === path);

const STATS = {
  overview: {
    totalUsers: 128,
    activeUsers7d: 64,
    activeUsers30d: 96,
    totalNotes: 310,
    notes7d: 22,
    notes30d: 71,
    totalLikes: 904,
    totalAdminUpvotes: 37,
    totalChatSessions: 12,
    chatSessions7d: 3,
    chatSessions30d: 9,
    suspendedUsers: 2,
    warnedUsers: 5,
  },
  topContributors: [
    {
      id: 9,
      display_name: 'Arga',
      email: 'arga@school.id',
      class: '10.1',
      notes_uploaded: 18,
      total_likes: 90,
      total_admin_upvotes: 4,
    },
  ],
  usersByClass: [{ class: '10.1', count: 28 }],
  notesByClass: [{ class: '10.1', count: 61 }],
  popularSubjects: [{ id: 3, name: 'Kimia', icon: null, note_count: 61, total_likes: 190 }],
  dailyActivity: [{ date: '2026-10-27', count: 4 }],
  dailyRegistrations: [{ date: '2026-10-27', count: 1 }],
};

const USERS = [
  {
    id: 9,
    display_name: 'Arga',
    email: 'arga@school.id',
    class: '10.1',
    role: 'student',
    notes_uploaded: 18,
    total_likes: 90,
    total_admin_upvotes: 4,
    diamonds: 0,
    points: 112,
    suspended: 0,
    suspension_end_date: null,
    suspension_reason: null,
    warning: 0,
    warning_message: null,
    photo_url: null,
    description: null,
    created_at: '2026-09-01T08:00:00Z',
  },
  {
    id: 1,
    display_name: 'Dewi Head',
    email: 'head@notarium.site',
    class: null,
    role: 'admin',
    notes_uploaded: 0,
    total_likes: 0,
    total_admin_upvotes: 0,
    diamonds: 0,
    points: 0,
    suspended: 0,
    suspension_end_date: null,
    suspension_reason: null,
    warning: 0,
    warning_message: null,
    photo_url: null,
    description: null,
    created_at: '2026-08-01T08:00:00Z',
  },
];

const CLASSES = [
  { id: 2, grade: 10, class_name: '10.2', semester: '', is_active: 1, student_count: 26 },
];

/** Signed in as `who`, with the panel routes the test needs; everything else stays pending. */
const renderAdmin = (
  path: string,
  who: User,
  routes: Record<string, (init?: RequestInit) => Response | Promise<Response>> = {},
) => {
  localStorage.setItem('token', 'tok');
  const m = stubFetch({ '/api/auth/me': () => json(200, { user: who }), ...routes });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <App />
      </AppProvider>
    </MemoryRouter>,
  );
  return m;
};

describe('the admin route is for admins', () => {
  it('sends a student who types /admin back into the app', async () => {
    renderAdmin('/admin', STUDENT, { '/api/subjects': () => json(200, { subjects: [] }) });
    // The student app's own headline is the proof it landed on Home, not on the dashboard.
    await waitFor(() => expect(screen.queryByText('Administration')).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'The school, today' })).not.toBeInTheDocument();
  });

  it('opens the dashboard for an admin and fills Overview from the worker', async () => {
    renderAdmin('/admin', ADMIN, {
      '/api/admin/usage-stats': () => json(200, STATS),
      '/api/ops/metrics': () =>
        json(200, {
          live_users: { m5: 3, h1: 11, d1: 40 },
          totals: {
            users: 128,
            notes: 310,
            suspended_users: 2,
            active_warnings: 5,
            chat_sessions: 12,
            quiz_attempts: 80,
          },
          moderation: { soft_deleted_notes: 1, featured_notes: 6 },
          table_rows: { users: 128, notes: 311, chat_messages: 240, study_items: 50 },
        }),
    });
    expect(await screen.findByRole('heading', { name: 'The school, today' })).toBeInTheDocument();
    // One figure from each of the two guards, so both halves are proven bound.
    expect(await screen.findByText('40')).toBeInTheDocument();
    const people = (await screen.findByRole('heading', { name: 'People and work' })).closest(
      'section',
    )!;
    expect(within(people).getByText('128')).toBeInTheDocument();
    expect(within(people).getByText('96')).toBeInTheDocument();
  });

  it('says which panel the admin role does not cover instead of blanking the page', async () => {
    renderAdmin('/admin', ADMIN, {
      '/api/admin/usage-stats': () => json(200, STATS),
      // The live worker's password login mints a token with no `admin_role`, so every
      // requireTechnical route answers 403 — the ops half must degrade, not take the page down.
      '/api/ops/metrics': forbidden,
    });
    expect(await screen.findByRole('heading', { name: 'The school, today' })).toBeInTheDocument();
    expect(
      await screen.findByText('Your admin role does not cover this panel.'),
    ).toBeInTheDocument();
    // The moderator half still rendered.
    expect(await screen.findByText('310')).toBeInTheDocument();
  });
});

describe('People', () => {
  it('suspends a student with the days and reason the worker reads, and protects a staff row', async () => {
    const user = userEvent.setup();
    const m = renderAdmin('/admin/people', ADMIN, {
      '/api/admin/users': () => json(200, { users: USERS }),
      '/api/admin/grade-classes': () => json(200, { grade_classes: CLASSES }),
      '/api/admin/suspend/9': () =>
        json(200, { success: true, suspension_end_date: '2026-11-11T00:00:00Z' }),
    });

    const studentRow = (await screen.findByText('arga@school.id')).closest('tr')!;
    await user.click(within(studentRow).getByRole('button', { name: 'Manage' }));

    await user.type(await screen.findByLabelText('Days'), '{backspace}{backspace}14');
    await user.type(screen.getByPlaceholderText('Repeated plagiarism'), 'Copied a note');
    // Two-step on purpose: the first press only arms it.
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    await user.click(screen.getByRole('button', { name: 'Suspend for 14d — confirm' }));

    await waitFor(() => expect(callTo(m, '/api/admin/suspend/9')).toBeTruthy());
    const [, init] = callTo(m, '/api/admin/suspend/9')!;
    expect(init?.method).toBe('POST');
    expect(bodyOf(init)).toEqual({ days: 14, reason: 'Copied a note' });
    expect(await screen.findByText('Suspended Arga for 14 days.')).toBeInTheDocument();

    // The worker refuses to suspend an admin (403), so the row does not offer it.
    await user.click(screen.getByRole('button', { name: 'Close' }));
    const staffRow = (await screen.findByText('head@notarium.site')).closest('tr')!;
    await user.click(within(staffRow).getByRole('button', { name: 'Manage' }));
    expect(await screen.findByText('Protected · staff account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete this account' })).toBeDisabled();
  });

  it('sends only the profile fields that actually changed', async () => {
    const user = userEvent.setup();
    const m = renderAdmin('/admin/people', ADMIN, {
      '/api/admin/users': () => json(200, { users: USERS }),
      '/api/admin/grade-classes': () => json(200, { grade_classes: CLASSES }),
      '/api/admin/user/9': () => json(200, { success: true, user: USERS[0] }),
    });
    const row = (await screen.findByText('arga@school.id')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Manage' }));

    await user.clear(await screen.findByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Arga Pratama');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(callTo(m, '/api/admin/user/9')).toBeTruthy());
    const [, init] = callTo(m, '/api/admin/user/9')!;
    expect(init?.method).toBe('PUT');
    // Diamonds and role were untouched, so they must not be in the patch — the worker would
    // otherwise count them as changed fields in its own activity log.
    expect(bodyOf(init)).toEqual({ display_name: 'Arga Pratama' });
  });
});

describe('Publish', () => {
  it('builds the audience the worker expects and clears the form after sending', async () => {
    const user = userEvent.setup();
    const m = renderAdmin('/admin/publish', ADMIN, {
      '/api/admin/notifications': (init) =>
        init?.method === 'POST'
          ? json(201, { notification: {} })
          : json(200, { notifications: [] }),
      '/api/admin/grade-classes': () => json(200, { grade_classes: CLASSES }),
    });

    expect(
      await screen.findByRole('heading', { name: 'Announcements and news' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'A class' }));
    await user.selectOptions(await screen.findByLabelText('Class'), '10.2');
    await user.type(screen.getByLabelText('Title'), 'Exam week timetable');
    await user.type(screen.getByLabelText('Message'), 'Pinned in the hall, and here.');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      const post = m.mock.calls.find(
        ([input, init]) =>
          new URL(String(input)).pathname === '/api/admin/notifications' &&
          (init as RequestInit)?.method === 'POST',
      );
      expect(post).toBeTruthy();
      expect(bodyOf(post![1] as RequestInit)).toEqual({
        target_type: 'class',
        notification_type: 'announcement',
        target_class: '10.2',
        title: 'Exam week timetable',
        message: 'Pinned in the hall, and here.',
      });
    });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
  });
});

describe('Content', () => {
  it('writes an edited body to extracted_text and content together', async () => {
    const user = userEvent.setup();
    const NOTE = {
      id: 5,
      title: 'Stoikiometri',
      description: 'n = m / Mr',
      content: 'old body',
      extracted_text: 'old body',
      summary: null,
      tags: '["mol"]',
      image_path: null,
      likes: 3,
      admin_upvotes: 0,
      featured: 0,
      deleted_at: null,
      subject_id: 3,
      author_id: 9,
      status: 'published',
      visibility: 'everyone',
      created_at: '2026-10-20T08:00:00Z',
      author_name: 'Arga',
      author_class: '10.1',
      subject_name: 'Kimia',
      admin_liked: 0,
    };
    const m = renderAdmin('/admin/content', ADMIN, {
      '/api/admin/notes': () => json(200, { notes: [NOTE] }),
      '/api/subjects': () =>
        json(200, { subjects: [{ id: 3, name: 'Kimia', icon: null, note_count: 61 }] }),
      '/api/admin/notes/5': () => json(200, { success: true }),
    });

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    const body = await screen.findByLabelText('Body');
    await user.clear(body);
    await user.type(body, 'new body');
    await user.click(screen.getByRole('button', { name: 'Save the note' }));

    await waitFor(() => expect(callTo(m, '/api/admin/notes/5')).toBeTruthy());
    const [, init] = callTo(m, '/api/admin/notes/5')!;
    expect(init?.method).toBe('PUT');
    // Both fields, or the live app and this one render different text for the same note.
    expect(bodyOf(init)).toEqual({ extracted_text: 'new body', content: 'new body' });
  });
});
