import { Link, useNavigate } from 'react-router-dom';
import { GUTTER } from '@/components/layout/shell';
import { useApp } from '@/store';

/** Top strip: wordmark, then who is signed in. The old context switcher went with the demo (archive/demo-2026-11). */
export function ControlBar() {
  const { session, learner, signOut } = useApp();
  const nav = useNavigate();
  return (
    // The masthead rule is ink. `py-3` and the 19px wordmark are load
    // bearing: they set the 53px the Shell and the sign-in layout subtract from the viewport height.
    <div
      className={`${GUTTER} relative z-10 flex items-center gap-x-[18px] py-3 bg-surface border-b border-ink`}
    >
      <Link
        to={session ? '/app/home' : '/login'}
        className="text-[19px] font-extrabold tracking-[-0.03em] text-ink no-underline hover:no-underline"
      >
        Notarium
      </Link>
      {session?.kind === 'user' && (
        <div className="ml-auto flex items-center gap-3 text-[13px] min-w-0">
          {/* The only way in to the dashboard, and only for an account the worker calls an admin. */}
          {session.user.role === 'admin' && (
            <Link
              to="/admin"
              className="inline-flex items-center border border-ink px-3 py-1 text-[12px] font-bold text-ink no-underline whitespace-nowrap hover:bg-ink hover:text-accent-100 hover:no-underline"
            >
              Admin
            </Link>
          )}
          <span className="hidden sm:inline font-bold truncate max-w-[20ch]">
            {session.user.name || learner}
          </span>
          <button
            type="button"
            onClick={() => {
              signOut();
              nav('/login');
            }}
            className="border-0 bg-transparent p-0 text-[13px] font-bold text-neutral-700 underline underline-offset-[3px] decoration-neutral-400 cursor-pointer whitespace-nowrap hover:text-ink hover:decoration-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
