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
import type { BgMode, ThemeName } from '@/lib/themes';

export type Ctx = 'normal' | 'exam' | 'session' | 'break';
export type Mode = 'Explore' | 'Study' | 'Practice' | 'Tutor' | 'Review' | 'Exam';
export type Adapt = 'Automatic' | 'Hybrid' | 'Manual';
export type Density = 'Calm' | 'Balanced' | 'Cockpit';
export type Msg = { who: 'ai' | 'me'; text: string };
export type Booking = {
  name: string;
  initials: string;
  subject: string;
  tone: string;
  slots: string[];
  slotId: string | null;
  kind: string;
};
export type Confirmed = { slotId: string | null; text: string };

/** Who is using the app: a signed-in Notarium account, a guest on demo data, or nobody yet (still checking the token). */
export type Session = { kind: 'user'; user: User } | { kind: 'guest' } | null;

export type AppState = {
  session: Session;
  sessionChecked: boolean;
  /** The last session check got no verdict (network, 429, 5xx): the stored token was kept, nobody is signed in yet, and a retry can settle it. */
  offline: boolean;
  learner: string;
  theme: ThemeName;
  bgMode: BgMode;
  ctx: Ctx;
  mode: Mode;
  adapt: Adapt;
  density: Density;
  gamification: boolean;
  grid: string[];
  tray: { label: string; meta: string }[];
  chat: Msg[];
  aiThread: Msg[];
  sessionPhase: 'before' | 'during' | 'after';
  confirmed: Confirmed[];
  booking: Booking | null;
  bookedTutor: string;
  bookedSlot: string;
  practiceView: 'landing' | 'question';
  createPhase: 'write' | 'publish';
  aiView: 'canvas' | 'split' | 'command';
  tutorView: 'cards' | 'board' | 'coverage' | 'calendar';
  tutorFilter: string;
  calWeek: number;
  rating: number;
  progressView: 'graph' | 'tree';
  aiScope: string;
  remixOn: boolean;
};

export const CTX_MODE: Record<Ctx, Mode> = {
  normal: 'Study',
  exam: 'Exam',
  session: 'Tutor',
  break: 'Review',
};
export const MODE_CTX: Partial<Record<Mode, Ctx>> = {
  Exam: 'exam',
  Tutor: 'session',
  Review: 'break',
  Study: 'normal',
};

export const AI_SEED: Msg[] = [
  {
    who: 'ai',
    text: 'You have twenty minutes before dinner and an exam in five days. Penguraian komponen is the one topic where extra work changes your grade tonight.',
  },
  { who: 'me', text: 'I did that with Paul already.' },
  {
    who: 'ai',
    text: 'You did, and it moved 44 to 61. His note said the slip is rotated axes specifically. That is six questions, not a whole topic again.',
  },
];

const initial: AppState = {
  session: null,
  sessionChecked: false,
  offline: false,
  learner: 'Arga',
  theme: 'Vintage paper',
  bgMode: 'Dither',
  ctx: 'normal',
  mode: 'Study',
  adapt: 'Hybrid',
  density: 'Balanced',
  gamification: true,
  grid: [
    'Next best action',
    'Mastery',
    'Your notes',
    'Practice queue',
    'Community notes',
    'Revision queue',
    'Streak & XP',
    'Calendar',
  ],
  tray: [
    { label: 'Flashcards', meta: 'core' },
    { label: 'Pomodoro', meta: 'core' },
    { label: 'Study groups', meta: 'social' },
    { label: 'Leaderboard', meta: 'social' },
    { label: 'Past papers', meta: 'exam' },
    { label: 'Upcoming exams', meta: 'exam' },
    { label: 'Assignments', meta: 'school' },
    { label: 'Calculus trainer', meta: 'third party' },
  ],
  chat: [
    {
      who: 'ai',
      text: 'This note stops at the mol–massa relationship. The part linking mol to volume at STP is missing — that was question 4 on your last quiz.',
    },
  ],
  aiThread: AI_SEED,
  sessionPhase: 'before',
  confirmed: [],
  booking: null,
  bookedTutor: '',
  bookedSlot: '',
  practiceView: 'landing',
  createPhase: 'write',
  aiView: 'canvas',
  tutorView: 'cards',
  tutorFilter: 'Matched to me',
  calWeek: 0,
  rating: 0,
  progressView: 'graph',
  aiScope: 'Everything I know about you',
  remixOn: true,
};

type Store = AppState & {
  set: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  setCtx: (ctx: Ctx) => void;
  signIn: (user: User, tok: string) => void;
  /** Create the account on the worker, then open it exactly like `signIn`. Rejects with the server's `ApiError`. */
  signUp: (email: string, password: string, name: string, cls?: string) => Promise<void>;
  continueAsGuest: () => void;
  signOut: () => void;
  /** Run the session check again (the Retry on /login after an unanswered one). Resolves to whether an account is open afterwards. */
  recheckSession: () => Promise<boolean>;
  /** true when there is a signed-in account whose data we can fetch */
  isUser: boolean;
};

const Ctx = createContext<Store | null>(null);

// A guest is per tab on purpose (sessionStorage, not localStorage): the demo has no account behind it, so it should not follow the visitor into another tab or a later visit.
const GUEST = 'notarium:guest';
const guest = {
  get: () => {
    try {
      return sessionStorage.getItem(GUEST) === '1';
    } catch {
      return false;
    }
  },
  set: () => {
    try {
      sessionStorage.setItem(GUEST, '1');
    } catch {
      /* private mode */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(GUEST);
    } catch {
      /* ignore */
    }
  },
};

const firstName = (u: User) => (u.name || u.email || 'Learner').trim().split(/\s+/)[0];
/** The check got no verdict: the worker could not be reached, or was too busy / broken to answer. Anything else is an answer. */
const noVerdict = (e: unknown) =>
  e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initial);

  // The session check: the stored token (same `token` key as the live app) wins; otherwise this tab's guest flag.
  // `me()` refreshes a dead access token by itself (api.ts). Only a verdict drops the keys — a 401 the refresh could
  // not rescue (api.ts already cleared them), or any other answer that is not a session. A check that got no verdict
  // (network, 429, 5xx) keeps both keys and flags `offline`, so RequireSession sends the visitor to /login with a
  // Retry instead of signing the account out over a blip. Resolves to whether an account is open afterwards.
  const check = useCallback(async () => {
    if (!token.get()) {
      setState((s) => ({
        ...s,
        session: guest.get() ? { kind: 'guest' } : s.session,
        sessionChecked: true,
        offline: false,
      }));
      return false;
    }
    try {
      const { user } = await api.auth.me();
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
    guest.clear();
    setState((s) => ({
      ...s,
      session: { kind: 'user', user },
      learner: firstName(user),
      sessionChecked: true,
      offline: false,
      ctx: 'normal',
      mode: 'Study',
    }));
  };
  // The screen forgets the session at once. The worker is told only when it handed out a refresh family (there is
  // nothing else it could revoke — main issues flat 24-hour tokens and has no /api/auth/logout, so its sign-out is
  // local only). That logout request carries the — possibly expired — bearer and the refresh token, and `request`
  // needs both still stored to refresh-and-replay a 401, otherwise the family would outlive the sign-out (W2.3f).
  // Look-and-feel choices are the visitor's, not the account's, so they stay.
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
    guest.clear();
    setState((s) => ({
      ...initial,
      theme: s.theme,
      bgMode: s.bgMode,
      grid: s.grid,
      tray: s.tray,
      density: s.density,
      adapt: s.adapt,
      gamification: s.gamification,
      sessionChecked: true,
    }));
  };

  // A 401 on a request that carried the token, and that a refresh could not rescue, means the account
  // session is dead: sign out, and RequireSession sends the page to /login with `from` intact. Subscribed
  // only while an account is open — the bootstrap `me()` failure above clears the keys itself, and guests never send a token.
  const userOpen = state.session?.kind === 'user';
  useEffect(() => {
    if (!userOpen) return;
    return onUnauthorized(signOut);
  }, [userOpen]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      isUser: state.session?.kind === 'user',
      set: (patch) =>
        setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })),
      setCtx: (ctx) => setState((s) => ({ ...s, ctx, mode: CTX_MODE[ctx] })),
      signIn,
      signUp: async (email, password, name, cls) => {
        const { user, token: tok } = await api.auth.signup(email, password, name, cls);
        signIn(user, tok);
      },
      continueAsGuest: () => {
        guest.set();
        setState((s) => ({
          ...s,
          session: { kind: 'guest' },
          learner: 'Arga',
          sessionChecked: true,
          offline: false,
          ctx: 'normal',
          mode: 'Study',
        }));
      },
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
