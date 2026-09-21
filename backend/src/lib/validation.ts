import { z } from 'zod';
import type { Env } from './env';
import { jsonResponse } from './response';

/**
 * Read and validate a JSON body in one step. Returns the parsed data, or a
 * ready-made 400 for a body that is not JSON at all (this used to escape as a
 * 500 from the outer catch on every route that did not guard `request.json()`
 * itself) or that fails the schema. Call sites: `if (body instanceof Response)
 * return body;` — the same shape as requireAdmin.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  env?: Env,
): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body format' }, 400, env);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return jsonResponse({ error: 'Invalid input', details: result.error.errors }, 400, env);
  }
  return result.data;
}

export const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  class: z.string().max(50).optional(),
  academic_year: z
    .string()
    .regex(/^\d{4}\/\d{4}$/, 'Expected format YYYY/YYYY')
    .optional(),
  // Sent by the browser at signup (Intl.resolvedOptions().timeZone). Length-capped
  // here only; whether the zone actually exists is decided by isValidZone(), which
  // asks Intl rather than guessing at a pattern.
  timezone: z.string().max(64).optional(),
});

export const promoteClassesSchema = z.object({
  class_ids: z.array(z.number().int().positive()).min(1),
  new_academic_year: z
    .string()
    .regex(/^\d{4}\/\d{4}$/, 'Expected format YYYY/YYYY')
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const noteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(100000),
  subject_id: z.number().int().positive(),
  description: z.string().max(500).optional(),
});

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(10000),
});

// Classes are "<grade>.<section>" (10.1 … 12.3 in the grade_classes seed). This
// checks the shape only; signup additionally requires the row to exist.
const classNameSchema = z.string().regex(/^1[0-2]\.\d{1,2}$/, 'Expected a class like 10.1');

// Avatars arrive as base64 data URLs (the old frontend caps the file at 2 MB,
// ~2.7 M chars encoded), so this is a length cap rather than a URL check.
const photoUrlSchema = z.string().max(3 * 1024 * 1024);

// PUT /api/auth/profile — the fields the old Settings/Profile screens send
// (`name`, `class`, `description`, `photo_url`, `timezone` or null). `email` is
// deliberately absent: signup fixes it and nothing offers a change flow, so a
// self-service email write was only ever an account-takeover surface. Unknown
// keys are stripped, not rejected.
export const profileUpdateSchema = z.object({
  name: z.string().max(100).optional(),
  display_name: z.string().max(100).optional(),
  class: classNameSchema.optional(),
  description: z.string().max(500).nullable().optional(),
  photo_url: photoUrlSchema.optional(),
  timezone: z.string().max(64).nullable().optional(),
});

// POST /api/user/update and PUT /api/user/class (legacy self-service routes;
// no frontend calls them today). Same email rule as the profile route.
export const userUpdateSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  photo_url: photoUrlSchema.optional(),
});

export const userClassSchema = z.object({
  class: classNameSchema,
});

// PUT /api/notes/:id (author) and PUT /api/admin/notes/:id (moderator): every
// field optional, the handler updates only what is present. Caps follow
// noteSchema; image_path is the JSON image list a create chunk may hold.
export const noteUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  content: z.string().max(100000).optional(),
  extracted_text: z.string().max(100000).optional(),
  image_path: z.string().max(900000).nullable().optional(),
  summary: z.string().max(10000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const noteSummarySchema = z.object({
  summary: z.string().max(10000),
});

export const suspendUserSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  reason: z.string().max(500).optional(),
});

export const warnUserSchema = z.object({
  message: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Wave M3 — every remaining body-reading route goes through parseBody, so a
// malformed or non-object body is a 400 and never a 500. Each schema below
// lists exactly the fields its handler reads. Types follow what the two
// frontends send (src/lib/api.ts here, src/lib/api.ts in V2.0); a field the
// handler pushes through Number() also accepts a numeric string, and a
// code / token / password the handler pushes through String() also accepts a
// number, so nothing that worked before is refused now. Nothing is required
// or capped here — required-ness and every business rule stay in the
// handlers, whose own error messages are unchanged.
// ---------------------------------------------------------------------------

/** A JSON string or number — for fields the handler coerces with String() / Number(). */
const stringOrNumber = z.union([z.string(), z.number()]);

// POST /api/auth/admin-login — `token` is the admin / moderator / technical password.
export const adminLoginSchema = z.object({ token: stringOrNumber.optional() });

// POST /api/admin/verify
export const adminVerifySchema = z.object({
  email: z.string().optional(),
  password: stringOrNumber.optional(),
});

// POST /api/auth/change-password
export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
});

// POST /api/auth/admin-reset-password and POST /api/admin/emergency-password-fix
export const adminPasswordResetSchema = z.object({
  email: z.string().optional(),
  newPassword: z.string().optional(),
});

// POST /api/admin/migrate-passwords — LIMIT / OFFSET, defaulted by the handler.
export const migratePasswordsSchema = z.object({
  batchSize: z.number().optional(),
  offset: z.number().optional(),
});

// The 2FA routes (twofa.ts). Codes, challenges and the recovery password are
// String()-coerced by the handlers.
export const twoFaEnableSchema = z.object({ code: stringOrNumber.optional() });
export const twoFaDisableSchema = z.object({
  code: stringOrNumber.optional(),
  password: stringOrNumber.optional(),
});
export const twoFaVerifySchema = z.object({
  challenge: stringOrNumber.optional(),
  code: stringOrNumber.optional(),
});
export const forgotPasswordSchema = z.object({ email: z.string().optional() });
export const setPasswordSchema = z.object({ newPassword: stringOrNumber.optional() });

// POST /api/notes — what createNote reads, as the upload form (old frontend)
// and the block editor (V2.0) send it. The old form sends
// `scheduled_publish_at: null` for an unscheduled draft, and the handler
// treats null and absent alike for every optional field, hence nullish.
// noteSchema above is NOT this route's schema: it requires `content`, which
// the old upload form never sends, and caps `description` at 500.
export const createNoteSchema = z.object({
  title: z.string().optional(),
  subject_id: z.number().optional(),
  description: z.string().nullish(),
  content: z.string().nullish(),
  extracted_text: z.string().nullish(),
  quick_summary: z.string().nullish(),
  images: z.array(z.string()).nullish(),
  image_path: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  status: z.string().nullish(),
  scheduled_publish_at: z.string().nullish(),
  visibility: z.string().nullish(),
});

// AI routes. quick-summary / auto-tags / POST notes/:id/summary / POST
// notes/:id/quiz read title + content; summarize also reads description.
export const aiTitleContentSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
});
export const aiSummarizeSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
});
export const ocrSchema = z.object({
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
});
// POST /api/ai/quiz — the handler validates every field itself (allow-lists,
// integer ranges); this only fixes the JSON types.
export const structuredQuizSchema = z.object({
  source_type: z.string().optional(),
  source_id: stringOrNumber.optional(),
  count: stringOrNumber.optional(),
  difficulty: z.string().optional(),
  types: z.array(z.string()).optional(),
});
export const studyPlanSchema = z.object({
  subject: z.string().optional(),
  topic: z.string().optional(),
});
export const conceptExplainSchema = z.object({
  concept: z.string().optional(),
  subject: z.string().optional(),
});
export const primerSchema = z.object({ topic: z.string().optional() });

// Study routes (study.ts, progress.ts). `!= null` fields are nullish.
export const quizAttemptSchema = z.object({
  note_id: stringOrNumber.nullish(),
  question_text: z.string().optional(),
  is_correct: z.boolean().optional(),
  confidence: stringOrNumber.nullish(),
});
export const gradeReviewSchema = z.object({
  is_correct: z.boolean().optional(),
  confidence: stringOrNumber.nullish(),
});
export const recallGradeSchema = z.object({
  note_content: z.string().optional(),
  recall_text: z.string().optional(),
});
export const completeTestSchema = z.object({
  question_count: stringOrNumber.optional(),
  correct_count: stringOrNumber.optional(),
  source_type: z.string().nullish(),
  source_id: stringOrNumber.nullish(),
  duration_sec: stringOrNumber.nullish(),
});

// Admin writes (subjects.ts, admin.ts, notifications.ts).
export const gradeClassCreateSchema = z.object({
  grade: stringOrNumber.optional(),
  class_name: z.string().optional(),
  semester: z.string().optional(),
});
export const gradeClassUpdateSchema = z.object({
  class_name: z.string().optional(),
  semester: z.string().optional(),
  // The admin UI sends the stored 0/1 back; a boolean is accepted too.
  is_active: z.union([z.boolean(), z.number()]).optional(),
});
export const reassignClassSchema = z.object({
  user_id: z.number().optional(),
  new_class: z.string().optional(),
  send_notification: z.boolean().optional(),
});
export const subjectWriteSchema = z.object({
  name: z.string().optional(),
  icon: z.string().optional(),
});
export const adminUserUpdateSchema = z.object({
  display_name: z.string().optional(),
  class: z.string().optional(),
  diamonds: stringOrNumber.optional(),
  learning_points: stringOrNumber.optional(),
  role: z.string().optional(),
});
export const adminNotificationSchema = z.object({
  target_type: z.string().optional(),
  target_grade: z.number().optional(),
  target_class: z.string().optional(),
  target_user_id: z.number().optional(),
  notification_type: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
});

// Tutor wing (tutors.ts). Ids, caps and ratings are Number()-coerced.
export const tutorApplySchema = z.object({
  subject_id: stringOrNumber.optional(),
  blurb: z.string().optional(),
  grade_min: stringOrNumber.optional(),
  grade_max: stringOrNumber.optional(),
});
export const tutorReviewSchema = z.object({ status: z.string().optional() });
export const availabilitySchema = z.object({
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  kind: z.string().optional(),
  seat_cap: stringOrNumber.optional(),
});
export const sessionCreateSchema = z.object({
  kind: z.string().optional(),
  tutor_profile_id: stringOrNumber.optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  seat_cap: stringOrNumber.optional(),
  topic: z.string().optional(),
  location: z.string().optional(),
  availability_id: stringOrNumber.optional(),
});
export const rateBookingSchema = z.object({
  rating: stringOrNumber.optional(),
  feedback: z.string().optional(),
});

// Ops dashboard (ops.ts).
export const maintenanceSchema = z.object({ on: z.boolean().optional() });
export const flagSchema = z.object({
  flag: z.string().optional(),
  enabled: z.boolean().optional(),
});
export const recomputeSchema = z.object({ target: z.string().optional() });
export const purgeNotesSchema = z.object({ olderThanDays: stringOrNumber.nullish() });

// POST /auth/google/exchange (oauth.ts) — the one-time code minted by the callback.
export const oauthExchangeSchema = z.object({ code: z.string().optional() });
