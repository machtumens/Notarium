import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

/** The worker's own `reason=` codes, said in words a student can act on. */
const REASONS: Record<string, string> = {
  domain:
    'That Google account is not a school account. Sign in with your @sekolahkristencalvin.org address.',
  email_unverified:
    'Google has not verified that address yet. Ask the school IT team to check the account.',
  suspended: 'This account is suspended. Talk to a teacher or the school IT team.',
  access_denied: 'You cancelled the Google sign-in.',
  oauth_not_configured:
    'Google sign-in is not switched on yet. Use your email and password for now.',
  state_expired: 'That sign-in took too long. Try again.',
  invalid_state: 'That sign-in link is no longer valid. Try again.',
};
const fallback = (reason: string | null) =>
  (reason && REASONS[reason]) || 'Google sign-in did not finish. Try again.';

/**
 * Where Google sign-in lands: `?code=` is the worker's one-time code, swapped
 * here for a session. Nothing is rendered for long — on success this redirects,
 * and on failure it says why and offers the way back.
 *
 * A brand-new account has no class yet, which is what sends them to /welcome
 * before the app proper.
 */
export function AuthCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { signIn } = useApp();
  const [error, setError] = useState<string | null>(null);
  // ponytail: React 18 StrictMode mounts effects twice in dev and the code is
  // single-use — the second run would always fail. One attempt per mount.
  const tried = useRef(false);

  const code = params.get('code');
  const reason = params.get('reason');

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;

    if (params.get('google') === 'error' || !code) {
      setError(fallback(reason));
      return;
    }

    void (async () => {
      try {
        // The exchange answers with a token only; the account itself comes from
        // /me, which is also what tells us whether the profile step is needed.
        const tok = await api.auth.googleExchange(code);
        const { user } = await api.auth.me();
        signIn(user, tok);
        const back = api.auth.takeGoogleReturn();
        nav(user.class ? (back ?? '/app/home') : '/welcome', { replace: true });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : fallback(null));
      }
    })();
  }, [code, reason, params, nav, signIn]);

  return (
    <div className="px-6 md:px-10 py-16 flex justify-center">
      <div className="w-[min(100%,560px)] flex flex-col gap-5">
        <span className="meta">{error ? 'Sign in' : 'Signing you in'}</span>
        {error ? (
          <>
            <h1 className="text-[clamp(28px,4vw,48px)] [text-wrap:balance]">That did not work</h1>
            <p
              role="alert"
              className="border-t border-ink pt-4 text-[15px] leading-[1.5] text-neutral-800 [text-wrap:pretty]"
            >
              {error}
            </p>
            <Link
              to="/login"
              className={cn(
                buttonVariants({ variant: 'primary' }),
                'self-start px-5 py-2.5 text-sm no-underline hover:no-underline hover:text-accent-100',
              )}
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <p className="text-[15px] text-neutral-700">One moment — finishing up with Google.</p>
        )}
      </div>
    </div>
  );
}
