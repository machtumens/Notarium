import { Link, useNavigate } from 'react-router-dom';
import { GUTTER } from '@/components/layout/shell';
import { Kicker } from '@/components/ui/kicker';
import { cn } from '@/lib/utils';
import { useApp, type Ctx } from '@/store';

const CTXS: { id: Ctx; label: string }[] = [
  { id: 'normal', label: 'Normal week' },
  { id: 'exam', label: 'Exam week' },
  { id: 'session', label: 'Session' },
  { id: 'break', label: 'Quick break' },
];

/**
 * Top strip: wordmark, the context switcher, and who is signed in. Theme and background
 * pickers live in Customize. Accounts do not get the Session context (it only drives the
 * demo tutor modules) and see their name + sign out; guests see the sample-data label.
 */
export function ControlBar() {
  const { ctx, setCtx, session, isUser, learner, signOut } = useApp();
  const nav = useNavigate();
  const ctxs = isUser ? CTXS.filter((c) => c.id !== 'session') : CTXS;
  return (
    // The masthead rule is ink. `py-3` and the 19px wordmark are load
    // bearing: they set the 53px the Shell and the sign-in layout subtract from the viewport height.
    <div
      className={cn(
        GUTTER,
        'relative z-10 flex flex-wrap items-center gap-x-[18px] gap-y-1.5 py-3 bg-surface border-b border-ink',
      )}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="text-[19px] font-extrabold tracking-[-0.03em]">Notarium</span>
        <Kicker size="sm">Adaptive learning</Kicker>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-x-[26px] gap-y-1.5">
        {/* The context switcher only means something inside the app: every one of these navigates to
            /app/home, which a visitor with no session is bounced straight back out of. On the sign-in
            screen it was chrome that did nothing, so it is not drawn there. */}
        {session && (
          <div className="flex flex-wrap items-baseline gap-2.5">
            <Kicker size="sm">Context</Kicker>
            <div className="flex flex-wrap gap-4">
              {ctxs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="tabline"
                  data-on={ctx === c.id}
                  onClick={() => {
                    setCtx(c.id);
                    nav('/app/home');
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {session?.kind === 'user' && (
          <div className="flex items-center gap-3 text-[13px]">
            <span className="font-bold truncate max-w-[20ch]">{session.user.name || learner}</span>
            <button
              type="button"
              onClick={() => {
                signOut();
                nav('/login');
              }}
              className="border-0 bg-transparent p-0 text-[13px] font-bold text-neutral-700 underline underline-offset-[3px] decoration-neutral-400 cursor-pointer hover:text-ink hover:decoration-ink"
            >
              Sign out
            </button>
          </div>
        )}
        {session?.kind === 'guest' && (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="inline-flex items-center border border-neutral-400 px-3 py-1 text-[12px] font-bold text-neutral-700 whitespace-nowrap">
              Guest · sample data
            </span>
            <Link to="/onboard" className="font-semibold whitespace-nowrap">
              Create an account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
