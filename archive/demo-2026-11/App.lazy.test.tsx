import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AppProvider } from '@/store';

/**
 * W5.1: the guest-only pages are separate chunks fetched on first use. The Practice module is held
 * behind a gate so the test can look at the app while the chunk is "in flight" — the Shell must stay
 * mounted and one loading line stands in for the page. The gate opens by itself after 2 s so a tree
 * that still imports the page statically fails this test instead of hanging the run.
 */
const gate = vi.hoisted(() => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
});
vi.mock('@/pages/practice', async (importOriginal) => {
  await Promise.race([gate.opened, new Promise((resolve) => setTimeout(resolve, 2000))]);
  return importOriginal();
});

describe('guest-only pages load on demand (W5.1)', () => {
  it('keeps the Shell on screen with one loading line while the Practice chunk loads, then shows the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const user = userEvent.setup();
    sessionStorage.setItem('notarium:guest', '1');
    render(
      <MemoryRouter initialEntries={['/app/home']}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
    await user.click((await screen.findAllByRole('link', { name: 'Practice' }))[0]);
    // the chunk is still loading: the sidebar is untouched and the page slot shows the fallback
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Practice' })[0]).toBeInTheDocument();
    expect(screen.queryByText('Recommended set')).toBeNull();

    gate.open();
    expect(await screen.findByText('Recommended set')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  });
});
