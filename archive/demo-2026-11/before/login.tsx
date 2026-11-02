import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { I } from '@/components/ui/icons';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

const alertCls = 'bg-ink px-4 py-2.5 text-[13px] font-semibold text-accent-100';

/**
 * Sign in — and, since the landing page is gone, the whole front door. One way in: the school
 * Google account. No password form, no guest demo, no second button to weigh up.
 */
export function Login() {
  const nav = useNavigate();
  const state = useLocation().state as { from?: string; reason?: string } | null;
  const from = state?.from ?? '/app/home';
  const { offline, recheckSession } = useApp();

  // The worker sends a refused Google sign-in back here as ?google=error&reason=…
  // The callback screen says the same things; this covers the redirect that never
  // reached it (no code to exchange, so no reason to render a whole screen).
  const [search] = useSearchParams();
  const googleError =
    search.get('google') === 'error'
      ? search.get('reason') === 'email_unverified'
        ? 'Google has not verified that address. Verify it with Google, then try again.'
        : 'Google sign-in did not finish. Try again.'
      : null;

  // W5.4: RequireSession lands here with `reason: 'offline'` when the session check got no verdict (network, 429, 5xx).
  // The token was kept, so a retry can pick the page back up; a 401 on the retry drops it and this notice with it.
  const [checking, setChecking] = useState(false);
  const unreachable = state?.reason === 'offline' && offline;
  const retry = async () => {
    setChecking(true);
    try {
      if (await recheckSession()) nav(from);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div data-screen-label="Sign in" className="px-6 md:px-10 pt-12 pb-20">
      <div className="w-full max-w-[440px] flex flex-col gap-7">
        <header className="flex flex-col gap-3 border-t-2 border-ink pt-5">
          <span className="meta">Notarium</span>
          <h1 className="text-[clamp(32px,5vw,48px)]">Sign in</h1>
          <p className="text-[15px] leading-[1.45] text-neutral-700 [text-wrap:pretty]">
            Your class notes, your subjects and everything you have written, on the account your
            school already gave you.
          </p>
        </header>

        {/* ponytail: the school icon, not Google's coloured mark — this system has
            no colour. Swap in the official G if brand compliance is ever asked for. */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => api.auth.googleSignIn(from)}
            className={cn(
              buttonVariants({ variant: 'primary' }),
              'flex items-center justify-center gap-2.5 px-6 py-[14px] text-[15px] min-h-[50px] w-full',
            )}
          >
            <I.school size={18} /> Continue with Google
          </button>
          <p className="text-[12.5px] text-neutral-700">
            Any Google account can sign in. First time is the same button — it makes the account.
          </p>
          {googleError && (
            <p role="alert" className={alertCls}>
              {googleError}
            </p>
          )}
        </div>

        {/* An alert is the one inverted block on this screen — it is the loudest thing here, so it
            spends the ink. Retry takes the `dark` variant: a hairline on ink that flips to paper. */}
        {unreachable && (
          <p role="alert" className={cn(alertCls, 'flex flex-wrap items-center gap-3')}>
            <span className="flex-1 min-w-[160px]">Could not reach Notarium — try again</span>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={checking}
              className={cn(
                buttonVariants({ variant: 'dark' }),
                'px-4 py-1.5 text-[12.5px] disabled:opacity-60 disabled:cursor-not-allowed',
              )}
            >
              {checking ? 'Checking…' : 'Retry'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
