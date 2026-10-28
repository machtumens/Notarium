/**
 * The admin dashboard's own frame. It does NOT reuse `/app`'s Shell: that chrome is a student's
 * (subject rail, mode strip, "add to your space"), and none of it means anything here. What the
 * two share is the masthead, the gutter and the type scale, so the dashboard reads as the same
 * product one level up rather than as a different app.
 *
 * The route guard below is a courtesy, not the security boundary — every panel's data is gated by
 * `requireAdmin` / `requireModerator` / `requireTechnical` on the worker, and a student who types
 * /admin would get a wall of 403s even if this check were removed.
 */
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { GUTTER } from '@/components/layout/shell';
import { Kicker } from '@/components/ui/kicker';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';
import { Content } from './content';
import { Nodes } from './nodes';
import { Overview } from './overview';
import { People } from './people';
import { Publish } from './publish';
import { School } from './school';
import { System } from './system';

type Section = { to: string; label: string; head: string; sub: string };
const SECTIONS: Section[] = [
  {
    to: '',
    label: 'Overview',
    head: 'The school, today',
    sub: 'Who is here, what they wrote, and where the work is going. Read-only — every number on this page comes straight off the database.',
  },
  {
    to: 'people',
    label: 'People',
    head: 'Everyone on Notarium',
    sub: 'The register, and every power over it: warn, suspend, move a student between classes, edit a profile, remove an account. Nothing here touches a password.',
  },
  {
    to: 'content',
    label: 'Content',
    head: 'Every note in the school',
    sub: 'Feature it, upvote it, rewrite it, bin it, bring it back. The bin keeps a note until it is purged under System.',
  },
  {
    to: 'publish',
    label: 'Publish',
    head: 'Announcements and news',
    sub: 'Write once, to everyone or to one class, one grade, one student. It lands in their notifications the next time they open the app.',
  },
  {
    to: 'school',
    label: 'School',
    head: 'Subjects and classes',
    sub: 'The two lists the product is shaped around. A class has to exist and be active before anyone in it can sign up.',
  },
  {
    to: 'nodes',
    label: 'Nodes',
    head: 'The platform itself',
    sub: 'Worker, database, key store, providers and the edge numbers behind them. Probed live each time you open this page.',
  },
  {
    to: 'system',
    label: 'System',
    head: 'Switches and the log',
    sub: 'Maintenance mode, the feature flags, the counter rebuilds, the full admin activity log, and the two actions that cannot be undone.',
  },
];

/** `role === 'admin'` is what every admin route on the worker checks first; sub-roles are checked per route. */
function RequireAdmin() {
  const { session, sessionChecked } = useApp();
  const loc = useLocation();
  if (!sessionChecked)
    return (
      <div className={cn(GUTTER, 'py-8 text-sm text-neutral-700')}>Checking your session…</div>
    );
  if (session?.kind !== 'user')
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (session.user.role !== 'admin') return <Navigate to="/app/home" replace />;
  return <Outlet />;
}

function AdminShell() {
  const { session } = useApp();
  const tail = useLocation()
    .pathname.replace(/^\/admin\/?/, '')
    .split('/')[0];
  const here = SECTIONS.find((s) => s.to === tail) ?? SECTIONS[0];
  const who = session?.kind === 'user' ? session.user : null;

  return (
    <div className="flex items-stretch min-h-[calc(100vh-53px)]">
      <aside className="hidden min-[900px]:flex w-[232px] min-w-[196px] flex-[0_1_232px] bg-surface border-r border-neutral-300 py-8 flex-col gap-8">
        <Kicker as="div" size="sm" className={cn(GUTTER, 'tracking-[0.18em]')}>
          Administration
        </Kicker>
        <nav className="flex flex-col" aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.to === ''}
              className={({ isActive }) =>
                cn(
                  GUTTER,
                  'flex items-center w-full text-left border-b border-neutral-300 py-2.5 text-[15.5px] font-semibold no-underline hover:no-underline',
                  isActive
                    ? 'bg-ink text-accent-100 font-extrabold'
                    : 'text-neutral-800 hover:text-ink',
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className={cn(GUTTER, 'mt-auto flex flex-col gap-3 border-t border-ink pt-4')}>
          <span className="meta">Signed in as</span>
          <span className="text-[13px] font-bold truncate">{who?.name || who?.email}</span>
          <NavLink
            to="/app/home"
            className="text-[13px] font-bold text-neutral-700 no-underline underline-offset-[3px] hover:underline hover:text-ink"
          >
            Back to the app
          </NavLink>
        </div>
      </aside>

      <main
        className={cn(GUTTER, 'flex-1 min-w-0 pt-8 pb-32 min-[900px]:pb-14 flex flex-col gap-9')}
      >
        <header className="flex flex-col gap-[22px]">
          <div className="flex items-baseline justify-between gap-5 flex-wrap border-b border-neutral-300 pb-2.5">
            <Kicker size="sm" className="tracking-[0.16em]">
              Administration · <span className="text-ink">{here.label}</span>
            </Kicker>
            <Kicker size="sm" className="tracking-[0.16em]">
              Role · <span className="text-ink">{who?.role ?? '—'}</span>
            </Kicker>
          </div>
          <h1 className="text-[clamp(32px,5vw,64px)] max-w-[18ch] [text-wrap:balance]">
            {here.head}
          </h1>
          <p className="max-w-[62ch] text-base leading-[1.5] text-neutral-700 [text-wrap:pretty] border-t border-ink pt-3.5">
            {here.sub}
          </p>
        </header>

        <Outlet />
      </main>

      {/* Below 900px the rail is gone, so the sections become the fixed tab bar — the same device
          the student app uses, with the app link folded in as the last tab. */}
      <nav
        aria-label="Admin sections"
        className="min-[900px]:hidden fixed inset-x-0 bottom-0 z-20 flex justify-around overflow-x-auto border-t border-ink bg-surface pt-2.5 px-2 pb-3.5"
      >
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={s.to === ''}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center min-w-[52px] min-h-[46px] text-[11px] leading-none no-underline hover:no-underline',
                isActive
                  ? 'font-extrabold text-ink'
                  : 'font-semibold text-neutral-700 hover:text-ink',
              )
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Mounted at `/admin/*` by App, so the paths below are relative to it. */
export function Admin() {
  return (
    <Routes>
      <Route element={<RequireAdmin />}>
        <Route element={<AdminShell />}>
          <Route index element={<Overview />} />
          <Route path="people" element={<People />} />
          <Route path="content" element={<Content />} />
          <Route path="publish" element={<Publish />} />
          <Route path="school" element={<School />} />
          <Route path="nodes" element={<Nodes />} />
          <Route path="system" element={<System />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
