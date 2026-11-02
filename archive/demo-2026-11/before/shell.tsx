import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { I, type IconName } from '@/components/ui/icons';
import { Kicker } from '@/components/ui/kicker';
import { api } from '@/lib/api';
import { ACCOUNT_HEADS, ACCOUNT_PAGE_HEADS, HEADS, PAGE_HEADS, SUBJECTS } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { cn, tone } from '@/lib/utils';
import { MODE_CTX, useApp, type Mode } from '@/store';

type NavItem = { label: string; to: string; icon: IconName };
const NAV: NavItem[] = [
  { label: 'Home', to: 'home', icon: 'house' },
  { label: 'Discover', to: 'discover', icon: 'compass' },
  { label: 'Practice', to: 'practice', icon: 'dumbbell' },
  { label: 'Notes', to: 'notes', icon: 'notebook' },
  { label: 'Tutors', to: 'tutors', icon: 'users' },
  { label: 'Progress', to: 'progress', icon: 'chart' },
  { label: 'Create', to: 'create', icon: 'pencil' },
];
/** Accounts only see screens with a backend behind them; Practice, Tutors, Progress and the AI surface stay demo-only. */
const USER_NAV = new Set(['home', 'discover', 'notes', 'create']);
/** Below 900px the sidebar is gone, so the guest's AI surface gets a tab of its own. */
const AI_TAB: NavItem = { label: 'AI', to: 'ai', icon: 'sparkles' };
const MODES: Mode[] = ['Explore', 'Study', 'Practice', 'Tutor', 'Review', 'Exam'];
/**
 * One gutter for the whole app chrome: the rail's rows and the page column start at the same x,
 * so the hairline rules line up down the screen. `min-[900px]` is the frame's own breakpoint (the
 * sidebar appears there), so the gutter widens exactly where the layout changes. The control bar
 * imports this value rather than repeating it — the two bands must never drift apart.
 */
export const GUTTER = 'px-6 min-[900px]:px-10';
/** A rail row: flush at the gutter, separated from the next by a hairline. Not a box, not a fill. */
const ROW = cn(
  GUTTER,
  'flex items-center gap-[11px] w-full text-left border-0 border-b border-neutral-300 bg-transparent text-neutral-800 py-2.5 text-[14.5px] font-semibold cursor-pointer hover:text-ink',
);

/** App frame: sidebar (a fixed tab bar below 900px), page headline + mode strip, then the routed page. */
export function Shell() {
  const { learner, ctx, mode, adapt, set, isUser, session } = useApp();
  const nav = useNavigate();
  const page = useLocation().pathname.split('/').pop() ?? 'home';
  const homeHead =
    session?.kind === 'user'
      ? ACCOUNT_HEADS[ctx](learner, session.user.notes_count ?? 0)
      : HEADS[ctx](learner);
  const pageKey = page === 'notes' ? 'note' : page;
  const pageHead = (isUser && ACCOUNT_PAGE_HEADS[pageKey]) || PAGE_HEADS[pageKey];
  const head = page === 'home' || !pageHead ? homeHead : pageHead;
  const items = isUser ? NAV.filter((n) => USER_NAV.has(n.to)) : NAV;
  const subjects = useAsync(() => api.subjects(), [], isUser);

  const pickMode = (m: Mode) => {
    if (m === 'Explore') {
      set({ mode: m });
      nav('/app/discover');
      return;
    }
    if (m === 'Practice') {
      set({ mode: m, practiceView: 'landing' });
      nav('/app/practice');
      return;
    }
    set({ mode: m, ctx: MODE_CTX[m] ?? 'normal' });
    nav('/app/home');
  };

  const rail = !isUser ? (
    SUBJECTS.map((s) => (
      <button key={s.label} type="button" onClick={() => nav('/app/progress')} className={ROW}>
        <span className="flex-1 min-w-0">{s.label}</span>
        <span className="block w-[34px] h-1 bg-neutral-300 flex-[0_0_34px] overflow-hidden">
          <span className="block h-1" style={{ background: tone(s.pct), width: `${s.pct}%` }} />
        </span>
        <span
          data-num
          className="text-[14.5px] font-extrabold text-ink w-[26px] text-right flex-[0_0_26px]"
        >
          {s.pct}
        </span>
      </button>
    ))
  ) : subjects.loading ? (
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
    (subjects.data ?? []).map((s) => (
      <button key={s.id} type="button" onClick={() => nav('/app/discover')} className={ROW}>
        <span className="flex-1 min-w-0 truncate">{s.name}</span>
        <span data-num className="text-xs font-semibold text-neutral-700 whitespace-nowrap">
          {s.note_count} {s.note_count === 1 ? 'note' : 'notes'}
        </span>
      </button>
    ))
  );

  return (
    <div className="flex items-stretch min-h-[calc(100vh-53px)]">
      {/* 268px, not the old 252px: the column grew by the extra gutter so the rail keeps the text
          width it had when the rows carried their own 14px inset. */}
      <aside className="hidden min-[900px]:flex w-[268px] min-w-[214px] flex-[0_1_268px] bg-surface border-r border-neutral-300 py-8 flex-col gap-8">
        {/* The rows carry the gutter, not the aside, so a selected row's ink block runs rule to rule. */}
        <nav className="flex flex-col">
          {items.map((n) => {
            const Icon = I[n.icon];
            return (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    GUTTER,
                    'flex items-center gap-3 w-full text-left border-b border-neutral-300 py-2.5 text-[15.5px] font-semibold no-underline hover:no-underline',
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

        <div className="flex flex-col gap-2.5 border-t border-ink pt-4">
          <Kicker as="div" size="sm" className={cn(GUTTER, 'tracking-[0.18em]')}>
            {isUser ? 'Subjects' : 'Your learning'}
          </Kicker>
          <div className="flex flex-col">{rail}</div>
        </div>

        <div className={cn(GUTTER, 'mt-auto flex flex-col gap-4')}>
          {!isUser && (
            // A hairline box that inverts on hover: the rail's one affordance, and the only
            // inversion down here (the page's + button spends the solid-ink one).
            <button
              type="button"
              onClick={() => nav('/app/ai')}
              className={cn(
                buttonVariants({ variant: 'slot' }),
                'flex items-center gap-2.5 px-4 py-3 text-[14.5px] text-left',
              )}
            >
              <I.sparkles /> Ask Notarium AI
            </button>
          )}
          <button
            type="button"
            onClick={() => nav('/app/customize')}
            className="flex items-center gap-[9px] border-0 bg-transparent p-0 text-[13px] font-bold text-neutral-700 text-left cursor-pointer underline underline-offset-[3px] decoration-neutral-400 hover:text-ink hover:decoration-ink"
          >
            <I.sliders size={17} className="text-neutral-600" />
            Customize your space
          </button>
          <div className="flex items-center gap-2.5">
            {/* A monogram is one of the few genuinely circular things the system keeps. */}
            <span className="w-8 h-8 rounded-full bg-ink text-accent-100 flex items-center justify-center text-[13px] font-extrabold flex-[0_0_32px]">
              {learner[0]}
            </span>
            <span className="text-[13px] font-bold truncate">{learner}</span>
          </div>
        </div>
      </aside>

      <main
        className={cn(GUTTER, 'flex-1 min-w-0 pt-8 pb-32 min-[900px]:pb-14 flex flex-col gap-8')}
      >
        {!isUser && (
          <div className="flex items-baseline justify-between gap-[18px] flex-wrap border-b border-neutral-300 pb-2.5">
            <Kicker size="sm" className="tracking-[0.16em]">
              Orchestrator · <span className="text-ink">{mode} mode</span>
            </Kicker>
            <Kicker size="sm" className="tracking-[0.16em]">
              Adaptation · <span className="text-ink">{adapt}</span>
            </Kicker>
          </div>
        )}

        <header className="flex flex-col gap-[22px]">
          <div className="flex items-start justify-between gap-7 flex-wrap">
            {/* flex-1 below 900px keeps the + button beside a wrapping headline; desktop keeps the design's flow */}
            <h1 className="flex-1 min-[900px]:flex-initial text-[clamp(32px,5vw,64px)] max-w-[15ch] [text-wrap:balance]">
              {head.h}
            </h1>
            <button
              type="button"
              onClick={() => nav('/app/customize')}
              aria-label="Add to your space"
              className={cn(
                buttonVariants({ variant: 'primary' }),
                'flex-none w-[54px] h-[54px] flex items-center justify-center',
              )}
            >
              <I.plus size={24} />
            </button>
          </div>
          <div className="flex gap-10 flex-wrap items-start">
            <p className="flex-[0_1_44ch] min-w-[min(100%,280px)] text-base leading-[1.5] text-neutral-700 [text-wrap:pretty] border-t border-ink pt-3.5">
              {head.s}
            </p>
            {!isUser && (
              <div className="flex-[0_1_auto] flex flex-col gap-[9px] border-t border-neutral-300 pt-3.5">
                <Kicker size="sm" className="tracking-[0.16em]">
                  Mode
                </Kicker>
                <div className="flex gap-[18px] flex-wrap">
                  {MODES.map((m) => (
                    // .tabline[data-on='true'] already carries the selected weight and ink rule — the call site adds nothing.
                    <button
                      key={m}
                      type="button"
                      className="tabline text-sm"
                      data-on={mode === m}
                      onClick={() => pickMode(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {!isUser && (
          // Was a tinted box; a notice is a line of text under a quiet rule.
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-300 pt-3 text-[13px] leading-[1.4] text-neutral-700">
            <span className="flex-1 min-w-[min(100%,240px)]">
              You are browsing with sample data. Create an account to write and publish your own
              notes.
            </span>
            <Link
              to="/onboard"
              className={cn(
                buttonVariants({ variant: 'slot' }),
                'inline-flex items-center px-3.5 py-1.5 text-[12.5px] no-underline hover:no-underline whitespace-nowrap',
              )}
            >
              Create an account
            </Link>
          </div>
        )}

        <Outlet />
      </main>

      {/* px-2, not the page gutter: eight tabs at the 44px minimum need every pixel of a 375px
          phone. The 44×46 minimum is the touch target and must stay. */}
      <nav
        aria-label="Main"
        className="min-[900px]:hidden fixed inset-x-0 bottom-0 z-20 flex justify-around overflow-x-auto border-t border-ink bg-surface pt-2.5 px-2 pb-3.5"
      >
        {(isUser ? items : items.concat(AI_TAB)).map((n) => {
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
                  {n.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
