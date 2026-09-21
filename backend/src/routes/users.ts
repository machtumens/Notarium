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

export async function updateUserClass(request: Request, env: Env) {
  const userId = await getUserIdFromToken(request, env);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const body = await parseBody(request, userClassSchema, env);
  if (body instanceof Response) return body;

  await env.DB.prepare(`UPDATE users SET class = ?, updated_at = ${SQL_NOW_ISO} WHERE id = ?`)
    .bind(body.class, userId)
    .run();

  return jsonResponse({ success: true }, 200, env);
}
