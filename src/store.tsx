import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, api, onUnauthorized, refreshToken, token, type User } from '@/lib/api';

/**
 * Who is using the app: a signed-in Notarium account, or nobody (or not yet known). The guest demo and its
 * adaptive-learning state (contexts, modes, density, canned chat) went to `archive/demo-2026-11/` in Nov 2026.
 */
export type Session = { kind: 'user'; user: User } | null;

export type AppState = {
  session: Session;
  sessionChecked: boolean;
  /** The last session check got no verdict (network, 429, 5xx): the stored token was kept, nobody is signed in yet, and a retry can settle it. */
  offline: boolean;
  learner: string;
};

const initial: AppState = { session: null, sessionChecked: false, offline: false, learner: '' };

type Store = AppState & {
  signIn: (user: User, tok: string) => void;
  signOut: () => void;
  /** Run the session check again (the Retry on /login after an unanswered one). Resolves to whether an account is open afterwards. */
  recheckSession: () => Promise<boolean>;
  /** true when there is a signed-in account whose data we can fetch */
  isUser: boolean;
};

const Ctx = createContext<Store | null>(null);

const firstName = (u: User) => (u.name || u.email || 'there').trim().split(/\s+/)[0];
/** The check got no verdict: the worker could not be reached, or was too busy / broken to answer. Anything else is an answer. */
const noVerdict = (e: unknown) =>
  e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);

/**
 * Start Home's two lists while the session check is still in flight, so they ride the same round trip instead
 * of waiting for it. `request` shares GETs for 30 s by token, so Home's own calls pick these up. Failures are
 * Home's to show; here they are only kept from surfacing as unhandled rejections.
 */
export const prefetchHome = () => {
  // Only when Home is where this is going; any other page asks for what it needs itself.
  if (!/^\/(app(\/home)?\/?)?$|^\/auth\/callback/.test(window.location.pathname)) return;
  api.notes.mine().catch(() => {});
  api.notes.top(HOME_TOP).catch(() => {});
};
/** How many community notes Home lists; shared with the prefetch so both ask for the same URL. */
export const HOME_TOP = 6;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initial);

  // The session check: the stored token, if any. `me()` refreshes a dead access token by itself (api.ts). Only a
  // verdict drops the keys — a 401 the refresh could not rescue (api.ts already cleared them), or any other answer
  // that is not a session. A check that got no verdict (network, 429, 5xx) keeps both keys and flags `offline`, so
  // RequireSession sends the visitor to /login with a Retry instead of signing the account out over a blip.
  const check = useCallback(async () => {
    if (!token.get()) {
      setState((s) => ({ ...s, sessionChecked: true, offline: false }));
      return false;
    }
    prefetchHome();
    try {
      const { user } = await api.auth.me();
      // A prefetch that ran into a dead session (refresh refused) has already dropped the keys: signed out.
      if (!token.get()) {
        setState((s) => ({ ...s, sessionChecked: true, offline: false }));
        return false;
      }
      setState((s) => ({
        ...s,
        session: { kind: 'user', user },
        learner: firstName(user),
        sessionChecked: true,
        offline: false,
      }));
      return true;
    } catch (e) {
      if (noVerdict(e)) {
        setState((s) => ({ ...s, sessionChecked: true, offline: true }));
        return false;
      }
      token.clear();
      refreshToken.clear();
      setState((s) => ({ ...s, sessionChecked: true, offline: false }));
      return false;
    }
  }, []);
  useEffect(() => {
    void check();
  }, [check]);

  // Counts sign-ins, so a sign-out still settling can tell whether the stored keys are its own or a newer account's.
  const signIns = useRef(0);
  const signIn = (user: User, tok: string) => {
    signIns.current += 1;
    token.set(tok);
    prefetchHome();
    setState({
      session: { kind: 'user', user },
      learner: firstName(user),
      sessionChecked: true,
      offline: false,
    });
  };
  // The screen forgets the session at once. The worker is told only when it handed out a refresh family. That
  // logout request carries the — possibly expired — bearer and the refresh token, and `request` needs both still
  // stored to refresh-and-replay a 401, otherwise the family would outlive the sign-out (W2.3f).
  const signOut = () => {
    const generation = signIns.current;
    // Whatever is stored when the logout settles (the pair its own refresh may have rotated to) belongs to this
    // sign-out — unless a sign-in landed in the meantime, in which case the keys are that account's.
    const forgetKeys = () => {
      if (signIns.current === generation) {
        token.clear();
        refreshToken.clear();
      }
    };
    if (token.get() && refreshToken.get())
      api.auth
        .logout()
        .catch(() => {
          /* the session ends locally either way */
        })
        .finally(forgetKeys);
    else forgetKeys();
    setState({ ...initial, sessionChecked: true });
  };

  // A 401 on a request that carried the token, and that a refresh could not rescue, means the account
  // session is dead: sign out, and RequireSession sends the page to /login with `from` intact. Subscribed
  // only while an account is open — the bootstrap `me()` failure above clears the keys itself.
  const userOpen = state.session?.kind === 'user';
  useEffect(() => {
    if (!userOpen) return;
    return onUnauthorized(signOut);
  }, [userOpen]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      isUser: state.session?.kind === 'user',
      signIn,
      signOut,
      recheckSession: check,
    }),
    [state, check],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
