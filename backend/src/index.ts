import type { Env } from './lib/env';
import { getAllowedOrigin, jsonResponse } from './lib/response';
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  requireAdmin,
  timingSafeEqualStr,
} from './lib/auth';
import { checkRateLimit } from './lib/ratelimit';
import { initializeDatabase, MOCK_SUBJECTS, SCHEMA_VERSION } from './lib/db';
import { handleOAuthRoutes } from './routes/oauth';

import {
  generateNoteSummary,
  performOCREndpoint,
  generateNoteSummaryEndpoint,
  generateQuizEndpoint,
  generateStudyPlanEndpoint,
  explainConceptEndpoint,
} from './routes/ai';
import { updateUserInfo, getCurrentUser, updateUserClass } from './routes/users';
import {
  getSubjects,
  getPublicGradeClasses,
  adminGetGradeClasses,
  adminCreateGradeClass,
  adminUpdateGradeClass,
  adminDeleteGradeClass,
  adminReassignUserClass,
  adminPromoteClasses,
} from './routes/subjects';
import {
  getNotesBySubject,
  searchNotes,
  createNote,
  updateNoteSummary,
  toggleNoteLike,
  userUpdateNote,
  getMyNotes,
  publishDraftNote,
  userDeleteNote,
} from './routes/notes';
import { getLeaderboard } from './routes/leaderboard';
import {
  createChatSession,
  getChatSessions,
  getChatMessages,
  addChatMessage,
  getAIResponse,
} from './routes/chat';
import { signupEndpoint, loginEndpoint, meEndpoint } from './routes/auth';
import {
  setup2fa,
  enable2fa,
  disable2fa,
  verify2fa,
  forgotPassword,
  setPassword,
} from './routes/twofa';
import {
  logAdminActivity,
  getAdminActivityLogs,
  getUsageStatistics,
  verifyAdmin,
  adminUpvoteNote,
  adminLikeNote,
  deleteNote,
  updateNote,
  suspendUser,
  warnUser,
  removeUser,
  unsuspendUser,
  getAllUsers,
  getAllNotes,
  updateUserProfile,
  restoreNote,
  featureNote,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
} from './routes/admin';
import {
  adminCreateNotification,
  adminGetNotifications,
  adminDeleteNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './routes/notifications';
import {
  logQuizAttempt,
  getDueReviews,
  gradeReview,
  gradeRecall,
  getStudyStats,
} from './routes/study';
import {
  healthCheck,
  getOpsMetrics,
  getOpsTimeseries,
  getFlags,
  setMaintenance,
  setFlag,
  recompute,
  exportActivityLog,
  purgeDeletedNotes,
  revokeAllTokens,
  getCloudflareMetrics,
} from './routes/ops';

let dbInitialized = false;

// Endpoints that call paid third-party AI APIs must be authenticated, otherwise
// anyone can drain the API budget (Workers autoscale — there is no natural ceiling).
// ponytail: one guard reused by the AI routes.
async function requireUser(request: Request, env: Env) {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const decoded = token ? await verifyToken(token, env) : null;
  return decoded?.id ? decoded : null;
}

// Best-effort request-metrics recorder. Sampled: always record errors (>=400),
// and ~1 in 5 successful (2xx) requests. Never throws. Uses ctx.waitUntil so it
// does not block the response.
function recordMetric(
  env: Env,
  ctx: ExecutionContext | undefined,
  path: string,
  method: string,
  status: number,
  ms: number,
): void {
  try {
    if (!env.DB) return;
    const isError = status >= 400;
    const sample = isError || Date.now() % 5 === 0;
    if (!sample) return;
    const task = env.DB.prepare(
      `INSERT INTO request_metrics (path, method, status, duration_ms) VALUES (?, ?, ?, ?)`,
    )
      .bind(path, method, status, ms)
      .run()
      .catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(task);
    }
  } catch {
    // non-fatal
  }
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const requestOrigin = request.headers.get('Origin');
    const corsOrigin = getAllowedOrigin(env, requestOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
          'Access-Control-Allow-Headers':
            'Content-Type, Authorization, X-Encrypted-Yw-ID, X-Is-Login',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const started = Date.now();

    // Maintenance middleware: cheap single KV read. When maintenance is on,
    // allow a small allowlist + all ops routes through; otherwise only admins
    // bypass, everyone else gets a 503.
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/api/')) {
      let maintenanceOn = false;
      try {
        maintenanceOn = (await env.RATE_LIMIT.get('site:maintenance')) === 'on';
      } catch {
        // KV unavailable — leave maintenanceOn = false (fail open)
      }
      if (maintenanceOn) {
        const allowlisted =
          path === '/api/health' ||
          path === '/api/auth/admin-login' ||
          path === '/api/auth/login' ||
          path === '/api/auth/me' ||
          path.startsWith('/api/ops/');
        if (!allowlisted) {
          let isAdmin = false;
          try {
            const auth = request.headers.get('Authorization');
            const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
            if (token) {
              const decoded = await verifyToken(token, env);
              isAdmin = decoded?.role === 'admin';
            }
          } catch {
            isAdmin = false;
          }
          if (!isAdmin) {
            const blocked = jsonResponse(
              { error: 'Service temporarily unavailable for maintenance', maintenance: true },
              503,
              env,
            );
            const bh = new Headers(blocked.headers);
            bh.set('Access-Control-Allow-Origin', corsOrigin);
            bh.set('Access-Control-Allow-Credentials', 'true');
            return new Response(blocked.body, { status: 503, headers: bh });
          }
        }
      }
    }

    const response = await this._handle(request, env, ctx);

    if (path.startsWith('/api/')) {
      recordMetric(env, ctx, path, request.method, response.status, Date.now() - started);
    }

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', corsOrigin);
    newHeaders.set('Access-Control-Allow-Credentials', 'true');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },

  async _handle(request: Request, env: Env, _ctx?: ExecutionContext): Promise<Response> {
    // Schema init is gated so the ~60 DDL statements run at most once per
    // schema version across ALL isolates — not on every cold isolate's first
    // request (which was a thundering herd under load, and re-ran a destructive
    // DELETE on subjects each time). `dbInitialized` skips warm isolates for
    // free; the KV flag makes "already initialized" a global fact.
    if (env.DB && !dbInitialized) {
      dbInitialized = true; // set first: concurrent requests in this isolate skip
      try {
        const flag = `schema:init:v${SCHEMA_VERSION}`;
        const alreadyDone = await env.RATE_LIMIT.get(flag).catch(() => null);
        if (!alreadyDone) {
          await initializeDatabase(env);
          await env.RATE_LIMIT.put(flag, new Date().toISOString()).catch(() => {});
        }
      } catch (error) {
        // Non-fatal: schema is idempotent and almost certainly already present.
      }
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/test') {
      return jsonResponse({ message: 'Worker is running', timestamp: new Date().toISOString() });
    }

    try {
      if (path === '/api/auth/signup' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        return await signupEndpoint(request, env);
      }

      if (path === '/api/auth/login' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        return await loginEndpoint(request, env);
      }

      if (path === '/api/auth/me' && request.method === 'GET') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        return await meEndpoint(request, env);
      }

      if (path === '/api/auth/2fa/setup' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await setup2fa(request, env);
      }
      if (path === '/api/auth/2fa/enable' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await enable2fa(request, env);
      }
      if (path === '/api/auth/2fa/disable' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await disable2fa(request, env);
      }
      if (path === '/api/auth/2fa/verify' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await verify2fa(request, env);
      }
      if (path === '/api/auth/forgot-password' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await forgotPassword(request, env);
      }
      if (path === '/api/auth/set-password' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await setPassword(request, env);
      }

      if (path === '/api/auth/admin-login' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        try {
          const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
          const allowed = await checkRateLimit(ip, 'admin-login', env);
          if (!allowed) {
            return jsonResponse({ error: 'Too many login attempts. Try again later.' }, 429, env);
          }

          const body = (await request.json()) as any;
          const { token: adminToken } = body;

          // Match the supplied token against each configured admin credential.
          // The sub-role is inferred from which password matched (the `as` hint
          // in the body, if any, is not used for matching).
          let account: { sub: string; email: string; display: string } | null = null;
          const tokenStr = String(adminToken || '');
          if (tokenStr && (await timingSafeEqualStr(env.ADMIN_PASSWORD, tokenStr))) {
            account = { sub: 'super', email: 'admin@notarium.internal', display: 'Admin' };
          } else if (
            env.MODERATOR_PASSWORD &&
            (await timingSafeEqualStr(env.MODERATOR_PASSWORD, tokenStr))
          ) {
            account = {
              sub: 'moderator',
              email: 'moderator@notarium.internal',
              display: 'Moderator',
            };
          } else if (env.TECH_PASSWORD && (await timingSafeEqualStr(env.TECH_PASSWORD, tokenStr))) {
            account = {
              sub: 'technical',
              email: 'tech@notarium.internal',
              display: 'Technical Admin',
            };
          }

          if (!account) {
            return jsonResponse({ error: 'Invalid admin token' }, 401, env);
          }

          const adminEmail = account.email;
          let admin = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`)
            .bind(adminEmail)
            .first();

          if (!admin) {
            const result = await env.DB.prepare(
              `
              INSERT INTO users (encrypted_yw_id, display_name, email, password_hash, class, role, created_at)
              VALUES (?, ?, ?, ?, '10.1', 'admin', datetime('now'))
              RETURNING id, email, display_name, class, role
            `,
            )
              .bind('admin_' + account.sub, account.display, adminEmail, '')
              .first();
            admin = result;
          }

          // Ensure the row carries the correct sub-role (also fixes pre-existing rows).
          await env.DB.prepare(`UPDATE users SET admin_role = ? WHERE id = ?`)
            .bind(account.sub, (admin as any).id)
            .run();

          const token = await createToken(
            {
              id: (admin as any).id,
              email: (admin as any).email,
              role: 'admin',
              admin_role: account.sub,
            },
            env,
          );

          await logAdminActivity(
            env,
            (admin as any).id,
            adminEmail,
            'login',
            'auth',
            (admin as any).id,
            'admin login',
          );

          return jsonResponse(
            {
              token,
              user: {
                id: (admin as any).id,
                email: (admin as any).email,
                name: (admin as any).display_name,
                role: 'admin',
                admin_role: account.sub,
              },
            },
            200,
            env,
          );
        } catch (error: any) {
          console.error('admin-login error:', error);
          return jsonResponse({ error: 'Internal server error' }, 500);
        }
      }
      if (path === '/api/debug/ping' && request.method === 'POST') {
        return jsonResponse({ ok: true, message: 'Pong!' });
      }

      if (path === '/api/auth/profile' && request.method === 'PUT') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        try {
          const auth = request.headers.get('Authorization');
          const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

          if (!token) {
            return jsonResponse({ error: 'Unauthorized - No token provided' }, 401);
          }

          const decoded = await verifyToken(token, env);
          if (!decoded || !decoded.id) {
            return jsonResponse({ error: 'Invalid or expired token' }, 401);
          }

          const userId = decoded.id;
          let body;
          try {
            body = (await request.json()) as any;
          } catch (bodyError) {
            return jsonResponse({ error: 'Invalid request body' }, 400);
          }

          const updates: string[] = [];
          const values: any[] = [];
          if (body.name) {
            updates.push('display_name = ?');
            values.push(body.name);
          }
          if (body.display_name) {
            updates.push('display_name = ?');
            values.push(body.display_name);
          }
          if (body.photo_url) {
            updates.push('photo_url = ?');
            values.push(body.photo_url);
          }
          if (body.email) {
            updates.push('email = ?');
            values.push(body.email);
          }
          if (body.class) {
            updates.push('class = ?');
            values.push(body.class);
          }
          if (body.description !== undefined) {
            updates.push('description = ?');
            values.push(body.description || null);
          }

          updates.push('updated_at = ?');
          values.push(new Date().toISOString());

          if (updates.length === 1) {
            return jsonResponse({ success: true, updated: false });
          }

          try {
            values.push(userId);
            const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

            await env.DB.prepare(sql)
              .bind(...values)
              .run();

            const updated = (await env.DB.prepare(
              `
              SELECT id, display_name, photo_url, email, class, description FROM users WHERE id = ?
            `,
            )
              .bind(userId)
              .first()) as any;

            return jsonResponse({ success: true, updated: true, user: updated });
          } catch (dbError: any) {
            console.error('profile update error:', dbError);
            return jsonResponse({ error: 'Failed to update profile' }, 500);
          }
        } catch (error: any) {
          console.error('profile route error:', error);
          return jsonResponse({ error: 'Internal server error' }, 500);
        }
      }

      if (path === '/api/admin/migrate-passwords' && request.method === 'POST') {
        try {
          const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
          if (!(await checkRateLimit(ip, 'admin-migrate', env))) {
            return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, env);
          }
          // Authenticated by admin JWT. The legacy body-password gate is
          // redundant now that a valid admin token is required, so it's removed.
          const adminCheck = await requireAdmin(request, env);
          if (adminCheck instanceof Response) return adminCheck;

          const body = (await request.json()) as any;
          const { batchSize = 5, offset = 0 } = body;

          const users = await env.DB.prepare(
            `
            SELECT id, password_hash FROM users
            WHERE password_hash NOT LIKE '$2%' AND password_hash IS NOT NULL
            LIMIT ? OFFSET ?
          `,
          )
            .bind(batchSize, offset)
            .all();

          let migrated = 0;
          let errors = 0;

          for (const user of users.results) {
            const userId = (user as any).id;
            const plainPassword = (user as any).password_hash;

            try {
              const hashed = await hashPassword(plainPassword);
              await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                .bind(hashed, userId)
                .run();
              migrated++;
            } catch (error) {
              errors++;
            }
          }

          const remaining = await env.DB.prepare(
            `
            SELECT COUNT(*) as count FROM users
            WHERE password_hash NOT LIKE '$2%' AND password_hash IS NOT NULL
          `,
          ).first();

          return jsonResponse(
            {
              success: true,
              migrated,
              errors,
              remaining: (remaining as any)?.count || 0,
              nextOffset: offset + batchSize,
              done: (remaining as any)?.count === 0,
            },
            200,
            env,
          );
        } catch (error: any) {
          console.error('migrate-passwords error:', error);
          return jsonResponse({ error: 'Migration failed' }, 500, env);
        }
      }

      if (path === '/api/auth/admin-reset-password' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        try {
          const adminCheck = await requireAdmin(request, env);
          if (adminCheck instanceof Response) return adminCheck;

          const body = (await request.json()) as any;
          const { email, newPassword } = body;

          if (!email || !newPassword) {
            return jsonResponse({ error: 'Email and new password are required' }, 400);
          }

          const user = (await env.DB.prepare(
            `
            SELECT id, email FROM users WHERE email = ?
          `,
          )
            .bind(email)
            .first()) as any;

          if (!user) {
            return jsonResponse({ error: 'User not found' }, 404);
          }

          const hashedPassword = await hashPassword(newPassword);

          await env.DB.prepare(
            `
            UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
          `,
          )
            .bind(hashedPassword, user.id)
            .run();

          return jsonResponse({ success: true, message: 'Password reset successfully' }, 200, env);
        } catch (error: any) {
          return jsonResponse({ error: error.message || 'Failed to reset password' }, 500);
        }
      }

      if (path === '/api/auth/change-password' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        try {
          const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
          if (!(await checkRateLimit(ip, 'change-password', env))) {
            return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, env);
          }
          const auth = request.headers.get('Authorization');
          const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

          if (!token) {
            return jsonResponse({ error: 'Unauthorized - No token provided' }, 401, env);
          }

          const decoded = await verifyToken(token, env);
          if (!decoded || !decoded.id) {
            return jsonResponse({ error: 'Invalid or expired token' }, 401, env);
          }

          const userId = decoded.id;

          const body = (await request.json()) as any;
          const { currentPassword, newPassword } = body;

          if (!currentPassword || !newPassword) {
            return jsonResponse({ error: 'Current password and new password are required' }, 400);
          }

          const user = (await env.DB.prepare(
            `
            SELECT id, email, password_hash FROM users WHERE id = ?
          `,
          )
            .bind(userId)
            .first()) as any;

          if (!user) {
            return jsonResponse({ error: 'User not found' }, 404);
          }

          const isPasswordValid = await verifyPassword(currentPassword, user.password_hash);
          if (!isPasswordValid) {
            return jsonResponse({ error: 'Current password is incorrect' }, 401, env);
          }

          const hashedNewPassword = await hashPassword(newPassword);

          await env.DB.prepare(
            `
            UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
          `,
          )
            .bind(hashedNewPassword, userId)
            .run();

          return jsonResponse(
            { success: true, message: 'Password changed successfully' },
            200,
            env,
          );
        } catch (error: any) {
          console.error('change-password error:', error);
          return jsonResponse({ error: 'Failed to change password' }, 500);
        }
      }
      if (env.DB && path === '/api/user/update' && request.method === 'POST') {
        return await updateUserInfo(request, env);
      }

      if (env.DB && path === '/api/user/me' && request.method === 'GET') {
        return await getCurrentUser(request, env);
      }

      if (env.DB && path === '/api/user/class' && request.method === 'PUT') {
        return await updateUserClass(request, env);
      }

      if (path === '/api/admin/emergency-password-fix' && request.method === 'POST') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database not available' }, 503);
        }
        try {
          const adminCheck = await requireAdmin(request, env);
          if (adminCheck instanceof Response) return adminCheck;
          const decoded = adminCheck;

          const body = (await request.json()) as any;
          const { email, newPassword } = body;

          if (!email || !newPassword) {
            return jsonResponse({ error: 'Email and new password are required' }, 400);
          }

          const user = (await env.DB.prepare(
            `
            SELECT id, email, display_name FROM users WHERE email = ?
          `,
          )
            .bind(email)
            .first()) as any;

          if (!user) {
            return jsonResponse({ error: 'User not found' }, 404);
          }

          const hashedPassword = await hashPassword(newPassword);
          await env.DB.prepare(
            `
            UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
          `,
          )
            .bind(hashedPassword, user.id)
            .run();

          return jsonResponse({
            success: true,
            message: 'Password reset successfully',
            user: {
              id: user.id,
              email: user.email,
              display_name: user.display_name,
            },
          });
        } catch (error: any) {
          return jsonResponse({ error: error.message || 'Failed to reset password' }, 500);
        }
      }
      if (path === '/api/subjects' && request.method === 'GET') {
        if (!env.DB) {
          return jsonResponse({ subjects: MOCK_SUBJECTS });
        }
        return await getSubjects(request, env);
      }
      if (path.startsWith('/api/notes/subject/')) {
        const subjectId = path.split('/').pop();
        return await getNotesBySubject(subjectId!, request, env);
      }

      if (path === '/api/notes/search' && request.method === 'GET') {
        const query = url.searchParams.get('q') || '';
        return await searchNotes(query, request, env);
      }

      if (path === '/api/notes' && request.method === 'POST') {
        return await createNote(request, env);
      }

      if (path.match(/^\/api\/notes\/\d+$/) && request.method === 'PUT') {
        const noteId = path.split('/')[3];
        return await userUpdateNote(noteId, request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/summary$/) && request.method === 'PUT') {
        const noteId = path.split('/')[3];
        return await updateNoteSummary(noteId, request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/like$/) && request.method === 'POST') {
        const noteId = path.split('/')[3];
        return await toggleNoteLike(noteId, request, env);
      }
      if (path === '/api/notes/my-notes' && request.method === 'GET') {
        return await getMyNotes(request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/publish$/) && request.method === 'POST') {
        const noteId = path.split('/')[3];
        return await publishDraftNote(noteId, request, env);
      }

      if (path.match(/^\/api\/notes\/\d+$/) && request.method === 'DELETE') {
        const noteId = path.split('/')[3];
        return await userDeleteNote(noteId, request, env);
      }

      if (path === '/api/leaderboard' && request.method === 'GET') {
        return await getLeaderboard(env);
      }
      if (path === '/api/chat/sessions' && request.method === 'POST') {
        return await createChatSession(request, env);
      }

      if (path === '/api/chat/sessions' && request.method === 'GET') {
        return await getChatSessions(request, env);
      }

      if (path.match(/^\/api\/chat\/sessions\/\d+\/messages$/) && request.method === 'GET') {
        const sessionId = path.split('/')[4];
        return await getChatMessages(sessionId, request, env);
      }

      if (path.match(/^\/api\/chat\/sessions\/\d+\/messages$/) && request.method === 'POST') {
        const sessionId = path.split('/')[4];
        return await addChatMessage(sessionId, request, env);
      }

      if (path.match(/^\/api\/chat\/sessions\/\d+\/ai-response$/) && request.method === 'POST') {
        const sessionId = path.split('/')[4];
        if (!env.DB) {
          const body = (await request.json()) as any;
          const mockResponse = `That's a great question about ${body.message?.substring(0, 20) || 'this topic'}. Let me explain: This is an important concept in education. Understanding this will help you succeed in your studies. Feel free to ask follow-up questions!`;
          return jsonResponse({ response: mockResponse });
        }
        return await getAIResponse(sessionId, request, env);
      }
      if (path === '/api/gemini/quick-summary' && request.method === 'POST') {
        const _qsUser = await requireUser(request, env);
        if (!_qsUser) return jsonResponse({ error: 'Unauthorized' }, 401, env);
        if (!(await checkRateLimit(String(_qsUser.id), 'ai', env))) {
          return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, env);
        }
        if (!env.GEMINI_API_KEY) {
          const body = (await request.json()) as any;
          const summary = `${body.title || 'Study material'}: ${body.content?.substring(0, 80) || 'No content available'}...`;
          return jsonResponse({ success: true, summary });
        }

        try {
          const body = (await request.json()) as any;
          const { title, content } = body;

          if (!content) {
            return jsonResponse({ error: 'Content is required' }, 400);
          }

          const summary = await generateNoteSummary(content, title || 'Untitled', env);
          return jsonResponse({ success: true, summary });
        } catch (error: any) {
          console.error('quick-summary error:', error);
          return jsonResponse({ error: 'Failed to generate summary' }, 500);
        }
      }

      if (path === '/api/gemini/auto-tags' && request.method === 'POST') {
        const _atUser = await requireUser(request, env);
        if (!_atUser) return jsonResponse({ error: 'Unauthorized' }, 401, env);
        if (!(await checkRateLimit(String(_atUser.id), 'ai', env))) {
          return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, env);
        }
        try {
          const body = (await request.json()) as any;
          const { title, content } = body;

          const deepseekApiKey = env.DEEPSEEK_API_KEY;
          if (!deepseekApiKey) {
            return jsonResponse({ success: true, tags: ['study', 'notes', 'learning'] });
          }

          const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${deepseekApiKey}`,
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [
                {
                  role: 'user',
                  content: `Generate 3-5 relevant study tags for this note. Return ONLY the tags as a comma-separated list, nothing else. Write the tags in Indonesian (Bahasa Indonesia).

Title: ${title || 'Untitled'}
Content: ${content?.substring(0, 500) || 'No content'}

Tags:`,
                },
              ],
              max_tokens: 50,
              temperature: 0.4,
            }),
          });

          const data = (await response.json()) as any;

          if (!response.ok || !data.choices || data.choices.length === 0) {
            throw new Error('DeepSeek API error');
          }

          const tagsText = data.choices[0].message.content.trim();
          const tags = tagsText
            .split(',')
            .map((t: string) => t.trim())
            .filter((t: string) => t && t.length > 0)
            .slice(0, 5);

          return jsonResponse({ success: true, tags: tags.length > 0 ? tags : ['study', 'notes'] });
        } catch (error: any) {
          return jsonResponse({ success: true, tags: ['study', 'notes', 'learning'] });
        }
      }

      if (path === '/api/gemini/summarize' && request.method === 'POST') {
        const _sumUser = await requireUser(request, env);
        if (!_sumUser) return jsonResponse({ error: 'Unauthorized' }, 401, env);
        if (!(await checkRateLimit(String(_sumUser.id), 'ai', env))) {
          return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, env);
        }
        if (!env.GEMINI_API_KEY) {
          const body = (await request.json()) as any;
          const summary = `${body.title || 'Topic'}: ${body.description || 'This covers key concepts'}.`;
          return jsonResponse({ success: true, summary });
        }

        try {
          const body = (await request.json()) as any;
          const summary = await generateNoteSummary(
            body.content || body.description,
            body.title || 'Untitled',
            env,
          );
          return jsonResponse({ success: true, summary });
        } catch (error: any) {
          console.error('summarize error:', error);
          return jsonResponse({ error: 'Failed to generate summary' }, 500);
        }
      }

      if (path === '/api/gemini/ocr' && request.method === 'POST') {
        const _ocrUser = await requireUser(request, env);
        if (!_ocrUser) return jsonResponse({ error: 'Unauthorized' }, 401, env);
        if (!(await checkRateLimit(String(_ocrUser.id), 'ai', env))) {
          return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, env);
        }
        return await performOCREndpoint(request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/summary$/) && request.method === 'POST') {
        const noteId = path.split('/')[3];
        return await generateNoteSummaryEndpoint(noteId, request, env);
      }

      if (path.match(/^\/api\/notes\/\d+\/quiz$/) && request.method === 'POST') {
        const noteId = path.split('/')[3];
        return await generateQuizEndpoint(noteId, request, env);
      }

      if (path === '/api/study-plan' && request.method === 'POST') {
        const _spUser = await requireUser(request, env);
        if (!_spUser) return jsonResponse({ error: 'Unauthorized' }, 401, env);
        if (!(await checkRateLimit(String(_spUser.id), 'ai', env))) {
          return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, env);
        }
        return await generateStudyPlanEndpoint(request, env);
      }

      if (path === '/api/concept-explain' && request.method === 'POST') {
        const _ceUser = await requireUser(request, env);
        if (!_ceUser) return jsonResponse({ error: 'Unauthorized' }, 401, env);
        if (!(await checkRateLimit(String(_ceUser.id), 'ai', env))) {
          return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, env);
        }
        return await explainConceptEndpoint(request, env);
      }
      if (path === '/api/admin/verify' && request.method === 'POST') {
        return await verifyAdmin(request, env);
      }

      if (path.match(/^\/api\/admin\/upvote\/\d+$/) && request.method === 'POST') {
        const noteId = path.split('/')[4];
        return await adminUpvoteNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/notes\/\d+\/like$/) && request.method === 'POST') {
        const noteId = path.split('/')[4];
        return await adminLikeNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/notes\/\d+$/) && request.method === 'DELETE') {
        const noteId = path.split('/')[4];
        return await deleteNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/notes\/\d+$/) && request.method === 'PUT') {
        const noteId = path.split('/')[4];
        return await updateNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/suspend\/\d+$/) && request.method === 'POST') {
        const userId = path.split('/')[4];
        return await suspendUser(userId, request, env);
      }

      if (path.match(/^\/api\/admin\/warn\/\d+$/) && request.method === 'POST') {
        const userId = path.split('/')[4];
        return await warnUser(userId, request, env);
      }

      if (path.match(/^\/api\/admin\/unsuspend\/\d+$/) && request.method === 'POST') {
        const userId = path.split('/')[4];
        return await unsuspendUser(userId, request, env);
      }

      if (path.match(/^\/api\/admin\/user\/\d+$/) && request.method === 'DELETE') {
        const userId = path.split('/')[4];
        return await removeUser(userId, request, env);
      }

      if (path.match(/^\/api\/admin\/user\/\d+$/) && request.method === 'PUT') {
        const userId = path.split('/')[4];
        return await updateUserProfile(userId, request, env);
      }

      if (path.match(/^\/api\/admin\/notes\/\d+\/restore$/) && request.method === 'POST') {
        const noteId = path.split('/')[4];
        return await restoreNote(noteId, request, env);
      }

      if (path.match(/^\/api\/admin\/notes\/\d+\/feature$/) && request.method === 'POST') {
        const noteId = path.split('/')[4];
        return await featureNote(noteId, request, env);
      }

      if (path === '/api/admin/subjects' && request.method === 'GET') {
        return await listSubjects(request, env);
      }
      if (path === '/api/admin/subjects' && request.method === 'POST') {
        return await createSubject(request, env);
      }
      if (path.match(/^\/api\/admin\/subjects\/\d+$/) && request.method === 'PUT') {
        const id = path.split('/').pop()!;
        return await updateSubject(id, request, env);
      }
      if (path.match(/^\/api\/admin\/subjects\/\d+$/) && request.method === 'DELETE') {
        const id = path.split('/').pop()!;
        return await deleteSubject(id, request, env);
      }

      if (path === '/api/admin/users' && request.method === 'GET') {
        return await getAllUsers(request, env);
      }

      if (path === '/api/admin/notes' && request.method === 'GET') {
        return await getAllNotes(request, env);
      }

      if (path === '/api/admin/activity-log' && request.method === 'GET') {
        return await getAdminActivityLogs(request, env);
      }

      if (path === '/api/admin/usage-stats' && request.method === 'GET') {
        return await getUsageStatistics(request, env);
      }

      if (path === '/api/grade-classes' && request.method === 'GET') {
        return await getPublicGradeClasses(env);
      }

      if (path === '/api/admin/grade-classes' && request.method === 'GET') {
        return await adminGetGradeClasses(request, env);
      }
      if (path === '/api/admin/grade-classes' && request.method === 'POST') {
        return await adminCreateGradeClass(request, env);
      }
      if (path === '/api/admin/grade-classes/reassign' && request.method === 'POST') {
        return await adminReassignUserClass(request, env);
      }
      if (path === '/api/admin/grade-classes/promote' && request.method === 'POST') {
        return await adminPromoteClasses(request, env);
      }
      if (path.match(/^\/api\/admin\/grade-classes\/\d+$/) && request.method === 'PUT') {
        const id = path.split('/').pop()!;
        return await adminUpdateGradeClass(id, request, env);
      }
      if (path.match(/^\/api\/admin\/grade-classes\/\d+$/) && request.method === 'DELETE') {
        const id = path.split('/').pop()!;
        return await adminDeleteGradeClass(id, request, env);
      }

      if (path === '/api/admin/notifications' && request.method === 'POST') {
        return await adminCreateNotification(request, env);
      }
      if (path === '/api/admin/notifications' && request.method === 'GET') {
        return await adminGetNotifications(request, env);
      }
      if (path.match(/^\/api\/admin\/notifications\/\d+$/) && request.method === 'DELETE') {
        const id = path.split('/').pop()!;
        return await adminDeleteNotification(id, request, env);
      }

      if (path === '/api/notifications' && request.method === 'GET') {
        return await getUserNotifications(request, env);
      }
      if (path === '/api/notifications/unread-count' && request.method === 'GET') {
        return await getUnreadNotificationCount(request, env);
      }
      if (path === '/api/notifications/read-all' && request.method === 'POST') {
        return await markAllNotificationsRead(request, env);
      }
      if (path.match(/^\/api\/notifications\/\d+\/read$/) && request.method === 'POST') {
        const notifId = path.split('/')[3];
        return await markNotificationRead(notifId, request, env);
      }

      if (path === '/api/quiz/attempt' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await logQuizAttempt(request, env);
      }
      if (path === '/api/reviews/due' && request.method === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await getDueReviews(request, env);
      }
      if (path.match(/^\/api\/reviews\/\d+\/grade$/) && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        const itemId = path.split('/')[3];
        return await gradeReview(itemId, request, env);
      }
      if (path === '/api/recall/grade' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await gradeRecall(request, env);
      }
      if (path === '/api/study/stats' && request.method === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);
        return await getStudyStats(request, env);
      }

      // ---- Ops / technical dashboard (Phase 3) ----
      if (path === '/api/health' && request.method === 'GET') {
        return await healthCheck(request, env);
      }
      if (path === '/api/ops/metrics' && request.method === 'GET') {
        return await getOpsMetrics(request, env);
      }
      if (path === '/api/ops/timeseries' && request.method === 'GET') {
        return await getOpsTimeseries(request, env);
      }
      if (path === '/api/ops/cloudflare' && request.method === 'GET') {
        return await getCloudflareMetrics(request, env);
      }
      if (path === '/api/ops/flags' && request.method === 'GET') {
        return await getFlags(request, env);
      }
      if (path === '/api/ops/maintenance' && request.method === 'POST') {
        return await setMaintenance(request, env);
      }
      if (path === '/api/ops/flags' && request.method === 'POST') {
        return await setFlag(request, env);
      }
      if (path === '/api/ops/recompute' && request.method === 'POST') {
        return await recompute(request, env);
      }
      if (path === '/api/ops/activity-log.csv' && request.method === 'GET') {
        return await exportActivityLog(request, env);
      }
      if (path === '/api/ops/danger/purge-notes' && request.method === 'POST') {
        return await purgeDeletedNotes(request, env);
      }
      if (path === '/api/ops/danger/revoke-tokens' && request.method === 'POST') {
        return await revokeAllTokens(request, env);
      }

      const oauthResponse = await handleOAuthRoutes(path, url, request, env);
      if (oauthResponse) return oauthResponse;

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error: any) {
      // getOrCreateUser throws 'Unauthorized' for unauthenticated requests that
      // reach a per-user endpoint — surface a clean 401, not a 500.
      if (error?.message === 'Unauthorized') {
        return jsonResponse({ error: 'Unauthorized' }, 401, env);
      }
      console.error('Unhandled error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500, env);
    }
  },
};
