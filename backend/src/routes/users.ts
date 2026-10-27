import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getOrCreateUser, getUserIdFromToken } from '../lib/auth';
import { parseBody, userClassSchema, userUpdateSchema } from '../lib/validation';
import { SQL_NOW_ISO } from '../lib/time';

// Identity on these routes comes from the Bearer token only. They used to trust
// a client-asserted `X-Encrypted-Yw-ID` header (no token check at all) and even
// auto-created a user from it — a full authentication bypass. Rows are now
// addressed by the token's user id; nothing is ever created here. Fields the
// body omits keep their stored value (COALESCE) instead of being nulled.
// `email` is no longer writable here (see userUpdateSchema).

export async function updateUserInfo(request: Request, env: Env) {
  const userId = await getUserIdFromToken(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const body = await parseBody(request, userUpdateSchema, env);
  if (body instanceof Response) return body;

  await env.DB.prepare(
    `UPDATE users
        SET display_name = COALESCE(?, display_name),
            photo_url = COALESCE(?, photo_url),
            updated_at = ${SQL_NOW_ISO}
      WHERE id = ?`,
  )
    .bind(body.display_name ?? null, body.photo_url ?? null, userId)
    .run();

  return jsonResponse({ success: true }, 200, env);
}

export async function getCurrentUser(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  return jsonResponse({ user });
}

/**
 * PUT /api/user/class — the two things a student owns about their profile: the
 * class they are in, and the subjects they want the app to lean towards. The
 * display name is deliberately not here; on a Google account it is re-read from
 * Google at every sign-in (routes/oauth.ts), so nothing may overwrite it.
 *
 * Both fields in one route because the profile step sets them together: one
 * round trip, one error to show, and a half-saved profile is not reachable.
 */
export async function updateUserClass(request: Request, env: Env) {
  const userId = await getUserIdFromToken(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const body = await parseBody(request, userClassSchema, env);
  if (body instanceof Response) return body;

  // The class must be one the school actually runs — the same check signup
  // makes. Without it a shaped-but-unknown class ('12.9') would be stored and
  // every class-scoped query would quietly match nobody.
  const gradeClass = (await env.DB.prepare(
    'SELECT id, grade FROM grade_classes WHERE class_name = ? AND is_active = 1 LIMIT 1',
  )
    .bind(body.class)
    .first()) as { id: number; grade: number } | null;
  if (!gradeClass) return jsonResponse({ error: 'Invalid class selection' }, 400, env);

  // Focus ids are checked against the subjects table, deduped, and stored as
  // JSON. An omitted field leaves the stored list alone; [] clears it.
  let focusJson: string | null | undefined;
  if (body.focus_subject_ids) {
    const wanted = [...new Set(body.focus_subject_ids)];
    if (wanted.length === 0) {
      focusJson = null;
    } else {
      const placeholders = wanted.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT id FROM subjects WHERE id IN (${placeholders})`,
      )
        .bind(...wanted)
        .all();
      const known = new Set((rows.results as { id: number }[]).map((r) => r.id));
      const unknown = wanted.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        return jsonResponse({ error: 'Unknown subject', details: unknown }, 400, env);
      }
      focusJson = JSON.stringify(wanted);
    }
  }

  await env.DB.prepare(
    `UPDATE users
        SET class = ?,
            grade = ?,
            grade_class_id = ?,
            -- NULL is a meaningful value here (clear the list), so "leave it
            -- alone" cannot be COALESCE; it rides along as its own flag.
            focus_subject_ids = CASE WHEN ? = 1 THEN ? ELSE focus_subject_ids END,
            updated_at = ${SQL_NOW_ISO}
      WHERE id = ?`,
  )
    .bind(body.class, gradeClass.grade, gradeClass.id, focusJson === undefined ? 0 : 1, focusJson ?? null, userId)
    .run();

  return jsonResponse({ success: true }, 200, env);
}
