import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { requireTechnical } from '../lib/auth';
import { logAdminActivity } from './admin';

// Highest applied migration. Bump this string when a new migration lands.
const LATEST_MIGRATION = '0014';

type Decoded = { id: number; email: string; role: string; admin_role?: string };

// Run a scalar query defensively; return `fallback` if the query throws.
async function safeScalar<T = number>(
  env: Env,
  sql: string,
  binds: unknown[] = [],
  column = 'v',
  fallback: T = 0 as unknown as T,
): Promise<T> {
  try {
    const row = (await env.DB.prepare(sql)
      .bind(...binds)
      .first()) as Record<string, unknown> | null;
    if (!row) return fallback;
    const val = row[column];
    return (val ?? fallback) as T;
  } catch {
    return fallback;
  }
}

// SUPER-only guard: call AFTER requireTechnical has passed. Legacy admins with
// no admin_role (nullish) are treated as super.
function isSuper(decoded: Decoded): boolean {
  return !decoded.admin_role || decoded.admin_role === 'super';
}

// ---------------------------------------------------------------------------
// 1. Health check — shallow (public) / deep (technical)
// ---------------------------------------------------------------------------
export async function healthCheck(request: Request, env: Env): Promise<Response> {
  const time = new Date().toISOString();

  // Shallow DB ping first — this is what uptime pingers see.
  try {
    await env.DB.prepare('SELECT 1 AS v').first();
  } catch {
    return jsonResponse({ status: 'down', time }, 503, env);
  }

  // Attempt deep health only when a valid technical token is present. If the
  // guard rejects, fall back to the shallow object (200) so pingers still work.
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) {
    return jsonResponse({ status: 'ok', time }, 200, env);
  }

  let kv: boolean;
  try {
    await env.RATE_LIMIT.get('__health');
    kv = true;
  } catch {
    kv = false;
  }

  return jsonResponse(
    {
      status: 'ok',
      time,
      db: true,
      kv,
      ai_configured: !!env.DEEPSEEK_API_KEY,
      oauth_configured: !!env.GOOGLE_CLIENT_ID,
      latest_migration: LATEST_MIGRATION,
    },
    200,
    env,
  );
}

// ---------------------------------------------------------------------------
// 2. Tier-A aggregate metrics
// ---------------------------------------------------------------------------
export async function getOpsMetrics(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;

  const [
    live5m,
    live1h,
    live24h,
    totalUsers,
    totalNotes,
    suspendedUsers,
    activeWarnings,
    chatSessions,
    quizAttempts,
    softDeletedNotes,
    featuredNotes,
    rowsUsers,
    rowsNotes,
    rowsChatMessages,
    rowsStudyItems,
  ] = await Promise.all([
    safeScalar(
      env,
      `SELECT COUNT(*) AS v FROM users WHERE last_seen_at >= datetime('now','-5 minutes')`,
    ),
    safeScalar(
      env,
      `SELECT COUNT(*) AS v FROM users WHERE last_seen_at >= datetime('now','-1 hour')`,
    ),
    safeScalar(
      env,
      `SELECT COUNT(*) AS v FROM users WHERE last_seen_at >= datetime('now','-1 day')`,
    ),
    safeScalar(env, `SELECT COUNT(*) AS v FROM users`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM notes WHERE deleted_at IS NULL`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM users WHERE suspended = 1`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM users WHERE warning = 1`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM chat_sessions`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM quiz_attempts`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM notes WHERE deleted_at IS NOT NULL`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM notes WHERE featured = 1 AND deleted_at IS NULL`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM users`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM notes`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM chat_messages`),
    safeScalar(env, `SELECT COUNT(*) AS v FROM study_items`),
  ]);

  return jsonResponse(
    {
      live_users: { m5: live5m, h1: live1h, d1: live24h },
      totals: {
        users: totalUsers,
        notes: totalNotes,
        suspended_users: suspendedUsers,
        active_warnings: activeWarnings,
        chat_sessions: chatSessions,
        quiz_attempts: quizAttempts,
      },
      moderation: {
        soft_deleted_notes: softDeletedNotes,
        featured_notes: featuredNotes,
      },
      table_rows: {
        users: rowsUsers,
        notes: rowsNotes,
        chat_messages: rowsChatMessages,
        study_items: rowsStudyItems,
      },
    },
    200,
    env,
  );
}

// ---------------------------------------------------------------------------
// 3. Timeseries
// ---------------------------------------------------------------------------
async function safePoints(
  env: Env,
  sql: string,
  binds: unknown[] = [],
): Promise<Array<{ t: string; v: number }>> {
  try {
    const { results } = await env.DB.prepare(sql)
      .bind(...binds)
      .all();
    return (results || []).map((r: any) => ({ t: String(r.t), v: Number(r.v) || 0 }));
  } catch {
    return [];
  }
}

export async function getOpsTimeseries(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const metric = url.searchParams.get('metric') || 'signups';
  const rangeRaw = parseInt(url.searchParams.get('range') || '7', 10);
  const range = Number.isFinite(rangeRaw) && rangeRaw > 0 ? Math.min(rangeRaw, 90) : 7;
  const since = `-${range} days`;

  let points: Array<{ t: string; v: number }>;

  switch (metric) {
    case 'signups':
      points = await safePoints(
        env,
        `SELECT strftime('%Y-%m-%d', created_at) AS t, COUNT(*) AS v
         FROM users
         WHERE created_at >= datetime('now', ?)
         GROUP BY t ORDER BY t`,
        [since],
      );
      break;
    case 'notes':
      points = await safePoints(
        env,
        `SELECT strftime('%Y-%m-%d', created_at) AS t, COUNT(*) AS v
         FROM notes
         WHERE created_at >= datetime('now', ?)
         GROUP BY t ORDER BY t`,
        [since],
      );
      break;
    case 'requests':
      if (range <= 1) {
        points = await safePoints(
          env,
          `SELECT strftime('%Y-%m-%d %H:00', ts) AS t, COUNT(*) AS v
           FROM request_metrics
           WHERE ts >= datetime('now', '-24 hours')
           GROUP BY t ORDER BY t`,
        );
      } else {
        points = await safePoints(
          env,
          `SELECT strftime('%Y-%m-%d', ts) AS t, COUNT(*) AS v
           FROM request_metrics
           WHERE ts >= datetime('now', ?)
           GROUP BY t ORDER BY t`,
          [since],
        );
      }
      break;
    case 'errors':
      points = await safePoints(
        env,
        `SELECT strftime('%Y-%m-%d', ts) AS t, COUNT(*) AS v
         FROM request_metrics
         WHERE status >= 400 AND ts >= datetime('now', ?)
         GROUP BY t ORDER BY t`,
        [since],
      );
      break;
    case 'ai':
      points = await safePoints(
        env,
        `SELECT strftime('%Y-%m-%d', ts) AS t, COUNT(*) AS v
         FROM ai_usage
         WHERE ts >= datetime('now', ?)
         GROUP BY t ORDER BY t`,
        [since],
      );
      break;
    default:
      points = [];
  }

  return jsonResponse({ metric, points }, 200, env);
}

// ---------------------------------------------------------------------------
// 4. Feature flags read
// ---------------------------------------------------------------------------
export async function getFlags(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;

  const read = async (key: string) => {
    try {
      return await env.RATE_LIMIT.get(key);
    } catch {
      return null;
    }
  };

  const [maintenance, signups, uploads, aiChat] = await Promise.all([
    read('site:maintenance'),
    read('flag:signups'),
    read('flag:uploads'),
    read('flag:ai_chat'),
  ]);

  return jsonResponse(
    {
      // maintenance missing = off
      maintenance: maintenance === 'on',
      // feature flags missing = enabled; 'off' = disabled
      signups: signups !== 'off',
      uploads: uploads !== 'off',
      ai_chat: aiChat !== 'off',
    },
    200,
    env,
  );
}

// ---------------------------------------------------------------------------
// 5. Maintenance toggle
// ---------------------------------------------------------------------------
export async function setMaintenance(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;

  let on: boolean;
  try {
    const body = (await request.json()) as { on?: boolean };
    on = !!body.on;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, env);
  }

  try {
    if (on) {
      await env.RATE_LIMIT.put('site:maintenance', 'on');
    } else {
      await env.RATE_LIMIT.delete('site:maintenance');
    }
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Failed to update maintenance' }, 500, env);
  }

  await logAdminActivity(
    env,
    auth.id,
    auth.email,
    'ops.maintenance',
    'site',
    auth.id,
    `maintenance ${on ? 'enabled' : 'disabled'}`,
  );

  return jsonResponse({ success: true, maintenance: on }, 200, env);
}

// ---------------------------------------------------------------------------
// 6. Feature flag toggle
// ---------------------------------------------------------------------------
const ALLOWED_FLAGS = ['signups', 'uploads', 'ai_chat'];

export async function setFlag(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;

  let flag: string;
  let enabled: boolean;
  try {
    const body = (await request.json()) as { flag?: string; enabled?: boolean };
    flag = String(body.flag || '');
    enabled = !!body.enabled;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, env);
  }

  if (!ALLOWED_FLAGS.includes(flag)) {
    return jsonResponse({ error: 'Unknown flag' }, 400, env);
  }

  const key = `flag:${flag}`;
  try {
    if (enabled) {
      await env.RATE_LIMIT.delete(key);
    } else {
      await env.RATE_LIMIT.put(key, 'off');
    }
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Failed to update flag' }, 500, env);
  }

  await logAdminActivity(
    env,
    auth.id,
    auth.email,
    'ops.flag',
    'flag',
    auth.id,
    `${flag} ${enabled ? 'enabled' : 'disabled'}`,
  );

  return jsonResponse({ success: true, flag, enabled }, 200, env);
}

// ---------------------------------------------------------------------------
// 7. Recompute maintenance tasks
// ---------------------------------------------------------------------------
export async function recompute(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;

  let target: string;
  try {
    const body = (await request.json()) as { target?: string };
    target = String(body.target || '');
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, env);
  }

  try {
    switch (target) {
      case 'subjects_note_count':
        await env.DB.prepare(
          `UPDATE subjects
           SET note_count = (
             SELECT COUNT(*) FROM notes
             WHERE notes.subject_id = subjects.id AND notes.deleted_at IS NULL
           )`,
        ).run();
        break;
      case 'user_notes_uploaded':
        await env.DB.prepare(
          `UPDATE users
           SET notes_uploaded = (
             SELECT COUNT(*) FROM notes
             WHERE notes.author_id = users.id AND notes.deleted_at IS NULL
           )`,
        ).run();
        break;
      case 'usage_snapshot': {
        // usage_stats table is not part of the current schema — skip gracefully.
        const hasTable = await safeScalar<number>(
          env,
          `SELECT COUNT(*) AS v FROM sqlite_master WHERE type='table' AND name='usage_stats'`,
        );
        if (!hasTable) {
          return jsonResponse(
            { success: true, target, skipped: true, reason: 'usage_stats table not present' },
            200,
            env,
          );
        }
        await env.DB.prepare(
          `INSERT INTO usage_stats (date, total_users, total_notes)
           VALUES (
             date('now'),
             (SELECT COUNT(*) FROM users),
             (SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL)
           )`,
        ).run();
        break;
      }
      default:
        return jsonResponse({ error: 'Unknown recompute target' }, 400, env);
    }
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Recompute failed' }, 500, env);
  }

  await logAdminActivity(env, auth.id, auth.email, 'ops.recompute', 'maintenance', auth.id, target);

  return jsonResponse({ success: true, target }, 200, env);
}

// ---------------------------------------------------------------------------
// 8. Export activity log CSV
// ---------------------------------------------------------------------------
function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportActivityLog(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;

  let rows: any[];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, admin_id, admin_email, action_type, target_type, target_id, details, created_at
       FROM admin_activity_log
       ORDER BY created_at DESC
       LIMIT 1000`,
    ).all();
    rows = results || [];
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Failed to export log' }, 500, env);
  }

  const header = [
    'id',
    'admin_id',
    'admin_email',
    'action_type',
    'target_type',
    'target_id',
    'details',
    'created_at',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.admin_id,
        r.admin_email,
        r.action_type,
        r.target_type,
        r.target_id,
        r.details,
        r.created_at,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  const csv = lines.join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="admin-activity-log.csv"',
    },
  });
}

// ---------------------------------------------------------------------------
// 9. Danger zone (SUPER-only)
// ---------------------------------------------------------------------------
export async function purgeDeletedNotes(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;
  if (!isSuper(auth)) return jsonResponse({ error: 'Forbidden' }, 403, env);

  let olderThanDays = 30;
  try {
    const body = (await request.json()) as { olderThanDays?: number };
    if (body.olderThanDays != null && Number.isFinite(Number(body.olderThanDays))) {
      olderThanDays = Math.max(0, Number(body.olderThanDays));
    }
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, env);
  }

  let deleted: number;
  try {
    const result = await env.DB.prepare(
      `DELETE FROM notes
       WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)`,
    )
      .bind(`-${olderThanDays} days`)
      .run();
    deleted = (result as any)?.meta?.changes ?? 0;
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Purge failed' }, 500, env);
  }

  await logAdminActivity(
    env,
    auth.id,
    auth.email,
    'ops.purge_notes',
    'notes',
    auth.id,
    `purged ${deleted} notes older than ${olderThanDays}d`,
  );

  return jsonResponse({ success: true, deleted }, 200, env);
}

export async function revokeAllTokens(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;
  if (!isSuper(auth)) return jsonResponse({ error: 'Forbidden' }, 403, env);

  try {
    await env.DB.prepare(`DELETE FROM refresh_tokens`).run();
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Revoke failed' }, 500, env);
  }

  await logAdminActivity(
    env,
    auth.id,
    auth.email,
    'ops.revoke_tokens',
    'auth',
    auth.id,
    'revoked all refresh tokens',
  );

  return jsonResponse({ success: true }, 200, env);
}

// ---------------------------------------------------------------------------
// 10. Tier-C Cloudflare platform metrics (GraphQL Analytics API)
// ---------------------------------------------------------------------------
// The Worker's own script name (wrangler.toml `name`). Used to scope the
// workersInvocationsAdaptive query to this Worker only.
const CF_SCRIPT_NAME = 'notarium-backend';

// GraphQL: Workers invocations by hour + D1 usage groups by day. Field names
// verified against the current Cloudflare Analytics GraphQL schema; a slightly
// wrong field name surfaces as a visible message via the defensive handling
// below rather than crashing the endpoint.
const CF_OPS_QUERY = `query Ops($accountTag: String!, $start: Time!, $end: Time!, $startDate: Date!, $endDate: Date!, $script: String!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 10000
        filter: { datetime_geq: $start, datetime_leq: $end, scriptName: $script }
        orderBy: [datetimeHour_ASC]
      ) {
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { datetimeHour }
      }
      d1AnalyticsAdaptiveGroups(
        limit: 10000
        filter: { date_geq: $startDate, date_leq: $endDate }
        orderBy: [date_ASC]
      ) {
        sum { readQueries writeQueries rowsRead rowsWritten }
        dimensions { date }
      }
    }
  }
}`;

export async function getCloudflareMetrics(request: Request, env: Env): Promise<Response> {
  const auth = await requireTechnical(request, env);
  if (auth instanceof Response) return auth;

  // Not configured is a first-class, non-error state: the dashboard shows a hint.
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return jsonResponse({ configured: false }, 200, env);
  }

  const url = new URL(request.url);
  const rangeRaw = parseInt(url.searchParams.get('range') || '7', 10);
  const range = Number.isFinite(rangeRaw) && rangeRaw > 0 ? Math.min(rangeRaw, 90) : 7;

  const endMs = Date.now();
  const startMs = endMs - range * 24 * 60 * 60 * 1000;
  const end = new Date(endMs).toISOString();
  const start = new Date(startMs).toISOString();
  const endDate = end.slice(0, 10); // YYYY-MM-DD
  const startDate = start.slice(0, 10);

  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: CF_OPS_QUERY,
        variables: {
          accountTag: env.CF_ACCOUNT_ID,
          start,
          end,
          startDate,
          endDate,
          script: CF_SCRIPT_NAME,
        },
      }),
    });

    if (!res.ok) {
      return jsonResponse(
        { configured: true, ok: false, error: `Cloudflare API ${res.status} ${res.statusText}` },
        200,
        env,
      );
    }

    const body = (await res.json()) as {
      data?: { viewer?: { accounts?: any[] } };
      errors?: Array<{ message?: string }> | null;
    };

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      const first = body.errors[0]?.message || 'Cloudflare GraphQL error';
      return jsonResponse({ configured: true, ok: false, error: first }, 200, env);
    }

    // Account may be missing (bad account tag / no access) — degrade to empty.
    const account = body.data?.viewer?.accounts?.[0];
    const workerRows: any[] = account?.workersInvocationsAdaptive || [];
    const d1Rows: any[] = account?.d1AnalyticsAdaptiveGroups || [];

    const workerPoints = workerRows.map((r: any) => ({
      t: String(r?.dimensions?.datetimeHour ?? ''),
      requests: Number(r?.sum?.requests) || 0,
      errors: Number(r?.sum?.errors) || 0,
      subrequests: Number(r?.sum?.subrequests) || 0,
      cpuP50: Number(r?.quantiles?.cpuTimeP50) || 0,
      cpuP99: Number(r?.quantiles?.cpuTimeP99) || 0,
    }));

    const d1Points = d1Rows.map((r: any) => ({
      t: String(r?.dimensions?.date ?? ''),
      rowsRead: Number(r?.sum?.rowsRead) || 0,
      rowsWritten: Number(r?.sum?.rowsWritten) || 0,
      readQueries: Number(r?.sum?.readQueries) || 0,
      writeQueries: Number(r?.sum?.writeQueries) || 0,
    }));

    const workerTotals = workerPoints.reduce(
      (acc, p) => ({
        requests: acc.requests + p.requests,
        errors: acc.errors + p.errors,
        subrequests: acc.subrequests + p.subrequests,
      }),
      { requests: 0, errors: 0, subrequests: 0 },
    );

    const d1Totals = d1Points.reduce(
      (acc, p) => ({
        rowsRead: acc.rowsRead + p.rowsRead,
        rowsWritten: acc.rowsWritten + p.rowsWritten,
        readQueries: acc.readQueries + p.readQueries,
        writeQueries: acc.writeQueries + p.writeQueries,
      }),
      { rowsRead: 0, rowsWritten: 0, readQueries: 0, writeQueries: 0 },
    );

    return jsonResponse(
      {
        configured: true,
        ok: true,
        workers: { points: workerPoints, totals: workerTotals },
        d1: { points: d1Points, totals: d1Totals },
      },
      200,
      env,
    );
  } catch (error: any) {
    // Never throw / 500 — a network or parse failure shows up as a UI message.
    return jsonResponse(
      { configured: true, ok: false, error: error?.message || 'Cloudflare request failed' },
      200,
      env,
    );
  }
}
