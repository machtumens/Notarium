import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  timingSafeEqualStr,
  touchLastSeen,
} from '../lib/auth';
import { checkRateLimit, validateRequestSize } from '../lib/ratelimit';
import { RATE_LIMIT_MAX_ATTEMPTS_PER_IP, REFRESH_MAX_PER_WINDOW } from '../lib/env';
import { loginSchema, logoutSchema, parseBody, refreshSchema, signupSchema } from '../lib/validation';
import {
  issueSessionPair,
  revokeSession,
  rotateRefreshToken,
  wantsShortSession,
  type SessionUser,
} from '../lib/session';
import { createMfaChallenge } from '../lib/totp';
import { currentAcademicYear } from '../lib/academicYear';
import { SQL_NOW_ISO, isValidZone } from '../lib/time';

/**
 * The token(s) a successful sign-in hands back. A client that asked for a short
 * session (`X-Notarium-Session: refresh`) gets a 15-minute access token plus a
 * refresh token; everyone else gets the flat 24-hour token and no `refreshToken`
 * key at all, which is what every client before this change expects.
 *
 * 2FA completion (`/api/auth/2fa/verify`) still issues the long token only — it
 * has its own endpoint and no client opts in there yet.
 */
async function openSession(
  user: SessionUser,
  request: Request,
  env: Env,
): Promise<{ token: string; refreshToken?: string }> {
  if (!wantsShortSession(request)) return { token: await createToken(user, env) };
  return await issueSessionPair(user, env);
}

export async function signupEndpoint(request: Request, env: Env) {
  try {
    if (!validateRequestSize(request)) {
      return jsonResponse({ error: 'Request too large' }, 413, env);
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const canProceed = await checkRateLimit(ip, 'signup', env, RATE_LIMIT_MAX_ATTEMPTS_PER_IP);
    if (!canProceed) {
      return jsonResponse(
        { error: 'Too many signup attempts. Please try again in 15 minutes.' },
        429,
        env,
      );
    }

    const body = await parseBody(request, signupSchema, env);
    if (body instanceof Response) return body;

    const { name, email, password, class: userClass, academic_year, timezone } = body;
    const academicYear = academic_year || currentAcademicYear();
    // A browser-supplied zone that this runtime cannot format in is dropped
    // rather than rejected: a bad zone is not a reason to fail a signup, and
    // NULL already means "use the school default".
    const userZone = isValidZone(timezone) ? timezone : null;

    let gradeValue: number | null = null;
    let gradeClassId: number | null = null;
    if (userClass) {
      const gradeClass = (await env.DB.prepare(
        'SELECT id, grade FROM grade_classes WHERE class_name = ? AND is_active = 1 LIMIT 1',
      )
        .bind(userClass)
        .first()) as any;
      if (!gradeClass) {
        return jsonResponse({ error: 'Invalid class selection' }, 400, env);
      }
      gradeValue = gradeClass.grade;
      gradeClassId = gradeClass.id;
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existing) {
      return jsonResponse({ error: 'Email already registered' }, 409, env);
    }

    const hashedPassword = await hashPassword(password);

    const user = await env.DB.prepare(
      `
      INSERT INTO users (display_name, email, password_hash, class, grade, grade_class_id, academic_year, timezone, role, notes_uploaded, total_likes, total_admin_upvotes, diamonds, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'student', 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      RETURNING id, email, display_name, class, grade, academic_year, timezone, role, notes_uploaded, total_likes, total_admin_upvotes, diamonds, description, photo_url
    `,
    )
      .bind(
        name,
        email,
        hashedPassword,
        userClass || null,
        gradeValue,
        gradeClassId,
        academicYear,
        userZone,
      )
      .first();

    if (!user) {
      return jsonResponse({ error: 'Failed to create user' }, 500, env);
    }
    const session = await openSession(
      {
        id: (user as any).id,
        email: (user as any).email,
        role: (user as any).role,
      },
      request,
      env,
    );

    const points =
      ((user as any).notes_uploaded || 0) +
      ((user as any).total_likes || 0) +
      ((user as any).total_admin_upvotes || 0);

    return jsonResponse(
      {
        ...session,
        user: {
          id: (user as any).id,
          email: (user as any).email,
          name: (user as any).display_name,
          class: (user as any).class,
          focus_subject_ids: parseFocusSubjectIds((user as any).focus_subject_ids),
          grade: (user as any).grade || null,
          academic_year: (user as any).academic_year || null,
          timezone: (user as any).timezone || null,
          role: (user as any).role,
          notes_count: (user as any).notes_uploaded || 0,
          total_likes: (user as any).total_likes || 0,
          total_admin_upvotes: (user as any).total_admin_upvotes || 0,
          diamonds: (user as any).diamonds || 0,
          points: points,
          description: (user as any).description || null,
          photo_url: (user as any).photo_url || null,
        },
      },
      201,
      env,
    );
  } catch (error: any) {
    if (error.message && error.message.includes('UNIQUE')) {
      return jsonResponse({ error: 'Email already registered' }, 409, env);
    }
    console.error('signup error:', error);
    return jsonResponse({ error: 'Signup failed' }, 500, env);
  }
}

export async function loginEndpoint(request: Request, env: Env) {
  try {
    if (!validateRequestSize(request)) {
      return jsonResponse({ error: 'Request too large' }, 413, env);
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const body = await parseBody(request, loginSchema, env);
    if (body instanceof Response) return body;

    const { email, password } = body;

    // Keyed on IP *and* account, not IP alone. The school sits behind one NAT,
    // so an IP-only key gives the entire school five logins per quarter hour —
    // one student mistyping a password locks out the class. Including the email
    // keeps the brute-force ceiling at five guesses per account from any one
    // origin, which is the property that actually matters here.
    if (!(await checkRateLimit(`${ip}|${email.toLowerCase()}`, 'login', env))) {
      return jsonResponse(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        429,
        env,
      );
    }

    let user;
    try {
      user = await env.DB.prepare(
        `
        SELECT
          id,
          email,
          display_name,
          password_hash,
          class,
          grade,
          role,
          notes_uploaded,
          total_likes,
          total_admin_upvotes,
          COALESCE(diamonds, 0) as diamonds,
          description,
          photo_url,
          suspended,
          suspension_end_date,
          suspension_reason,
          totp_enabled
        FROM users WHERE email = ?
      `,
      )
        .bind(email)
        .first();
    } catch (dbError: any) {
      try {
        user = await env.DB.prepare(
          `
          SELECT
            id,
            email,
            display_name,
            password_hash,
            class,
            focus_subject_ids,
            role,
            notes_uploaded,
            total_likes,
            total_admin_upvotes,
            description,
            photo_url,
            suspended,
            suspension_end_date,
            suspension_reason
          FROM users WHERE email = ?
        `,
        )
          .bind(email)
          .first();

        if (user) {
          (user as any).diamonds = 0;
        }
      } catch (fallbackError: any) {
        console.error('login db fallback error:', fallbackError);
        return jsonResponse({ error: 'Database error' }, 500);
      }
    }

    if (email.endsWith('@notariumadmin.com')) {
      if (!(await timingSafeEqualStr(env.ADMIN_PASSWORD, String(password || '')))) {
        return jsonResponse({ error: 'Invalid email or password' }, 401, env);
      }
      let adminUser = (await env.DB.prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(email)
        .first()) as any;
      if (!adminUser) {
        adminUser = (await env.DB.prepare(
          `
          INSERT INTO users (encrypted_yw_id, display_name, email, password_hash, class, role, created_at)
          VALUES (?, ?, ?, '', '10.1', 'admin', strftime('%Y-%m-%dT%H:%M:%SZ','now'))
          RETURNING id, email, display_name, class, role
        `,
        )
          .bind('admin_' + email, email.split('@')[0], email)
          .first()) as any;
      } else if (adminUser.role !== 'admin') {
        await env.DB.prepare(
          `UPDATE users SET role = 'admin', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE email = ?`,
        )
          .bind(email)
          .run();
        adminUser.role = 'admin';
      }
      const adminToken = await createToken(
        { id: adminUser.id, email: adminUser.email, role: 'admin' },
        env,
      );
      return jsonResponse(
        {
          success: true,
          token: adminToken,
          user: {
            id: adminUser.id,
            email: adminUser.email,
            name: adminUser.display_name,
            class: adminUser.class,
            role: 'admin',
          },
        },
        200,
        env,
      );
    }

    if (!user) {
      return jsonResponse({ error: 'Invalid email or password' }, 401);
    }

    const isPasswordValid = await verifyPassword(password, (user as any).password_hash);
    if (!isPasswordValid) {
      return jsonResponse({ error: 'Invalid email or password' }, 401, env);
    }

    if ((user as any).suspended === 1) {
      const now = new Date();
      const suspensionEndDate = (user as any).suspension_end_date
        ? new Date((user as any).suspension_end_date)
        : null;

      if (suspensionEndDate && now > suspensionEndDate) {
        await env.DB.prepare(
          `UPDATE users SET suspended = 0, suspension_end_date = NULL, suspension_reason = NULL, updated_at = ${SQL_NOW_ISO} WHERE id = ?`,
        )
          .bind((user as any).id)
          .run();
        (user as any).suspended = 0;
        (user as any).suspension_end_date = null;
        (user as any).suspension_reason = null;
      } else {
        const daysRemaining = suspensionEndDate
          ? Math.ceil((suspensionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return jsonResponse(
          {
            error: 'Account suspended',
            suspended: true,
            suspension_end_date: (user as any).suspension_end_date,
            suspension_reason: (user as any).suspension_reason || 'Suspended by admin',
            days_remaining: daysRemaining,
          },
          403,
        );
      }
    }
    // Password passed. If 2FA is on, stop here and issue a short-lived
    // challenge instead of a session token — the client completes login via
    // POST /api/auth/2fa/verify.
    if ((user as any).totp_enabled === 1) {
      const challenge = await createMfaChallenge((user as any).id, env);
      return jsonResponse({ requires_2fa: true, challenge }, 200, env);
    }

    const session = await openSession(
      {
        id: (user as any).id,
        email: (user as any).email,
        role: (user as any).role || 'student',
      },
      request,
      env,
    );

    const points =
      ((user as any).notes_uploaded || 0) +
      ((user as any).total_likes || 0) +
      ((user as any).total_admin_upvotes || 0);

    return jsonResponse(
      {
        success: true,
        ...session,
        user: {
          id: (user as any).id,
          email: (user as any).email,
          name: (user as any).display_name,
          class: (user as any).class,
          focus_subject_ids: parseFocusSubjectIds((user as any).focus_subject_ids),
          grade: (user as any).grade || null,
          role: (user as any).role,
          notes_count: (user as any).notes_uploaded || 0,
          total_likes: (user as any).total_likes || 0,
          total_admin_upvotes: (user as any).total_admin_upvotes || 0,
          diamonds: (user as any).diamonds || 0,
          points: points,
          description: (user as any).description || null,
          photo_url: (user as any).photo_url || null,
        },
      },
      200,
      env,
    );
  } catch (error: any) {
    console.error('login error:', error);
    return jsonResponse({ error: 'Login failed' }, 500, env);
  }
}

/** JSON text column -> number[]; anything unexpected reads as the empty list. */
function parseFocusSubjectIds(raw: unknown): number[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

export async function meEndpoint(request: Request, env: Env) {
  try {
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

    try {
      let userData;
      try {
        userData = (await env.DB.prepare(
          `
          SELECT
            id,
            email,
            display_name,
            photo_url,
            class,
            focus_subject_ids,
            grade,
            grade_class_id,
            role,
            admin_role,
            notes_uploaded,
            total_likes,
            total_admin_upvotes,
            COALESCE(diamonds, 0) as diamonds,
            description,
            suspended,
            suspension_end_date,
            suspension_reason,
            warning,
            warning_message,
            warning_first_viewed,
            warning_view_count,
            totp_enabled,
            timezone,
            last_seen_at,
            (notes_uploaded + total_likes + total_admin_upvotes) as points
          FROM users WHERE id = ?
        `,
        )
          .bind(userId)
          .first()) as any;
      } catch (e) {
        userData = (await env.DB.prepare(
          `
          SELECT
            id,
            email,
            display_name,
            photo_url,
            class,
            focus_subject_ids,
            role,
            notes_uploaded,
            total_likes,
            total_admin_upvotes,
            description,
            suspended,
            suspension_end_date,
            suspension_reason,
            warning,
            warning_message,
            warning_first_viewed,
            warning_view_count,
            (notes_uploaded + total_likes + total_admin_upvotes) as points
          FROM users WHERE id = ?
        `,
        )
          .bind(userId)
          .first()) as any;
        if (userData) {
          userData.diamonds = 0;
        }
      }

      if (!userData) {
        return jsonResponse({ error: 'User not found' }, 404);
      }

      if (userData.suspended === 1) {
        const now = new Date();
        const suspensionEndDate = userData.suspension_end_date
          ? new Date(userData.suspension_end_date)
          : null;

        if (suspensionEndDate && now > suspensionEndDate) {
          await env.DB.prepare(
            `UPDATE users SET suspended = 0, suspension_end_date = NULL, suspension_reason = NULL, updated_at = ${SQL_NOW_ISO} WHERE id = ?`,
          )
            .bind(userId)
            .run();
          userData.suspended = 0;
          userData.suspension_end_date = null;
          userData.suspension_reason = null;
        }
      }

      if (userData.warning === 1 && userData.warning_message) {
        const now = new Date();
        let shouldClearWarning = false;

        if (!userData.warning_first_viewed) {
          await env.DB.prepare(
            `
            UPDATE users
            SET warning_first_viewed = ?, warning_view_count = 1, updated_at = ${SQL_NOW_ISO}
            WHERE id = ?
          `,
          )
            .bind(now.toISOString(), userId)
            .run();
          userData.warning_view_count = 1;
          userData.warning_first_viewed = now.toISOString();
        } else {
          const firstViewed = new Date(userData.warning_first_viewed);
          const hoursPassed = (now.getTime() - firstViewed.getTime()) / (1000 * 60 * 60);

          if (hoursPassed >= 24) {
            shouldClearWarning = true;
          } else {
            const newViewCount = (userData.warning_view_count || 0) + 1;

            if (newViewCount >= 5) {
              shouldClearWarning = true;
            } else {
              await env.DB.prepare(
                `
                UPDATE users
                SET warning_view_count = ?, updated_at = ${SQL_NOW_ISO}
                WHERE id = ?
              `,
              )
                .bind(newViewCount, userId)
                .run();
              userData.warning_view_count = newViewCount;
            }
          }
        }

        if (shouldClearWarning) {
          await env.DB.prepare(
            `
            UPDATE users
            SET warning = 0, warning_message = NULL, warning_first_viewed = NULL, warning_view_count = 0, updated_at = ${SQL_NOW_ISO}
            WHERE id = ?
          `,
          )
            .bind(userId)
            .run();
          userData.warning = 0;
          userData.warning_message = null;
          userData.warning_first_viewed = null;
          userData.warning_view_count = 0;
        }
      }

      const user = {
        id: userData.id,
        email: userData.email,
        name: userData.display_name,
        class: userData.class,
        // Stored as JSON text; the client gets an array or an empty one. A row
        // written before this column existed, or by hand, must not 500 the
        // whole /me call, so a parse failure reads as "no focus subjects".
        focus_subject_ids: parseFocusSubjectIds(userData.focus_subject_ids),
        role: userData.role,
        admin_role: userData.admin_role || null,
        notes_count: userData.notes_uploaded || 0,
        total_likes: userData.total_likes || 0,
        total_admin_upvotes: userData.total_admin_upvotes || 0,
        diamonds: userData.diamonds || 0,
        points: userData.points || 0,
        photo_url: userData.photo_url || null,
        description: userData.description || null,
        suspended: userData.suspended || 0,
        suspension_end_date: userData.suspension_end_date || null,
        suspension_reason: userData.suspension_reason || null,
        warning: userData.warning || 0,
        warning_message: userData.warning_message || null,
        grade: userData.grade || null,
        grade_class_id: userData.grade_class_id || null,
        totp_enabled: userData.totp_enabled || 0,
        // null = no override; the client falls back to the school default.
        timezone: userData.timezone || null,
      };

      // The client calls this on every page load, which makes it the most
      // reliable signal that someone is actually using the app. The row is
      // already in hand, so a user seen recently costs no extra query.
      await touchLastSeen(env, userId, userData.last_seen_at);

      return jsonResponse({ user });
    } catch (dbError: any) {
      console.error('me db error:', dbError);
      return jsonResponse({ error: 'Failed to get user data' }, 500);
    }
  } catch (error: any) {
    console.error('me error:', error);
    return jsonResponse({ error: 'Failed to get current user' }, 500);
  }
}


/**
 * POST /api/auth/refresh — spend a refresh token, get the next pair.
 *
 * Every failure is the same 401 with the same body: the client's only decision
 * is "can this session continue", and telling it apart would tell an attacker
 * whether a token was ever real. A replay additionally revokes the family, which
 * `rotateRefreshToken` has already done by the time we answer.
 */
export async function refreshEndpoint(request: Request, env: Env) {
  try {
    if (!validateRequestSize(request)) {
      return jsonResponse({ error: 'Request too large' }, 413, env);
    }
    const body = await parseBody(request, refreshSchema, env);
    if (body instanceof Response) return body;

    // Per user, NOT per IP: the whole school shares one public IP, and an access
    // token lasts exactly one rate-limit window, so an IP bucket would run out
    // mid-lesson and sign the class out. A forged token never gets here — it
    // fails signature verification below, which costs no database read — so the
    // only thing left to bound is one account's own refreshes. Ten per quarter
    // hour covers a student on a laptop and a phone with room to spare.
    const claims = await verifyToken(body.refreshToken, env, { allowRefresh: true });
    if (!claims || claims.typ !== 'refresh') {
      return jsonResponse({ error: 'Invalid refresh token' }, 401, env);
    }
    if (!(await checkRateLimit(String(claims.id), 'refresh', env, REFRESH_MAX_PER_WINDOW))) {
      return jsonResponse({ error: 'Too many requests' }, 429, env);
    }

    const result = await rotateRefreshToken(body.refreshToken, env);
    if (result.outcome !== 'rotated') {
      return jsonResponse({ error: 'Invalid refresh token' }, 401, env);
    }
    return jsonResponse({ success: true, ...result.pair }, 200, env);
  } catch (error: any) {
    console.error('refresh error:', error);
    return jsonResponse({ error: 'Refresh failed' }, 500, env);
  }
}

/**
 * POST /api/auth/logout — end the session server-side.
 *
 * Identity comes from the access token, or, when that has already expired, from
 * the refresh token in the body: a client signing out after fifteen idle minutes
 * should not be told it is unauthorized. With a refresh token only that device's
 * family goes; without one, every refresh token the user holds.
 *
 * The access token itself stays valid until it expires — these are stateless
 * JWTs, and the short TTL is what bounds them. A client must drop it locally,
 * which the V2.0 client does whether this call succeeds or not.
 */
export async function logoutEndpoint(request: Request, env: Env) {
  try {
    if (!validateRequestSize(request)) {
      return jsonResponse({ error: 'Request too large' }, 413, env);
    }
    const body = await parseBody(request, logoutSchema, env);
    if (body instanceof Response) return body;

    const auth = request.headers.get('Authorization');
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    const access = bearer ? await verifyToken(bearer, env) : null;
    const presented = body.refreshToken
      ? await verifyToken(body.refreshToken, env, { allowRefresh: true })
      : null;
    const userId =
      access?.id ?? (presented?.typ === 'refresh' ? presented.id : null);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    await revokeSession(userId, body.refreshToken, env);
    return jsonResponse({ success: true }, 200, env);
  } catch (error: any) {
    console.error('logout error:', error);
    return jsonResponse({ error: 'Logout failed' }, 500, env);
  }
}
