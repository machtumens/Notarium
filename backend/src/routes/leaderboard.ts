import type { Env } from '../lib/env';
import { jsonResponse, PUBLIC_CACHE } from '../lib/response';

export async function getLeaderboard(env: Env) {
  const { results } = await env.DB.prepare(
    `
    SELECT
      display_name,
      photo_url,
      class,
      notes_uploaded,
      total_likes,
      total_admin_upvotes,
      learning_points,
      current_streak,
      (notes_uploaded + total_likes + total_admin_upvotes) as points
    FROM users
    WHERE role != 'admin'
    ORDER BY learning_points DESC, current_streak DESC
    LIMIT 100
  `,
  ).all();

  return jsonResponse({ leaderboard: results }, 200, env, null, PUBLIC_CACHE);
}
