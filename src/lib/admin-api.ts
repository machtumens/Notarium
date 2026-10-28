/**
 * The admin + ops client. Every call below matches a route the LIVE worker already serves
 * (`backend/src/routes/admin.ts`, `ops.ts`, `notifications.ts`, `subjects.ts`) — nothing here is
 * speculative, and nothing here is new backend surface.
 *
 * Three guards sit in front of these routes, and the difference is visible in the UI:
 *  - `requireAdmin`      — `role === 'admin'`. Password surfaces only; none are used here.
 *  - `requireModerator`  — admin, and `admin_role` is `moderator` or `super`. People + content.
 *  - `requireTechnical`  — admin, and `admin_role` is `technical` or `super`. Ops + nodes.
 * A token with no `admin_role` is deliberately NOT super, so a 403 from one panel while another
 * works is the normal, designed answer — `useAsync` surfaces it as that panel's own message.
 *
 * DELIBERATELY ABSENT: `/api/admin/migrate-passwords`, `/api/auth/admin-reset-password`,
 * `/api/admin/emergency-password-fix` and `/api/auth/admin-login`. They exist on the worker and
 * `requireAdmin` protects them, but nothing that reads or writes a credential is wired to a
 * button in this app. Password recovery stays a backend-operator action, off the dashboard.
 */
import { apiRequest, type Subject } from '@/lib/api';

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
};

// ---------------------------------------------------------------------------
// Row shapes, as the worker's SELECTs return them
// ---------------------------------------------------------------------------

/** `GET /api/admin/users` — note `display_name`, not `name`: this is the raw users table. */
export type AdminUser = {
  id: number;
  display_name: string | null;
  email: string;
  class: string | null;
  role: string;
  notes_uploaded: number;
  total_likes: number;
  total_admin_upvotes: number;
  diamonds: number;
  points: number;
  suspended: number;
  suspension_end_date: string | null;
  suspension_reason: string | null;
  warning: number;
  warning_message: string | null;
  photo_url: string | null;
  description: string | null;
  created_at: string;
};

/** `GET /api/admin/notes` — every column plus the joined author/subject names. */
export type AdminNote = {
  id: number;
  title: string | null;
  description: string | null;
  content: string | null;
  extracted_text: string | null;
  summary: string | null;
  tags: string | null;
  image_path: string | null;
  likes: number;
  admin_upvotes: number;
  featured: number;
  deleted_at: string | null;
  subject_id: number;
  author_id: number;
  status: string | null;
  visibility: string | null;
  created_at: string;
  author_name: string | null;
  author_class: string | null;
  subject_name: string | null;
  admin_liked: number;
};

/** `GET /api/admin/activity-log` — `SELECT *` from `admin_activity_log`. */
export type ActivityLog = {
  id: number;
  admin_id: number;
  admin_email: string;
  action_type: string;
  target_type: string;
  target_id: number;
  details: string | null;
  created_at: string;
};

export type UsageStats = {
  overview: {
    totalUsers: number;
    activeUsers7d: number;
    activeUsers30d: number;
    totalNotes: number;
    notes7d: number;
    notes30d: number;
    totalLikes: number;
    totalAdminUpvotes: number;
    totalChatSessions: number;
    chatSessions7d: number;
    chatSessions30d: number;
    suspendedUsers: number;
    warnedUsers: number;
  };
  topContributors: {
    id: number;
    display_name: string | null;
    email: string;
    class: string | null;
    notes_uploaded: number;
    total_likes: number;
    total_admin_upvotes: number;
  }[];
  usersByClass: { class: string; count: number }[];
  notesByClass: { class: string; count: number }[];
  popularSubjects: {
    id: number;
    name: string;
    icon: string | null;
    note_count: number;
    total_likes: number | null;
  }[];
  dailyActivity: { date: string; count: number }[];
  dailyRegistrations: { date: string; count: number }[];
};

export type OpsMetrics = {
  live_users: { m5: number; h1: number; d1: number };
  totals: {
    users: number;
    notes: number;
    suspended_users: number;
    active_warnings: number;
    chat_sessions: number;
    quiz_attempts: number;
  };
  moderation: { soft_deleted_notes: number; featured_notes: number };
  table_rows: { users: number; notes: number; chat_messages: number; study_items: number };
};

/** `GET /api/health` — the deep object only when a technical token is present; otherwise `{status,time}`. */
export type Health = {
  status: 'ok' | 'down';
  time: string;
  db?: boolean;
  kv?: boolean;
  ai_configured?: boolean;
  oauth_configured?: boolean;
  latest_migration?: string | number;
  schema_version?: string | number;
};
export type Ready = { ok: boolean; checks: { db: boolean; kv: boolean } };

export type Point = { t: string; v: number };
export type TimeseriesMetric = 'signups' | 'notes' | 'requests' | 'errors' | 'ai';

export type Flags = { maintenance: boolean; signups: boolean; uploads: boolean; ai_chat: boolean };
/** The three the worker will accept; anything else is a 400 `Unknown flag`. */
export const FLAG_KEYS = ['signups', 'uploads', 'ai_chat'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/** `/api/ops/recompute` targets, exactly the worker's switch arms. */
export const RECOMPUTE_TARGETS = [
  'subjects_note_count',
  'user_notes_uploaded',
  'usage_snapshot',
] as const;
export type RecomputeTarget = (typeof RECOMPUTE_TARGETS)[number];

/** `{ configured: false }` when the worker has no Cloudflare token — a first-class state, not an error. */
export type CloudflareMetrics =
  | { configured: false }
  | {
      configured?: true;
      workers?: {
        t: string;
        requests: number;
        errors: number;
        subrequests: number;
        cpuP50: number;
        cpuP99: number;
      }[];
      d1?: {
        t: string;
        readQueries: number;
        writeQueries: number;
        rowsRead: number;
        rowsWritten: number;
      }[];
      error?: string;
    };

export type GradeClass = {
  id: number;
  grade: number;
  class_name: string;
  semester: string | null;
  is_active: number;
  student_count: number;
  created_at?: string;
  updated_at?: string;
};

export type Announcement = {
  id: number;
  sender_id: number | null;
  sender_name: string | null;
  target_type: 'all' | 'grade' | 'class' | 'user' | string;
  target_grade: number | null;
  target_class: string | null;
  target_user_id: number | null;
  notification_type: string;
  title: string;
  message: string;
  created_at: string;
};

export type NewAnnouncement = {
  target_type: 'all' | 'grade' | 'class' | 'user';
  target_grade?: number;
  target_class?: string;
  target_user_id?: number;
  notification_type?: 'announcement' | 'class_reassignment' | 'warning';
  title: string;
  message: string;
};

/** The fields `adminUserUpdateSchema` reads. `role` is silently dropped by the worker unless the caller is super. */
export type UserPatch = {
  display_name?: string;
  class?: string;
  diamonds?: number;
  learning_points?: number;
  role?: string;
};
/** The fields `noteUpdateSchema` reads. Body text lives in `extracted_text` first (see `noteText`). */
export type NotePatch = {
  title?: string;
  description?: string;
  content?: string;
  extracted_text?: string;
  summary?: string;
  tags?: string[];
};

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export const admin = {
  /** requireModerator */
  stats: () => apiRequest<UsageStats>('/api/admin/usage-stats'),
  activity: (limit = 50, offset = 0) =>
    apiRequest<{ logs: ActivityLog[] }>(`/api/admin/activity-log${qs({ limit, offset })}`).then(
      (r) => r.logs ?? [],
    ),

  users: {
    list: (limit = 200, offset = 0) =>
      apiRequest<{ users: AdminUser[] }>(`/api/admin/users${qs({ limit, offset })}`).then(
        (r) => r.users ?? [],
      ),
    /** `days` 1–365; the worker defaults to 7 and writes `suspension_end_date` itself. Refuses an admin target with a 403. */
    suspend: (id: number, days: number, reason: string) =>
      apiRequest<{ success: boolean; suspension_end_date: string; reason?: string }>(
        `/api/admin/suspend/${id}`,
        { method: 'POST', body: { days, reason } },
      ),
    unsuspend: (id: number) =>
      apiRequest<{ success: boolean }>(`/api/admin/unsuspend/${id}`, { method: 'POST' }),
    /** Sets the warning flag AND writes the student a `warning` notification. Refuses an admin target. */
    warn: (id: number, message: string) =>
      apiRequest<{ success: boolean; message: string }>(`/api/admin/warn/${id}`, {
        method: 'POST',
        body: { message },
      }),
    /** Irreversible: deletes the row, their notes, their likes and their log entries. Refuses an admin target. */
    remove: (id: number) =>
      apiRequest<{ success: boolean }>(`/api/admin/user/${id}`, { method: 'DELETE' }),
    update: (id: number, patch: UserPatch) =>
      apiRequest<{ success: boolean; user: AdminUser }>(`/api/admin/user/${id}`, {
        method: 'PUT',
        body: patch,
      }),
    /** Moves the student AND their `grade_class_id`; optionally notifies them. `new_class` must be an active class. */
    reassign: (userId: number, newClass: string, notify = true) =>
      apiRequest<{ success: boolean }>('/api/admin/grade-classes/reassign', {
        method: 'POST',
        body: { user_id: userId, new_class: newClass, send_notification: notify },
      }),
  },

  notes: {
    /** `sort`: recent | likes | featured. `status`: draft | published. */
    list: (opts: { q?: string; subject?: number; status?: string; sort?: string } = {}) =>
      apiRequest<{ notes: AdminNote[] }>(`/api/admin/notes${qs(opts)}`).then((r) => r.notes ?? []),
    update: (id: number, patch: NotePatch) =>
      apiRequest<{ success: boolean }>(`/api/admin/notes/${id}`, { method: 'PUT', body: patch }),
    /** Hard delete, and it decrements the author's and the subject's counters. */
    remove: (id: number) =>
      apiRequest<{ success: boolean }>(`/api/admin/notes/${id}`, { method: 'DELETE' }),
    restore: (id: number) =>
      apiRequest<{ success: boolean }>(`/api/admin/notes/${id}/restore`, { method: 'POST' }),
    /** Toggle; the answer carries the new state. */
    feature: (id: number) =>
      apiRequest<{ success: boolean; featured: number }>(`/api/admin/notes/${id}/feature`, {
        method: 'POST',
      }),
    /** The per-admin toggle, tracked in `admin_note_likes` — prefer this over `upvote`, which only ever adds. */
    like: (id: number) =>
      apiRequest<{ success?: boolean; liked?: boolean }>(`/api/admin/notes/${id}/like`, {
        method: 'POST',
      }),
  },

  subjects: {
    list: () =>
      apiRequest<{ subjects: Subject[] }>('/api/admin/subjects').then((r) => r.subjects ?? []),
    create: (name: string, icon?: string) =>
      apiRequest<{ subject: Subject }>('/api/admin/subjects', {
        method: 'POST',
        body: { name, icon },
      }),
    update: (id: number, patch: { name?: string; icon?: string }) =>
      apiRequest<{ subject: Subject }>(`/api/admin/subjects/${id}`, { method: 'PUT', body: patch }),
    /** 409 while any live note still points at it — the message names the count. */
    remove: (id: number) =>
      apiRequest<{ success: boolean }>(`/api/admin/subjects/${id}`, { method: 'DELETE' }),
  },

  classes: {
    list: () =>
      apiRequest<{ grade_classes: GradeClass[] }>('/api/admin/grade-classes').then(
        (r) => r.grade_classes ?? [],
      ),
    create: (grade: number, className: string, semester = '') =>
      apiRequest<{ grade_class: GradeClass }>('/api/admin/grade-classes', {
        method: 'POST',
        body: { grade, class_name: className, semester },
      }),
    update: (id: number, patch: { class_name?: string; semester?: string; is_active?: boolean }) =>
      apiRequest<{ grade_class?: GradeClass; success?: boolean }>(
        `/api/admin/grade-classes/${id}`,
        { method: 'PUT', body: patch },
      ),
    /** 409 while students are assigned. */
    remove: (id: number) =>
      apiRequest<{ success: boolean }>(`/api/admin/grade-classes/${id}`, { method: 'DELETE' }),
    /**
     * Advance the picked classes a year: 10/11 move up a grade, 12 graduates. NOT idempotent —
     * running it twice promotes twice, which is why the UI makes it a two-step confirm.
     */
    promote: (classIds: number[]) =>
      apiRequest<{ success?: boolean; summary?: Record<string, unknown>[] }>(
        '/api/admin/grade-classes/promote',
        { method: 'POST', body: { class_ids: classIds } },
      ),
  },

  announcements: {
    list: () =>
      apiRequest<{ notifications: Announcement[] }>('/api/admin/notifications').then(
        (r) => r.notifications ?? [],
      ),
    /** The worker strips HTML from both title and message before it stores them. */
    create: (body: NewAnnouncement) =>
      apiRequest<{ notification: Announcement }>('/api/admin/notifications', {
        method: 'POST',
        body,
      }),
    remove: (id: number) =>
      apiRequest<{ success: boolean }>(`/api/admin/notifications/${id}`, { method: 'DELETE' }),
  },
};

export const ops = {
  /** requireTechnical for the deep fields; a non-technical token still gets `{status,time}` at 200. */
  health: () => apiRequest<Health>('/api/health'),
  /** Public and never cached; 503 is a real answer, so read it through `catch` as "not ready". */
  ready: () => apiRequest<Ready>('/api/ready'),
  metrics: () => apiRequest<OpsMetrics>('/api/ops/metrics'),
  /** `range` is capped at 90 days by the worker; `requests` with range 1 switches to hourly buckets. */
  timeseries: (metric: TimeseriesMetric, range = 14) =>
    apiRequest<{ metric: string; points: Point[] }>(
      `/api/ops/timeseries${qs({ metric, range })}`,
    ).then((r) => r.points ?? []),
  cloudflare: (range = 7) => apiRequest<CloudflareMetrics>(`/api/ops/cloudflare${qs({ range })}`),
  flags: () => apiRequest<Flags>('/api/ops/flags'),
  /** Site-wide read-only mode. Everything but the allowlisted paths starts answering 503. */
  setMaintenance: (on: boolean) =>
    apiRequest<{ success: boolean; maintenance: boolean }>('/api/ops/maintenance', {
      method: 'POST',
      body: { on },
    }),
  setFlag: (flag: FlagKey, enabled: boolean) =>
    apiRequest<{ success: boolean; flag: string; enabled: boolean }>('/api/ops/flags', {
      method: 'POST',
      body: { flag, enabled },
    }),
  recompute: (target: RecomputeTarget) =>
    apiRequest<{ success: boolean; target: string; skipped?: boolean; reason?: string }>(
      '/api/ops/recompute',
      { method: 'POST', body: { target } },
    ),
  /** super only (403 otherwise). Hard-deletes soft-deleted notes past the cutoff. */
  purgeNotes: (olderThanDays: number) =>
    apiRequest<{ success: boolean; deleted: number }>('/api/ops/danger/purge-notes', {
      method: 'POST',
      body: { olderThanDays },
    }),
  /** super only. Empties `refresh_tokens`, so every short-session client has to sign in again. */
  revokeTokens: () =>
    apiRequest<{ success: boolean }>('/api/ops/danger/revoke-tokens', { method: 'POST' }),
};
