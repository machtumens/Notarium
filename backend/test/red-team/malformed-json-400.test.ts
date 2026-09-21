// Wave M3 — a malformed JSON body is a 400 on EVERY body-reading route.
//
// FINDING (the M2 residual): signup, change-password, createNote, the 2FA
// routes, admin-login / admin verify, the admin password-reset routes, the AI
// routes, the admin grade-class / subject / notification / user writes and the
// study routes all read the body with a bare `await request.json()`. A
// truncated body (`{bad`) threw SyntaxError out of the handler and surfaced as a
// 500 from the nearest catch — three AI routes even echoed the parser's message
// in that 500, and /api/gemini/auto-tags swallowed it into a 200 with default
// tags. The tutor, mock-test, ops and OAuth-exchange routes guarded the parse
// themselves but still 500'd on a body that parses to `null` (property read on
// null inside the handler). Every route below now goes through parseBody:
//   `{bad`            → 400 { error: 'Invalid request body format' }
//   `null` / `[]`     → 400 { error: 'Invalid input', ... }
//   a well-formed body → whatever the route answered before (one per route,
//                        so the schemas cannot be tighter than the callers).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  applySchema,
  resetData,
  call,
  seedUser,
  seedSubject,
  seedNote,
  signupBody,
  env,
  TEST_SECRETS,
  type SeededUser,
} from './helpers';
import { base32Encode, generateBackupCodes, createMfaChallenge } from '../../src/lib/totp';

beforeAll(applySchema);
beforeEach(resetData);

// AI routes: keys are absent in the test bindings so the worker takes the
// "not configured" branch. The happy paths that need a provider enable a fake
// key and stub the outbound fetch — torn down after every test so the
// key-absent suites in the same worker stay valid (same pattern as
// provider-mocks.test.ts).
const AI_KEYS = ['GOOGLE_CLOUD_VISION_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY'] as const;
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of AI_KEYS) delete (env as any)[k];
});

function providerJson(obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** DeepSeek answers `content`; Vision answers `visionText`. */
function stubProviders(opts: { deepseek?: string; vision?: string }) {
  if (opts.deepseek !== undefined) (env as any).DEEPSEEK_API_KEY = 'test-deepseek';
  if (opts.vision !== undefined) (env as any).GOOGLE_CLOUD_VISION_API_KEY = 'test-vision';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('deepseek.com')) {
        return providerJson({ choices: [{ message: { content: opts.deepseek ?? '' } }] });
      }
      if (u.includes('vision.googleapis.com')) {
        return providerJson({
          responses: [{ textAnnotations: [{ description: opts.vision ?? '' }] }],
        });
      }
      return new Response('UNMOCKED PROVIDER: ' + u, { status: 502 });
    }),
  );
}

// The 2FA enable route verifies a live 6-digit code against Date.now() and
// totp.ts keeps hotp() private, so compute the current step here (RFC 4226
// §5.3 — the same arithmetic the app uses) from the raw secret bytes.
const TOTP_SECRET_BYTES = new TextEncoder().encode('12345678901234567890');
const TOTP_SECRET_B32 = base32Encode(TOTP_SECRET_BYTES);

async function currentTotp(keyBytes: Uint8Array, nowMs = Date.now()): Promise<string> {
  let counter = Math.floor(nowMs / 1000 / 30);
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    msg[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = sig[19] & 0x0f;
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return (bin % 1_000_000).toString().padStart(6, '0');
}

// ---------------------------------------------------------------------------
// The world a row may need. Everything is seeded lazily and memoised per test
// (resetData wipes it between tests): a bcrypt hash costs ~70 ms, so a row
// pays only for the identities it actually touches. Rows add their own rows
// through `setup` and stash ids in `ids` / `strings`.
// ---------------------------------------------------------------------------
type Who = 'anon' | 'student' | 'super' | 'moderator' | 'technical';

class World {
  private memo = new Map<string, Promise<unknown>>();
  ids: Record<string, number> = {};
  strings: Record<string, string> = {};

  private lazy<T>(key: string, make: () => Promise<T>): Promise<T> {
    if (!this.memo.has(key)) this.memo.set(key, make());
    return this.memo.get(key) as Promise<T>;
  }

  student(): Promise<SeededUser> {
    return this.lazy('student', () => seedUser());
  }
  superAdmin(): Promise<SeededUser> {
    return this.lazy('super', () => seedUser({ role: 'admin', admin_role: 'super' }));
  }
  moderator(): Promise<SeededUser> {
    return this.lazy('moderator', () => seedUser({ role: 'admin', admin_role: 'moderator' }));
  }
  technical(): Promise<SeededUser> {
    return this.lazy('technical', () => seedUser({ role: 'admin', admin_role: 'technical' }));
  }
  subject(): Promise<number> {
    return this.lazy('subject', () => seedSubject());
  }
  /** A published note owned by the student. */
  note(): Promise<number> {
    return this.lazy('note', async () => seedNote((await this.student()).id, await this.subject()));
  }

  async token(who: Who): Promise<string | undefined> {
    switch (who) {
      case 'anon':
        return undefined;
      case 'student':
        return (await this.student()).token;
      case 'super':
        return (await this.superAdmin()).token;
      case 'moderator':
        return (await this.moderator()).token;
      case 'technical':
        return (await this.technical()).token;
    }
  }
}

async function seedGradeClass(w: World, className = '10.2'): Promise<number> {
  const row = (await env.DB.prepare(
    `INSERT INTO grade_classes (grade, class_name, semester, is_active) VALUES (10, ?, '', 1) RETURNING id`,
  )
    .bind(className)
    .first()) as { id: number };
  w.ids.gradeClass = row.id;
  return row.id;
}

async function seedTutorProfile(w: World, userId: number, status: string): Promise<number> {
  const row = (await env.DB.prepare(
    `INSERT INTO tutor_profiles (user_id, subject_id, status) VALUES (?, ?, ?) RETURNING id`,
  )
    .bind(userId, await w.subject(), status)
    .first()) as { id: number };
  w.ids.profile = row.id;
  return row.id;
}

interface Row {
  route: string;
  method?: 'POST' | 'PUT';
  path: string | ((w: World) => Promise<string>);
  as: Who;
  /** Seeds whatever the path or the happy body needs. */
  setup?: (w: World) => Promise<void>;
  /** Provider stub for the happy path only (the parser answers before any provider call). */
  stub?: () => void;
  /** A well-formed body in the shape the frontends send. */
  happy: (w: World) => Promise<unknown>;
  /** The status that body earns in this environment. */
  status: number;
}

const ISO_START = '2030-01-01T10:00:00Z';
const ISO_END = '2030-01-01T11:00:00Z';

const ROUTES: Row[] = [
  // ---- account routes, no token ----
  {
    route: 'POST /api/auth/signup',
    path: '/api/auth/signup',
    as: 'anon',
    happy: async () => signupBody(),
    status: 201,
  },
  {
    route: 'POST /api/auth/login',
    path: '/api/auth/login',
    as: 'anon',
    happy: async (w) => ({
      email: (await w.student()).email,
      password: (await w.student()).password,
    }),
    status: 200,
  },
  {
    route: 'POST /api/auth/admin-login',
    path: '/api/auth/admin-login',
    as: 'anon',
    happy: async () => ({ token: TEST_SECRETS.ADMIN_PASSWORD }),
    status: 200,
  },
  {
    route: 'POST /api/admin/verify',
    path: '/api/admin/verify',
    as: 'anon',
    happy: async () => ({ email: 'ops@notarium.site', password: TEST_SECRETS.ADMIN_PASSWORD }),
    status: 200,
  },
  {
    route: 'POST /api/auth/forgot-password',
    path: '/api/auth/forgot-password',
    as: 'anon',
    happy: async (w) => ({ email: (await w.student()).email }),
    status: 200,
  },
  {
    route: 'POST /api/auth/2fa/verify',
    path: '/api/auth/2fa/verify',
    as: 'anon',
    setup: async (w) => {
      const { plain, hashes } = await generateBackupCodes(2);
      await env.DB.prepare(
        `UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_backup_codes = ? WHERE id = ?`,
      )
        .bind(TOTP_SECRET_B32, JSON.stringify(hashes), (await w.student()).id)
        .run();
      w.strings.backupCode = plain[0];
      w.strings.challenge = await createMfaChallenge((await w.student()).id, env);
    },
    happy: async (w) => ({ challenge: w.strings.challenge, code: w.strings.backupCode }),
    status: 200,
  },
  {
    route: 'POST /auth/google/exchange',
    path: '/auth/google/exchange',
    as: 'anon',
    setup: async () => {
      await env.RATE_LIMIT.put(
        'oauth_exchange:good-code',
        JSON.stringify({ jwt: 'session-jwt', exp: Math.floor(Date.now() / 1000) + 60 }),
      );
    },
    happy: async () => ({ code: 'good-code' }),
    status: 200,
  },

  // ---- signed-in student ----
  {
    route: 'POST /api/auth/change-password',
    path: '/api/auth/change-password',
    as: 'student',
    happy: async (w) => ({
      currentPassword: (await w.student()).password,
      newPassword: 'Different123',
    }),
    status: 200,
  },
  {
    route: 'POST /api/auth/2fa/enable',
    path: '/api/auth/2fa/enable',
    as: 'student',
    setup: async (w) => {
      await env.DB.prepare(`UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?`)
        .bind(TOTP_SECRET_B32, (await w.student()).id)
        .run();
    },
    happy: async () => ({ code: await currentTotp(TOTP_SECRET_BYTES) }),
    status: 200,
  },
  {
    route: 'POST /api/auth/2fa/disable',
    path: '/api/auth/2fa/disable',
    as: 'student',
    happy: async (w) => ({ password: (await w.student()).password }),
    status: 200,
  },
  {
    route: 'POST /api/auth/set-password',
    path: '/api/auth/set-password',
    as: 'student',
    happy: async () => ({ newPassword: 'Different123' }),
    status: 200,
  },
  {
    route: 'POST /api/notes',
    path: '/api/notes',
    as: 'student',
    happy: async (w) => ({ title: 'T', content: 'body', subject_id: await w.subject() }),
    status: 200,
  },
  {
    route: 'POST /api/gemini/quick-summary',
    path: '/api/gemini/quick-summary',
    as: 'student',
    happy: async () => ({ title: 'Bio', content: 'cells' }),
    status: 200,
  },
  {
    route: 'POST /api/gemini/auto-tags',
    path: '/api/gemini/auto-tags',
    as: 'student',
    happy: async () => ({ title: 'Bio', content: 'cells' }),
    status: 200,
  },
  {
    route: 'POST /api/gemini/summarize',
    path: '/api/gemini/summarize',
    as: 'student',
    happy: async () => ({ title: 'Bio', description: 'cells' }),
    status: 200,
  },
  {
    route: 'POST /api/gemini/ocr',
    path: '/api/gemini/ocr',
    as: 'student',
    stub: () => stubProviders({ vision: 'Photosynthesis.' }),
    happy: async () => ({ imageBase64: 'data:image/png;base64,AAA' }),
    status: 200,
  },
  {
    route: 'POST /api/notes/:id/summary',
    path: async (w) => `/api/notes/${await w.note()}/summary`,
    as: 'student',
    stub: () => stubProviders({ deepseek: 'Sel adalah unit dasar. Sel punya inti.' }),
    happy: async () => ({ title: 'Bio', content: 'cells' }),
    status: 200,
  },
  {
    route: 'POST /api/notes/:id/quiz',
    path: async (w) => `/api/notes/${await w.note()}/quiz`,
    as: 'student',
    stub: () => stubProviders({ deepseek: '{"questions":[]}' }),
    happy: async () => ({ title: 'Bio', content: 'cells' }),
    status: 200,
  },
  {
    route: 'POST /api/ai/quiz',
    path: '/api/ai/quiz',
    as: 'student',
    setup: async (w) => {
      await env.DB.prepare('UPDATE notes SET extracted_text = ? WHERE id = ?')
        .bind('Fotosintesis mengubah cahaya menjadi energi.', await w.note())
        .run();
    },
    stub: () => stubProviders({ deepseek: '{"questions":[]}' }),
    happy: async (w) => ({
      source_type: 'note',
      source_id: await w.note(),
      count: 3,
      difficulty: 'easy',
      types: ['mcq'],
    }),
    status: 200,
  },
  {
    route: 'POST /api/study-plan',
    path: '/api/study-plan',
    as: 'student',
    stub: () => stubProviders({ deepseek: 'Day 1: read the note.' }),
    happy: async () => ({ subject: 'Biology', topic: 'Cells' }),
    status: 200,
  },
  {
    route: 'POST /api/concept-explain',
    path: '/api/concept-explain',
    as: 'student',
    stub: () => stubProviders({ deepseek: 'Osmosis is water moving across a membrane.' }),
    happy: async () => ({ concept: 'Osmosis', subject: 'Biology' }),
    status: 200,
  },
  {
    route: 'POST /api/ai/primer',
    path: '/api/ai/primer',
    as: 'student',
    stub: () =>
      stubProviders({ deepseek: '{"overview":"o","key_concepts":["a"],"questions":["q?"]}' }),
    happy: async () => ({ topic: 'Osmosis' }),
    status: 200,
  },
  {
    route: 'POST /api/quiz/attempt',
    path: '/api/quiz/attempt',
    as: 'student',
    happy: async () => ({ question_text: 'What is 2+2?', is_correct: true, confidence: 3 }),
    status: 200,
  },
  {
    route: 'POST /api/reviews/:id/grade',
    path: async (w) => `/api/reviews/${w.ids.studyItem}/grade`,
    as: 'student',
    setup: async (w) => {
      const row = (await env.DB.prepare(
        `INSERT INTO study_items (user_id, note_id, question_text, question_hash) VALUES (?, NULL, 'q', 'h') RETURNING id`,
      )
        .bind((await w.student()).id)
        .first()) as { id: number };
      w.ids.studyItem = row.id;
    },
    happy: async () => ({ is_correct: true, confidence: 2 }),
    status: 200,
  },
  {
    route: 'POST /api/recall/grade',
    path: '/api/recall/grade',
    as: 'student',
    stub: () => stubProviders({ deepseek: '{"score":80,"feedback":"good","missed_points":[]}' }),
    happy: async () => ({
      note_content: 'Cells have a nucleus.',
      recall_text: 'Cells have a nucleus.',
    }),
    status: 200,
  },
  {
    route: 'POST /api/tests/complete',
    path: '/api/tests/complete',
    as: 'student',
    happy: async () => ({
      question_count: 4,
      correct_count: 3,
      source_type: null,
      source_id: null,
    }),
    status: 200,
  },
  {
    route: 'POST /api/tutors/apply',
    path: '/api/tutors/apply',
    as: 'student',
    setup: async (w) => {
      await env.DB.prepare(
        `UPDATE users SET learning_points = 100, notes_uploaded = 1 WHERE id = ?`,
      )
        .bind((await w.student()).id)
        .run();
    },
    happy: async (w) => ({ subject_id: await w.subject(), blurb: 'Happy to help with cells.' }),
    status: 201,
  },
  {
    route: 'POST /api/tutors/:id/availability',
    path: async (w) => `/api/tutors/${w.ids.profile}/availability`,
    as: 'student',
    setup: async (w) => {
      await seedTutorProfile(w, (await w.student()).id, 'active');
    },
    happy: async () => ({ starts_at: ISO_START, ends_at: ISO_END, seat_cap: 4 }),
    status: 201,
  },
  {
    route: 'POST /api/sessions',
    path: '/api/sessions',
    as: 'student',
    setup: async (w) => {
      await seedTutorProfile(w, (await w.student()).id, 'active');
    },
    happy: async (w) => ({
      tutor_profile_id: w.ids.profile,
      starts_at: ISO_START,
      ends_at: ISO_END,
      seat_cap: 4,
      topic: 'Waves',
    }),
    status: 201,
  },
  {
    route: 'POST /api/bookings/:id/rate',
    path: async (w) => `/api/bookings/${w.ids.booking}/rate`,
    as: 'student',
    setup: async (w) => {
      const tutor = await seedUser();
      const profileId = await seedTutorProfile(w, tutor.id, 'active');
      const session = (await env.DB.prepare(
        `INSERT INTO tutor_sessions (tutor_profile_id, subject_id, kind, seat_cap, starts_at, ends_at, status)
         VALUES (?, ?, 'group', 4, ?, ?, 'completed') RETURNING id`,
      )
        .bind(profileId, await w.subject(), ISO_START, ISO_END)
        .first()) as { id: number };
      const booking = (await env.DB.prepare(
        `INSERT INTO tutor_bookings (session_id, student_id, seat_no, status) VALUES (?, ?, 1, 'attended') RETURNING id`,
      )
        .bind(session.id, (await w.student()).id)
        .first()) as { id: number };
      w.ids.booking = booking.id;
    },
    happy: async () => ({ rating: 5, feedback: 'Clear and patient.' }),
    status: 200,
  },

  // ---- admin ----
  {
    route: 'POST /api/auth/admin-reset-password',
    path: '/api/auth/admin-reset-password',
    as: 'super',
    happy: async (w) => ({ email: (await w.student()).email, newPassword: 'Different123' }),
    status: 200,
  },
  {
    route: 'POST /api/admin/emergency-password-fix',
    path: '/api/admin/emergency-password-fix',
    as: 'super',
    happy: async (w) => ({ email: (await w.student()).email, newPassword: 'Different123' }),
    status: 200,
  },
  {
    route: 'POST /api/admin/migrate-passwords',
    path: '/api/admin/migrate-passwords',
    as: 'super',
    happy: async () => ({ batchSize: 5, offset: 0 }),
    status: 200,
  },
  {
    route: 'PUT /api/admin/user/:id',
    method: 'PUT',
    path: async (w) => `/api/admin/user/${(await w.student()).id}`,
    as: 'moderator',
    happy: async () => ({ display_name: 'Renamed', diamonds: 3 }),
    status: 200,
  },
  {
    route: 'POST /api/admin/subjects',
    path: '/api/admin/subjects',
    as: 'moderator',
    happy: async () => ({ name: 'Chemistry', icon: 'flask' }),
    status: 201,
  },
  {
    route: 'PUT /api/admin/subjects/:id',
    method: 'PUT',
    path: async (w) => `/api/admin/subjects/${await w.subject()}`,
    as: 'moderator',
    happy: async () => ({ name: 'Renamed subject', icon: 'atom' }),
    status: 200,
  },
  {
    route: 'POST /api/admin/grade-classes',
    path: '/api/admin/grade-classes',
    as: 'moderator',
    happy: async () => ({ grade: 10, class_name: '10.9', semester: '' }),
    status: 201,
  },
  {
    route: 'PUT /api/admin/grade-classes/:id',
    method: 'PUT',
    path: async (w) => `/api/admin/grade-classes/${w.ids.gradeClass}`,
    as: 'moderator',
    setup: async (w) => {
      await seedGradeClass(w);
    },
    happy: async () => ({ semester: 'Ganjil', is_active: 0 }),
    status: 200,
  },
  {
    route: 'POST /api/admin/grade-classes/reassign',
    path: '/api/admin/grade-classes/reassign',
    as: 'moderator',
    setup: async (w) => {
      await seedGradeClass(w, '10.2');
    },
    happy: async (w) => ({
      user_id: (await w.student()).id,
      new_class: '10.2',
      send_notification: true,
    }),
    status: 200,
  },
  {
    route: 'POST /api/admin/grade-classes/promote',
    path: '/api/admin/grade-classes/promote',
    as: 'moderator',
    setup: async (w) => {
      await seedGradeClass(w);
    },
    happy: async (w) => ({ class_ids: [w.ids.gradeClass] }),
    status: 200,
  },
  {
    route: 'POST /api/admin/notifications',
    path: '/api/admin/notifications',
    as: 'moderator',
    happy: async () => ({ target_type: 'all', title: 'Notice', message: 'Hello' }),
    status: 201,
  },
  {
    route: 'POST /api/admin/tutors/:id/approve',
    path: async (w) => `/api/admin/tutors/${w.ids.profile}/approve`,
    as: 'moderator',
    setup: async (w) => {
      await seedTutorProfile(w, (await w.student()).id, 'pending');
    },
    happy: async () => ({ status: 'active' }),
    status: 200,
  },

  // ---- ops (technical dashboard) ----
  {
    route: 'POST /api/ops/maintenance',
    path: '/api/ops/maintenance',
    as: 'technical',
    happy: async () => ({ on: false }),
    status: 200,
  },
  {
    route: 'POST /api/ops/flags',
    path: '/api/ops/flags',
    as: 'technical',
    happy: async () => ({ flag: 'signups', enabled: true }),
    status: 200,
  },
  {
    route: 'POST /api/ops/recompute',
    path: '/api/ops/recompute',
    as: 'technical',
    happy: async () => ({ target: 'subjects_note_count' }),
    status: 200,
  },
  {
    route: 'POST /api/ops/danger/purge-notes',
    path: '/api/ops/danger/purge-notes',
    as: 'super',
    happy: async () => ({ olderThanDays: 30 }),
    status: 200,
  },
];

async function fire(row: Row, w: World, body: { rawBody?: string; body?: unknown }) {
  const path = typeof row.path === 'function' ? await row.path(w) : row.path;
  return call(path, {
    method: row.method ?? 'POST',
    token: await w.token(row.as),
    ip: '77.0.0.1',
    ...body,
  });
}

describe('Wave M3 — malformed JSON is a 400 on every body-reading route', () => {
  it.each(ROUTES)('$route: `{bad` → 400 Invalid request body format', async (row) => {
    const w = new World();
    await row.setup?.(w);
    const res = await fire(row, w, { rawBody: '{bad' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Invalid request body format');
  });

  it.each(ROUTES)('$route: `null` → 400 Invalid input (not an object)', async (row) => {
    const w = new World();
    await row.setup?.(w);
    const res = await fire(row, w, { rawBody: 'null' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Invalid input');
  });

  it.each(ROUTES)('$route: `[]` → 400 Invalid input (not an object)', async (row) => {
    const w = new World();
    await row.setup?.(w);
    const res = await fire(row, w, { rawBody: '[]' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Invalid input');
  });
});

describe('Wave M3 — a well-formed body still gets the route’s normal answer', () => {
  it.each(ROUTES)('$route: happy path stays green', async (row) => {
    const w = new World();
    await row.setup?.(w);
    row.stub?.();
    const res = await fire(row, w, { body: await row.happy(w) });
    expect(res.status, await res.clone().text()).toBe(row.status);
  });
});
