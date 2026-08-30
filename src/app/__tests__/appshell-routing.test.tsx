// AppShell routing smoke tests — the first end-to-end route-render coverage for
// AppRoutes (Paperloop Phase 1). They drive the real <AppRoutes> tree through a
// MemoryRouter + a real AuthContext.Provider and assert the correct page mounts
// at each URL. This locks the tab-state → URL-route migration:
//   /       (authenticated)   -> TodayPage (the new default landing)
//   /review (authenticated)   -> ReviewPageRoute (preserved standalone route)
//   /       (unauthenticated) -> redirect to /login (ProtectedRoute gate)
//
// jsdom cannot run the Three.js/Canvas <BeamsBackground>, so it is mocked to a
// no-op (Step H0). The lazy page bodies that self-fetch (ReviewPage, Login) are
// stubbed to stable sentinels so the smoke tests stay deterministic and never
// hit the network — the routing wiring is what is under test, not page content.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks (all hoisted above the AppRoutes import) -------------------------

// WebGL background — unavailable in jsdom. Mock BOTH specifier forms that the
// shell components import it under (AppShell uses './ui/beams-background',
// ReviewPageRoute uses '../components/ui/beams-background'); the '@/' alias form
// is the one Vitest resolves and dedupes on.
vi.mock('@/components/ui/beams-background', () => ({
  BeamsBackground: () => null,
}));

// api singleton — TodayPage (getStudyStats/getDueReviews/request) and AppShell
// (notifications.getUnreadCount, isAuthenticated) both touch it on mount.
const api = vi.hoisted(() => ({
  isAuthenticated: vi.fn(() => true),
  getStudyStats: vi.fn(() =>
    Promise.resolve({
      current_streak: 0,
      longest_streak: 0,
      learning_points: 0,
      due_count: 0,
    }),
  ),
  getDueReviews: vi.fn(() => Promise.resolve({ items: [], due_count: 0 })),
  getLeaderboard: vi.fn(() => Promise.resolve({ leaderboard: [] })),
  request: vi.fn(() => Promise.resolve({ notes: [] })),
  notifications: {
    getUnreadCount: vi.fn(() => Promise.resolve({ count: 0 })),
    // Progress mounts BadgeShelf, which reads this.
    getBadges: vi.fn(() => Promise.resolve({ badges: [], rank: 0, tests_completed: 0 })),
  },
}));
vi.mock('../../lib/api', () => ({ default: api }));

// Lazy page bodies that self-fetch — stub to stable sentinels so the routing
// assertions do not depend on page internals or the network.
vi.mock('../../pages/ReviewPage', () => ({
  default: () => <div>REVIEW PAGE CONTENT</div>,
}));
vi.mock('../../pages/Login', () => ({
  default: () => <div>LOGIN PAGE CONTENT</div>,
}));
// Paperloop Phase 2 standalone routes. Sentinel-mock the page bodies themselves
// (not just api.notes.getNote) — ProcessPage self-fetches a note and
// CaptureNotePage mounts CameraCapture (navigator.mediaDevices, absent in jsdom),
// neither of which this pure routing test should exercise.
vi.mock('../../pages/ProcessPage', () => ({
  default: () => <div>PROCESS PAGE CONTENT</div>,
}));
vi.mock('../../pages/CaptureNotePage', () => ({
  default: () => <div>CAPTURE PAGE CONTENT</div>,
}));
// Paperloop Phase 4: /quiz now renders QuizBuilderPage (replacing ComingSoonPage).
// It self-fetches notes/subjects on mount, so sentinel-mock it like the others.
vi.mock('../../pages/QuizBuilderPage', () => ({
  default: () => <div>QUIZ BUILDER CONTENT</div>,
}));
// Paperloop Phase 5: /primer renders PrimerPage inside AppShell. Sentinel-mock it
// so this routing test asserts only that the correct component mounts at /primer,
// not PrimerPage's topic-input/generate internals.
vi.mock('../../pages/PrimerPage', () => ({
  default: () => <div>PRIMER PAGE CONTENT</div>,
}));

import { AppRoutes } from '../AppRoutes';
import { AuthContext } from '../AuthContext';
import type { AuthContextType } from '../types';
import type { User } from '../../types';

// --- Helpers ----------------------------------------------------------------

const AUTHED_USER = { id: 1, name: 'Study Buddy', role: 'student' } as unknown as User;

function renderAt(path: string, auth: Partial<AuthContextType>) {
  const value: AuthContextType = {
    user: null,
    loading: false,
    logout: () => {},
    refreshUser: async () => {},
    ...auth,
  } as AuthContextType;
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.isAuthenticated.mockReturnValue(true);
  api.getStudyStats.mockResolvedValue({
    current_streak: 0,
    longest_streak: 0,
    learning_points: 0,
    due_count: 0,
  });
  api.getDueReviews.mockResolvedValue({ items: [], due_count: 0 });
  api.getLeaderboard.mockResolvedValue({ leaderboard: [] });
  api.request.mockResolvedValue({ notes: [] });
  api.notifications.getUnreadCount.mockResolvedValue({ count: 0 });
});

// --- Tests ------------------------------------------------------------------

describe('AppShell routing (Paperloop Phase 1)', () => {
  it('renders TodayPage at / for an authenticated user (new default landing)', async () => {
    renderAt('/', { user: AUTHED_USER, loading: false });
    // TodayPage resolves its lazy chunk + loading state, then renders the greeting.
    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    // The Community/Subjects WebGL page must NOT be what mounts at / anymore.
    expect(screen.queryByText(/loading your dashboard/i)).not.toBeInTheDocument();
    // Paperloop Phase 5: the "Prep for class" card is the discoverability entry
    // point to /primer and must render on the Today dashboard.
    expect(screen.getByRole('button', { name: /prep for class/i })).toBeInTheDocument();
  });

  it('renders ReviewPageRoute at /review for an authenticated user (preserved route)', async () => {
    renderAt('/review', { user: AUTHED_USER, loading: false });
    expect(await screen.findByText('REVIEW PAGE CONTENT')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user at / to /login', async () => {
    renderAt('/', { user: null, loading: false });
    // ProtectedRoute bounces to /login; the (stubbed) Login page mounts.
    expect(await screen.findByText('LOGIN PAGE CONTENT')).toBeInTheDocument();
    // The protected TodayPage greeting must never appear for an unauthed visitor.
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
  });

  it('renders CaptureNotePage at /notes/capture (standalone, no AppShell)', async () => {
    renderAt('/notes/capture', { user: AUTHED_USER, loading: false });
    expect(await screen.findByText('CAPTURE PAGE CONTENT')).toBeInTheDocument();
  });

  it('renders ProcessPage at /notes/:id/process (standalone, no AppShell)', async () => {
    renderAt('/notes/123/process', { user: AUTHED_USER, loading: false });
    expect(await screen.findByText('PROCESS PAGE CONTENT')).toBeInTheDocument();
  });

  it('renders ProgressRoute (LeaderboardPage) at /progress with the Progress heading and no Contributors/Learners toggle', async () => {
    renderAt('/progress', { user: AUTHED_USER, loading: false });
    // Assert the PAGE heading specifically (role-scoped). A plain findByText('Progress')
    // would also match the AppShell sidebar's "Progress" nav <button>, which mounts
    // inside the same shell layout — the heading role uniquely targets the <h2>.
    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    // The Contributors/Top Learners toggle was deleted — a single learning-ranked
    // list renders, so neither toggle label is present anywhere on the page.
    expect(screen.queryByText(/contributors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/top learners/i)).not.toBeInTheDocument();
  });

  it('renders QuizBuilderPage at /quiz (replaces the ComingSoon placeholder)', async () => {
    renderAt('/quiz', { user: AUTHED_USER, loading: false });
    expect(await screen.findByText('QUIZ BUILDER CONTENT')).toBeInTheDocument();
    // The old "coming soon" placeholder copy must be gone.
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('renders PrimerPage at /primer for an authenticated user', async () => {
    renderAt('/primer', { user: AUTHED_USER, loading: false });
    expect(await screen.findByText('PRIMER PAGE CONTENT')).toBeInTheDocument();
  });

  it('no longer exposes a /chat route (chat feature removed in Phase 4)', () => {
    renderAt('/chat', { user: AUTHED_USER, loading: false });
    // The /chat route was deleted, so nothing page-specific mounts at /chat —
    // not the quiz page that took chat's nav slot, nor the Today dashboard.
    expect(screen.queryByText('QUIZ BUILDER CONTENT')).not.toBeInTheDocument();
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
  });
});
