import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { I, type IconName } from '@/components/ui/icons';
import { Kicker } from '@/components/ui/kicker';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

type NavItem = { label: string; to: string; icon: IconName };
/** Every screen here has the worker behind it. The demo-only screens live in `archive/demo-2026-11/`. */
const NAV: NavItem[] = [
  { label: 'Home', to: 'home', icon: 'house' },
  { label: 'Discover', to: 'discover', icon: 'compass' },
  { label: 'My notes', to: 'notes', icon: 'notebook' },
  { label: 'New note', to: 'create', icon: 'pencil' },
  { label: 'Quiz', to: 'quiz', icon: 'listChecks' },
  { label: 'Schedule', to: 'schedule', icon: 'users' },
  { label: 'Profile', to: 'profile', icon: 'userRound' },
];
/** Below 900px the rail becomes a bottom tab bar; short labels so five fit a 375px phone. */
const TAB_LABEL: Record<string, string> = { notes: 'Notes', create: 'New' };

/**
 * One gutter for the whole app chrome: the rail's rows and the page column start at the same x,
 * so the hairline rules line up down the screen. `min-[900px]` is the frame's own breakpoint (the
 * sidebar appears there), so the gutter widens exactly where the layout changes. The control bar
 * imports this value rather than repeating it — the two bands must never drift apart.
 */
export const GUTTER = 'px-4 sm:px-6 min-[900px]:px-10';
/** A rail row: flush at the gutter, separated from the next by a hairline. Not a box, not a fill. */
const ROW = cn(
  GUTTER,
  'flex items-center gap-[11px] w-full text-left border-0 border-b border-neutral-300 bg-transparent text-neutral-800 py-2.5 text-[14px] font-semibold cursor-pointer hover:text-ink',
);

const HEADS: Record<string, (name: string) => { h: string; s: string }> = {
  home: (n) => ({
    h: n ? `Hi, ${n}` : 'Home',
    s: 'Your latest work first, then what your school is reading.',
  }),
  discover: () => ({
    h: 'Discover',
    s: 'Notes your school has published. Likes decide what comes first.',
  }),
  notes: () => ({ h: 'My notes', s: 'Everything you have written, drafts included.' }),
  create: () => ({ h: 'New note', s: 'Write it, pick who sees it, publish. Drafts stay yours.' }),
  profile: () => ({ h: 'Profile', s: 'Your class decides whose class-only notes you see.' }),
};

/** App frame: sidebar (a fixed tab bar below 900px), page headline, then the routed page. */
export function Shell() {
  const { learner, isUser } = useApp();
  const nav = useNavigate();
  const page = useLocation().pathname.split('/').pop() ?? 'home';
  const head = (HEADS[page] ?? HEADS.home)(learner);
  const subjects = useAsync(() => api.subjects(), [], isUser);

  const rail = subjects.loading ? (
    [0, 1, 2].map((i) => (
      <span key={i} className={cn(GUTTER, 'block border-b border-neutral-300 py-[15px]')}>
        <span className="block h-3 w-24 bg-neutral-200" />
      </span>
    ))
  ) : subjects.error ? (
    <span className={cn(GUTTER, 'block py-2.5 text-[13px] text-neutral-700')}>
      Subjects unavailable
    </span>
  ) : (
    (subjects.data ?? [])
      .filter((s) => s.note_count > 0)
      .map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => nav(`/app/discover?subject=${s.id}`)}
          className={ROW}
        >
          <span className="flex-1 min-w-0 truncate">{s.name}</span>
          <span data-num className="text-xs font-semibold text-neutral-600 whitespace-nowrap">
            {s.note_count}
          </span>
        </button>
      ))
  );

  return (
    <div className="flex items-stretch min-h-[calc(100dvh-53px)]">
      <aside className="hidden min-[900px]:flex w-[248px] flex-[0_0_248px] bg-surface border-r border-neutral-300 py-6 flex-col gap-7">
        {/* The rows carry the gutter, not the aside, so a selected row's ink block runs rule to rule. */}
        <nav aria-label="Sidebar" className="flex flex-col border-t border-neutral-300">
          {NAV.map((n) => {
            const Icon = I[n.icon];
            return (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    GUTTER,
                    'flex items-center gap-3 w-full text-left border-b border-neutral-300 py-2.5 text-[15px] font-semibold no-underline hover:no-underline',
                    // Selected inverts; it does not tint.
                    isActive
                      ? 'bg-ink text-accent-100 font-extrabold'
                      : 'text-neutral-800 hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={isActive ? 'text-accent-100' : 'text-neutral-700'} />
                    {n.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2.5">
          <Kicker as="div" size="sm" className={cn(GUTTER, 'tracking-[0.18em]')}>
            Subjects
          </Kicker>
          <div className="flex flex-col border-t border-neutral-300">{rail}</div>
        </div>
      </aside>

      <main
        className={cn(
          GUTTER,
          'flex-1 min-w-0 pt-6 min-[900px]:pt-8 pb-28 min-[900px]:pb-14 flex flex-col gap-6 min-[900px]:gap-8',
        )}
      >
        <header className="flex items-end justify-between gap-4 flex-wrap border-b border-ink pb-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="text-[clamp(28px,4.2vw,52px)] [text-wrap:balance]">{head.h}</h1>
            <p className="text-[15px] leading-[1.45] text-neutral-700 max-w-[52ch] [text-wrap:pretty]">
              {head.s}
            </p>
          </div>
          {page !== 'create' && (
            <Link
              to="/app/create"
              className={cn(
                buttonVariants({ variant: 'primary' }),
                'hidden sm:inline-flex items-center gap-2 px-5 py-3 text-[14px] no-underline hover:no-underline hover:text-accent-100',
              )}
            >
              <I.plus size={18} /> New note
            </Link>
          )}
        </header>

        <Outlet />
      </main>

      {/* The 44×46 minimum is the touch target and must stay; safe-area padding keeps it above the home bar. */}
      <nav
        aria-label="Main"
        className="min-[900px]:hidden fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-ink bg-surface pt-2 px-1 pb-[max(10px,env(safe-area-inset-bottom))]"
      >
        {NAV.map((n) => {
          const Icon = I[n.icon];
          return (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-[5px] min-w-[44px] min-h-[46px] text-[11px] leading-none no-underline hover:no-underline',
                  isActive
                    ? 'font-extrabold text-ink'
                    : 'font-semibold text-neutral-700 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={isActive ? 'text-ink' : 'text-neutral-600'} />
                  {TAB_LABEL[n.to] ?? n.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
