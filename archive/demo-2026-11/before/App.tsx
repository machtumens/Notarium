import { Suspense, lazy } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from '@/store';
import { ControlBar } from '@/components/layout/control-bar';
import { GUTTER, Shell } from '@/components/layout/shell';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Login } from '@/pages/login';
import { Onboard } from '@/pages/onboard';
import { AuthCallback } from '@/pages/auth-callback';
import { Welcome } from '@/pages/welcome';
import { Home } from '@/pages/home';
import { Customize } from '@/pages/customize';
import { Notes } from '@/pages/notes';
import { Discover } from '@/pages/discover';
import { Ai } from '@/pages/ai';
import { Create } from '@/pages/create';

// The demo-only screens are their own chunks, fetched on first use: an account is redirected away from
// all of them (DemoOnly), so its bundle should not carry them. The pages keep their named exports.
const Progress = lazy(() => import('@/pages/progress').then((m) => ({ default: m.Progress })));
const Practice = lazy(() => import('@/pages/practice').then((m) => ({ default: m.Practice })));
const Tutors = lazy(() => import('@/pages/tutors').then((m) => ({ default: m.Tutors })));
const Session = lazy(() => import('@/pages/session').then((m) => ({ default: m.Session })));
const Mobile = lazy(() => import('@/pages/mobile').then((m) => ({ default: m.Mobile })));

/**
 * The admin dashboard is its own chunk: it is seven screens and a second API client, and only an
 * account whose `role` is 'admin' can open any of it. A student must never download it.
 */
const Admin = lazy(() => import('@/pages/admin').then((m) => ({ default: m.Admin })));

/**
 * The front door. There is no landing page any more — Notarium is a tool, so the root is either the
 * app (you are signed in) or the sign-in screen (you are not). Wait for the token check first, or a
 * returning account would be bounced to /login for a frame before being sent back.
 */
function Root() {
  const { session, sessionChecked } = useApp();
  if (!sessionChecked)
    return (
      <div className={cn(GUTTER, 'py-8 text-sm text-neutral-700')}>Checking your session…</div>
    );
  return <Navigate to={session ? '/app/home' : '/login'} replace />;
}

/**
 * `/app/*` needs a session (account or guest); wait for the token check before deciding. A check that got no verdict
 * (`offline`) still goes to /login, with `reason: 'offline'` so the page offers a Retry instead of a fresh sign-in.
 */
function RequireSession() {
  const { session, sessionChecked, offline } = useApp();
  const loc = useLocation();
  if (!sessionChecked)
    return (
      <div className={cn(GUTTER, 'py-8 text-sm text-neutral-700')}>Checking your session…</div>
    );
  if (!session)
    return (
      <Navigate
        to="/login"
        replace
        state={offline ? { from: loc.pathname, reason: 'offline' } : { from: loc.pathname }}
      />
    );
  // An account with no class has not finished the profile step — Google creates
  // the row with `class` NULL on purpose. Notes written without a class never
  // reach the class-scoped feeds, so the step is a gate, not a suggestion.
  // Guests have no class and never need one.
  if (session.kind === 'user' && !session.user.class) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

/** /welcome itself needs the session but must not be sent back to itself by the class gate. */
function RequireAccount() {
  const { session, sessionChecked } = useApp();
  if (!sessionChecked)
    return (
      <div className={cn(GUTTER, 'py-8 text-sm text-neutral-700')}>Checking your session…</div>
    );
  if (session?.kind !== 'user') return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Screens with no backend behind them (main has no chat, practice, tutor or progress routes): guests get the demo,
 * accounts land on Home. The one Suspense boundary for the lazy demo chunks lives here, inside the Shell, so
 * only the page slot shows the loading line while a chunk is fetched.
 */
function DemoOnly() {
  const { isUser, sessionChecked } = useApp();
  // ponytail: /mobile sits outside RequireSession, so wait for the token check or an account would flash the demo.
  if (!sessionChecked) return null;
  if (isUser) return <Navigate to="/app/home" replace />;
  return (
    <Suspense fallback={<div className="p-8 text-sm text-neutral-700">Loading…</div>}>
      <Outlet />
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className={cn(GUTTER, 'py-16 flex flex-col items-start gap-5')}>
      <h1 className="text-[clamp(32px,5vw,64px)] [text-wrap:balance]">That page is not here</h1>
      <p className="border-t border-ink pt-4 max-w-[46ch] text-base text-neutral-700 [text-wrap:pretty]">
        The link may be old, or the page has moved.
      </p>
      <Link
        to="/app/home"
        className={cn(
          buttonVariants({ variant: 'primary' }),
          'inline-flex items-center px-5 py-2.5 text-sm no-underline hover:no-underline hover:text-accent-100',
        )}
      >
        Go to Home
      </Link>
    </div>
  );
}

export function App() {
  return (
    <div className="relative min-h-screen bg-bg">
      <ControlBar />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboard" element={<Onboard />} />
        {/* Where Google sends the browser back; it owns no session of its own. */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireAccount />}>
          <Route path="/welcome" element={<Welcome />} />
        </Route>
        <Route element={<DemoOnly />}>
          <Route path="/mobile" element={<Mobile />} />
        </Route>
        {/* `/admin/*` carries its own guard and its own frame, and one Suspense for its chunk. */}
        <Route
          path="/admin/*"
          element={
            <Suspense
              fallback={
                <div className={cn(GUTTER, 'py-8 text-sm text-neutral-700')}>
                  Loading the dashboard…
                </div>
              }
            >
              <Admin />
            </Suspense>
          }
        />
        <Route element={<RequireSession />}>
          <Route path="/app" element={<Shell />}>
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="customize" element={<Customize />} />
            <Route path="notes" element={<Notes />} />
            <Route path="discover" element={<Discover />} />
            <Route path="create" element={<Create />} />
            <Route element={<DemoOnly />}>
              <Route path="ai" element={<Ai />} />
              <Route path="progress" element={<Progress />} />
              <Route path="practice" element={<Practice />} />
              <Route path="tutors" element={<Tutors />} />
              <Route path="session" element={<Session />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
