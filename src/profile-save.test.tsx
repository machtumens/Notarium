import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { type User } from '@/lib/api';
import { AppProvider } from '@/store';

/**
 * Saving the profile from Customize. The register check this file was written
 * around is gone (owner decision, 28 Oct: a class off the register is stored,
 * not refused), so the refusal case it covered went with it. What is left is
 * that a save sends both fields in one call and reports itself, and that a
 * worker error arrives as the worker's own words rather than "something went
 * wrong".
 */
const USER: User = {
  id: 3,
  email: 'siswa@sekolahkristencalvin.org',
  name: 'Siswa Calvin',
  class: '12.9',
  role: 'student',
  points: 0,
  notes_count: 0,
  total_likes: 0,
  total_admin_upvotes: 0,
  photo_url: null,
  focus_subject_ids: [],
};
const SUBJECTS = [
  { id: 1, name: 'Biologi', icon: 'book', note_count: 0 },
  { id: 2, name: 'Fisika', icon: 'book', note_count: 0 },
];
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

/**
 * The shell shows the signed-in name too, so every query here is scoped to the
 * profile form — reached through its Save button, the one thing only it has.
 */
const profileForm = async () => {
  const save = await screen.findByRole('button', { name: 'Save profile' });
  return within(save.closest('form')!);
};

const renderCustomize = (routes: Record<string, (init?: RequestInit) => Response>) => {
  localStorage.setItem('token', 'tok');
  const fetchMock = stubFetch({
    '/api/auth/me': () => json(200, { user: USER }),
    '/api/subjects': () => json(200, { subjects: SUBJECTS }),
    ...routes,
  });
  render(
    <MemoryRouter initialEntries={['/app/customize']}>
      <AppProvider>
        <App />
      </AppProvider>
    </MemoryRouter>,
  );
  return fetchMock;
};

describe('Customize → Your profile', () => {
  it('shows the Google name as text, with no way to edit it', async () => {
    renderCustomize({});
    const form = await profileForm();
    expect(form.getByText('Siswa Calvin')).toBeInTheDocument();
    // The class is the only writable field; nothing offers to rename the account.
    expect(form.queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(form.getByLabelText('Your class')).toHaveValue('12.9');
  });

  it('sends the class and the chosen subject ids in one call', async () => {
    const fetchMock = renderCustomize({ '/api/user/class': () => json(200, { success: true }) });
    const user = userEvent.setup();
    const form = await profileForm();

    await user.click(await form.findByRole('button', { name: 'Fisika' }));
    await user.click(form.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(form.getByRole('status')).toHaveTextContent('Saved.'));
    const [, init] = fetchMock.mock.calls.find(
      ([i]) => new URL(String(i)).pathname === '/api/user/class',
    )!;
    expect(JSON.parse(String(init?.body))).toEqual({ class: '12.9', focus_subject_ids: [2] });
  });

  // Replaces "turns the worker refusal of an unregistered class into copy a
  // student can act on". That refusal no longer exists; what still has to work
  // is that a failed save says so in the worker's words and does not claim to
  // have saved.
  it('shows a worker error as it came, and does not claim the save worked', async () => {
    renderCustomize({
      '/api/user/class': () => json(400, { error: 'Unknown subject', details: [99] }),
    });
    const user = userEvent.setup();
    const form = await profileForm();

    await user.click(form.getByRole('button', { name: 'Save profile' }));

    const alert = await form.findByRole('alert');
    expect(alert).toHaveTextContent(/Unknown subject/);
    expect(form.queryByText('Saved.')).not.toBeInTheDocument();
  });

  it('a class off the school register saves like any other now', async () => {
    // USER.class is '12.9', which the register does not hold — the case this
    // file was originally written to show being refused.
    const fetchMock = renderCustomize({ '/api/user/class': () => json(200, { success: true }) });
    const user = userEvent.setup();
    const form = await profileForm();

    await user.click(form.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(form.getByRole('status')).toHaveTextContent('Saved.'));
    const [, init] = fetchMock.mock.calls.find(
      ([i]) => new URL(String(i)).pathname === '/api/user/class',
    )!;
    expect(JSON.parse(String(init?.body))).toMatchObject({ class: '12.9' });
  });
});
