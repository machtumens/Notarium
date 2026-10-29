/**
 * Notarium backend client for the LIVE worker lineage (Notarium-main `origin/main`, `backend/src/index.ts`
 * — a hand-rolled `fetch` router, not Hono). Every call below matches a route main serves; the shapes are the
 * ones its handlers return (AUDIT/main-lineage-delta.md §2). Token lives in localStorage under `token`, same
 * key as the live app, so a session carries across.
 *
 * Main issues a flat 24-hour token and never a refresh token, has no `/api/auth/refresh` and no
 * `/api/auth/logout`. The short-session client below (`X-Notarium-Session: refresh` opt-in, `refreshToken`,
 * refresh-once-then-replay, logout) therefore stays DORMANT against main: a refresh token is only stored when
 * a worker hands one out, and refresh/logout are only called when one is stored. Kept, tested, harmless — a
 * later backend wave may light it up. See `request` for the refresh-once rule and `refreshSession` for what a
 * failed refresh means.
 */
export const API_URL: string =
  import.meta.env.VITE_API_URL || 'https://notarium-backend.notarium-backend.workers.dev';

/** Mirrors the worker's cap on focus subjects (lib/validation.ts FOCUS_SUBJECTS_MAX). */
export const FOCUS_SUBJECTS_MAX = 5;
/**
 * Main's class names are `grade.number` (`10.1` … `12.3`, seeded in `initializeDatabase`); signup rejects any name
 * that is not an active `grade_classes` row (400 `Invalid class selection`), so this only catches the obvious shape.
 */
export const CLASS_RE = /^\d{1,2}\.\d{1,2}$/;

export type User = {
  id: number;
  email: string;
  name: string;
  class: string | null;
  role: string;
  /** Subject ids the student marked as a focus (max 5). `[]` until they pick any. */
  focus_subject_ids?: number[];
  /** notes_uploaded + total_likes + total_admin_upvotes, computed by main. */
  points: number;
  notes_count: number;
  total_likes: number;
  total_admin_upvotes: number;
  photo_url: string | null;
  grade?: number | null;
  description?: string | null;
};
export type Subject = { id: number; name: string; icon: string; note_count: number };
/**
 * A note row as main returns it. The body lives in `extracted_text` (what the live app writes and searches);
 * `content` is this app's block text, mirrored into both on create. `my-notes` rows carry neither `content`
 * nor `description`, and only `search` rows carry `subject_name` — read the body through `noteText`.
 */
export type Note = {
  id: number;
  title: string;
  subject_id: number;
  subject_name?: string;
  extracted_text?: string | null;
  content?: string | null;
  description?: string | null;
  summary?: string | null;
  author_id?: number;
  author_name?: string;
  author_class?: string | null;
  author_photo?: string | null;
  /** JSON-encoded string array, e.g. `'["remix-ok"]'`. */
  tags: string | null;
  likes: number;
  admin_upvotes: number;
  created_at: string;
  updated_at?: string;
  status: string | null;
  visibility: string | null;
  image_path?: string | null;
  liked_by_me?: number;
  upvoted_by_me?: number;
};
/** The note body in the order main fills it: OCR/mirrored text, then this app's block text, then the description. */
export const noteText = (n: Note) => n.extracted_text || n.content || n.description || '';
/**
 * A leaderboard row. `points` is what the board is ranked by — main's `learning_points` (its own leaderboard
 * page shows that number) — falling back to the notes+likes+upvotes sum main also sends for rows that predate it.
 */
export type Leader = {
  display_name: string;
  photo_url?: string | null;
  class: string | null;
  notes_uploaded: number;
  total_likes: number;
  total_admin_upvotes?: number;
  learning_points?: number | null;
  current_streak?: number | null;
  points: number;
};

/** The body `POST /api/notes` takes — see `api.notes.create` for how main reads each field. */
export type NewNote = {
  title: string;
  subject_id: number;
  extracted_text: string;
  content: string;
  description?: string;
  tags?: string[];
  status: 'draft' | 'published';
  visibility: 'everyone' | 'class';
};

/** Every failure surfaces as one of these; `status` is 0 when the request never reached the worker. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Plain-language message per failure class. A 401 only means "session expired" when we actually sent a token — on sign-in it is a wrong password, so the server's wording stays. */
const friendly = (status: number, server: string | undefined, sentToken: boolean) =>
  status === 0
    ? 'Could not reach Notarium. Check your connection and try again.'
    : status === 401 && sentToken
      ? 'Your session has expired. Sign in again.'
      : status === 404
        ? 'That was not found.'
        : status === 429
          ? 'Too many requests — wait a moment.'
          : status >= 500
            ? 'Notarium is having trouble right now. Try again in a minute.'
            : server || 'Something went wrong.';

const stored = (key: string) => ({
  get: () => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
});
export const token = stored('token');
/** Where to land after Google comes back — this tab only, and only for one trip. */
const GOOGLE_RETURN_KEY = 'google:return';
/** The rotating refresh token the worker hands out next to `token` (absent against a worker that predates W2.1). */
export const refreshToken = stored('refreshToken');

/** Subscribe to "a request that carried our token came back 401 and could not be refreshed" — the session is dead, whichever screen hit it. Returns the unsubscribe. */
const unauthorized = new Set<() => void>();
export const onUnauthorized = (cb: () => void) => {
  unauthorized.add(cb);
  return () => {
    unauthorized.delete(cb);
  };
};

type SessionPair = { token: string; refreshToken: string };

/** The header that asks the worker for a 15-minute access token plus a refresh token instead of the 24-hour token alone. */
const OPT_IN_HEADERS = { 'X-Notarium-Session': 'refresh' };

/**
 * What a refresh attempt concluded — the caller decides what dies.
 *  - rotated: both keys now hold a live pair (swapped by us, or by another tab that got there first) — replay.
 *  - rejected: the worker refused the token (401/400, or an answer with no pair): the session is dead. The keys were
 *    cleared, unless another tab had already replaced them.
 *  - unavailable: the worker could not be asked (429/5xx/network): nothing is known about the session, both keys
 *    stay, and `error` is the transient failure to show.
 */
type RefreshOutcome = 'rotated' | 'rejected' | 'unavailable';
type RefreshResult =
  | { outcome: Exclude<RefreshOutcome, 'unavailable'> }
  | { outcome: 'unavailable'; error: ApiError };

/** Tabs rotate one at a time: whoever holds this Web Lock refreshes, the others find the new pair when they get it. */
const REFRESH_LOCK = 'notarium-refresh';
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  // ponytail: lib.dom types the callback's return as the resolved value; Web Locks actually unwrap the promise.
  return locks ? (locks.request(REFRESH_LOCK, fn) as Promise<T>) : fn();
}

/**
 * Trade `current` (the refresh token the caller saw when it hit the 401) for a new pair. One flight per tab —
 * concurrent 401s wait on the same promise — and one tab at a time across the browser, so the worker sees one
 * rotation per refresh token (a second use of the same one would revoke the family).
 */
let refreshing: Promise<RefreshResult> | null = null;
function refreshSession(current: string): Promise<RefreshResult> {
  if (!refreshing) {
    refreshing = withRefreshLock(() => rotate(current)).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function rotate(current: string): Promise<RefreshResult> {
  // Another tab rotated while we waited for the lock: its pair is the live one.
  if (refreshToken.get() !== current) return { outcome: 'rotated' };
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current }),
    });
  } catch {
    return { outcome: 'unavailable', error: new ApiError(friendly(0, undefined, true), 0) };
  }
  const data = (await res.json().catch(() => ({}))) as Partial<SessionPair> & { error?: string };
  if (res.ok && data.token && data.refreshToken) {
    token.set(data.token);
    refreshToken.set(data.refreshToken);
    return { outcome: 'rotated' };
  }
  const refused = res.ok || res.status === 401 || res.status === 400;
  if (!refused)
    return {
      outcome: 'unavailable',
      error: new ApiError(friendly(res.status, data.error, true), res.status),
    };
  // Refused — but if another tab rotated this very token while our request was in flight, the worker refused a
  // token that is simply stale on our side, and that tab's pair is what to use.
  if (refreshToken.get() !== current) return { outcome: 'rotated' };
  token.clear();
  refreshToken.clear();
  return { outcome: 'rejected' };
}

/** Sign-in responses carry the refresh token; keep it (or drop a stale one when the worker sends none). */
function rememberRefreshToken<T extends { refreshToken?: string }>(res: T): T {
  if (res.refreshToken) refreshToken.set(res.refreshToken);
  else refreshToken.clear();
  return res;
}

type RequestOptions = { method?: string; body?: unknown; headers?: Record<string, string> };

// ponytail: GETs are shared for a short window, so the shell and a page asking for the same list (and every page
// re-asking on each visit) cost one round-trip. Keyed by token, so a different account never reads another's
// answer; any write clears it all, and a failure is dropped so a retry really goes out. In-memory only.
const GET_TTL_MS = 30_000;
export const getCache = new Map<string, { at: number; p: Promise<unknown> }>();

function request<T>(path: string, init: RequestOptions = {}, replay = false): Promise<T> {
  const isGet = (init.method ?? 'GET') === 'GET';
  if (!isGet) getCache.clear();
  if (!isGet || replay) return send<T>(path, init, replay);
  const key = `${token.get() ?? ''} ${path}`;
  const hit = getCache.get(key);
  if (hit && Date.now() - hit.at < GET_TTL_MS) return hit.p as Promise<T>;
  const p = send<T>(path, init);
  getCache.set(key, { at: Date.now(), p });
  p.catch(() => getCache.get(key)?.p === p && getCache.delete(key));
  return p;
}

async function send<T>(path: string, init: RequestOptions = {}, replay = false): Promise<T> {
  // ponytail: sign-in/sign-up authenticate by credentials, so a stale stored token must not ride along, and their 401 means wrong password — never a dead session.
  // The Google exchange is a credential call too: it proves identity with the
  // worker's one-time code, so a stale stored token must not ride along (its 401
  // would sign out the session the exchange is in the middle of opening).
  const isCredentialCall =
    path === '/api/auth/login' || path === '/api/auth/signup' || path === '/auth/google/exchange';
  // ponytail: logout is the caller already ending the session — its 401 must not re-enter signOut through onUnauthorized.
  const isLogout = path === '/api/auth/logout';
  const t = isCredentialCall ? null : token.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(friendly(0, undefined, !!t), 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const sessionRejected = res.status === 401 && !!t && !isCredentialCall;
    if (sessionRejected) {
      // A live pair another tab stored while this request was in flight beats anything we know.
      const replaced = () => {
        const stored = token.get();
        return !!stored && stored !== t;
      };
      // Refresh once, replay once. A refresh the worker could not be asked for (429/5xx/network) surfaces as that
      // transient error and touches nothing; only a refused refresh — or the replay's own 401 — ends the session.
      if (!replay) {
        if (replaced()) return request<T>(path, init, true);
        const current = refreshToken.get();
        if (current) {
          const result = await refreshSession(current);
          if (result.outcome === 'rotated') return request<T>(path, init, true);
          if (result.outcome === 'unavailable') throw result.error;
        }
      }
      // Dead session: forget the keys (a refused refresh already did) and tell subscribers — unless another tab replaced them meanwhile.
      if (!replaced()) {
        token.clear();
        refreshToken.clear();
        if (!isLogout)
          unauthorized.forEach((cb) => {
            try {
              cb();
            } catch (e) {
              console.error('onUnauthorized subscriber failed', e);
            }
          });
      }
    }
    throw new ApiError(friendly(res.status, (data as { error?: string }).error, !!t), res.status);
  }
  return data as T;
}

/**
 * The same authenticated fetch the calls below use, for the admin client in `admin-api.ts`.
 * Exported rather than duplicated so the admin surface inherits the refresh-once-then-replay
 * rule, the `onUnauthorized` sign-out and the friendly messages. `GET` bodies are not a thing.
 */
export const apiRequest = <T>(path: string, init?: { method?: string; body?: unknown }) =>
  request<T>(path, init);

/** Sign-in answers carry the session; main can also answer a 2FA challenge with no token, which this app cannot complete. */
type SessionAnswer = { token?: string; refreshToken?: string; user?: User; requires_2fa?: boolean };
function openSession(res: SessionAnswer): { token: string; refreshToken?: string; user: User } {
  if (!res.token || !res.user)
    throw new ApiError(
      res.requires_2fa
        ? 'This account uses two-factor sign-in, which this app does not support yet.'
        : 'Sign-in did not return a session.',
      200,
    );
  return rememberRefreshToken({ token: res.token, refreshToken: res.refreshToken, user: res.user });
}

export const api = {
  auth: {
    /** POST /api/auth/login → main: `{ success, token, user }` (no refreshToken; `{ requires_2fa, challenge }` for 2FA accounts). */
    login: (email: string, password: string) =>
      request<SessionAnswer>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        headers: OPT_IN_HEADERS,
      }).then(openSession),
    /** POST /api/auth/signup → main: 201 `{ token, user }` (no success field, no refreshToken). Main only accepts its school domain and a seeded class name. */
    signup: (email: string, password: string, name: string, cls?: string) =>
      request<SessionAnswer>('/api/auth/signup', {
        method: 'POST',
        body: { email, password, name, class: cls },
        headers: OPT_IN_HEADERS,
      }).then(openSession),
    /** GET /api/auth/me → `{ user }`. */
    me: () => request<{ user: User }>('/api/auth/me'),
    /**
     * Hand the browser to the worker, which hands it to Google. There is no
     * client id and no secret in this app: the worker owns the whole exchange
     * and sends us back to /auth/callback with a one-time code.
     *
     * Not `/api/...` — the OAuth routes sit at the root of the worker.
     */
    googleSignIn: (from?: string) => {
      if (from)
        try {
          sessionStorage.setItem(GOOGLE_RETURN_KEY, from);
        } catch {
          /* private mode */
        }
      window.location.assign(`${API_URL}/auth/google/start?intent=signup`);
    },
    /** Where the visitor was headed before Google took over; consumed once. */
    takeGoogleReturn: () => {
      try {
        const v = sessionStorage.getItem(GOOGLE_RETURN_KEY);
        sessionStorage.removeItem(GOOGLE_RETURN_KEY);
        return v;
      } catch {
        return null;
      }
    },
    /**
     * POST /auth/google/exchange → `{ token }`. The code is single-use and lives
     * 60 seconds in the worker's KV; the JWT never travels in a URL.
     */
    googleExchange: (code: string) =>
      request<{ token: string }>('/auth/google/exchange', { method: 'POST', body: { code } }).then(
        (r) => {
          if (!r.token) throw new ApiError('Google sign-in did not return a session.', 200);
          token.set(r.token);
          return r.token;
        },
      ),
    /** POST /api/auth/logout — not on main (404, swallowed by the store). Revokes this session's refresh family on a worker that issued one (every family when none is stored). Reads the tokens synchronously, so it may be fired right before clearing them. */
    logout: () => {
      const current = refreshToken.get();
      return request<{ success: boolean }>('/api/auth/logout', {
        method: 'POST',
        body: current ? { refreshToken: current } : {},
      });
    },
  },
  user: {
    /**
     * PUT /api/user/class → `{ success }`. The class and the focus subjects in
     * one call: the worker checks the class against the school's register and
     * every subject id against the subjects table, so a 400 here means one of
     * those two and nothing was written.
     *
     * The display name is not in this body on purpose — on a Google account it
     * is re-read from Google at every sign-in and nothing may overwrite it.
     */
    saveProfile: (cls: string, focusSubjectIds: number[]) =>
      request<{ success: boolean }>('/api/user/class', {
        method: 'PUT',
        body: { class: cls, focus_subject_ids: focusSubjectIds },
      }),
  },
  /** GET /api/subjects → `{ subjects }`, public. */
  subjects: () => request<{ subjects: Subject[] }>('/api/subjects').then((r) => r.subjects),
  /** GET /api/leaderboard → `{ leaderboard }`, public, ranked by `learning_points` — surfaced as `points`, see `Leader`. */
  leaderboard: () =>
    request<{ leaderboard: (Omit<Leader, 'points'> & { points?: number })[] }>(
      '/api/leaderboard',
    ).then((r) =>
      r.leaderboard.map((l) => ({
        ...l,
        points:
          l.learning_points ??
          l.points ??
          (l.notes_uploaded ?? 0) + (l.total_likes ?? 0) + (l.total_admin_upvotes ?? 0),
      })),
    ),
  notes: {
    /** GET /api/notes/subject/:id → `{ notes }` (published, class-visible; no `subject_name`). Needs a token. */
    bySubject: (id: number) =>
      request<{ notes: Note[] }>(`/api/notes/subject/${id}`).then((r) => r.notes),
    /** GET /api/notes/search?q= → `{ notes }` with `subject_name`; matches title/description/extracted_text/author/tags/subject. Needs a token. */
    search: (q: string) =>
      request<{ notes: Note[] }>(`/api/notes/search?q=${encodeURIComponent(q)}`).then(
        (r) => r.notes,
      ),
    /** GET /api/notes/my-notes → `{ notes }` grouped by subject name; rows have no `content`/`description`. */
    mine: () => request<{ notes: Note[] }>('/api/notes/my-notes').then((r) => r.notes),
    /**
     * POST /api/notes → `{ note, notes, success, totalParts }`. Main checks only `title` and a real `subject_id`
     * (its zod `noteSchema` is unused; the live `notes` table has no NOT NULL columns). Text goes in BOTH
     * `extracted_text` (what main's app reads, search scores and my-notes returns) and `content` (our block
     * text); `tags` is an array main JSON-encodes; `visibility` '' means everyone; `status` other than 'draft'
     * is published. Main writes one row per image chunk — with no images it writes NOTHING and still answers
     * `success: true` with an empty `notes`, so a missing `note` is treated as a failure here.
     */
    create: (body: NewNote) =>
      request<{ success?: boolean; note?: Note; notes?: Note[]; totalParts?: number }>(
        '/api/notes',
        { method: 'POST', body },
      ).then((r) => {
        if (!r.note)
          throw new ApiError(
            'Notarium did not save this note. The worker stores nothing for a text-only note yet.',
            200,
          );
        return { ...r, note: r.note };
      }),
    /** POST /api/notes/:id/like → `{ liked }` (a toggle). */
    like: (id: number) => request<{ liked: boolean }>(`/api/notes/${id}/like`, { method: 'POST' }),
  },
};

/** Pull the top-liked published notes across every subject (the worker has no cross-subject list). */
export async function topNotes(subjects: Subject[], limit = 6) {
  const lists = await Promise.all(
    subjects
      .filter((s) => s.note_count > 0)
      .map((s) =>
        api.notes
          .bySubject(s.id)
          .then((n) => n.map((x) => ({ ...x, subject_name: s.name })))
          .catch(() => [] as Note[]),
      ),
  );
  return lists
    .flat()
    .sort(
      (a, b) => (b.likes ?? 0) + (b.admin_upvotes ?? 0) - (a.likes ?? 0) - (a.admin_upvotes ?? 0),
    )
    .slice(0, limit);
}
