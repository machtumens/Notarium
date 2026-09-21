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
