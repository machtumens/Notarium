/**
 * Email/password auth endpoints: signup, login (incl. admin-via-form), and /me.
 */
import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { hashPassword, verifyPassword, createToken, verifyToken } from '../lib/auth';
import { checkRateLimit, validateRequestSize } from '../lib/ratelimit';
import { signupSchema, loginSchema } from '../lib/validation';

// Sign up endpoint
export async function signupEndpoint(request: Request, env: Env) {
  try {
    // Check request size
    if (!validateRequestSize(request)) {
      return jsonResponse({ error: 'Request too large' }, 413, env);
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const canProceed = await checkRateLimit(ip, 'signup', env);
    if (!canProceed) {
      return jsonResponse(
        { error: 'Too many signup attempts. Please try again in 15 minutes.' },
        429,
        env,
      );
    }

    const body = (await request.json()) as any;

    // Input validation with zod
    const validation = signupSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse(
        {
          error: 'Invalid input',
          details: validation.error.errors,
        },
        400,
        env,
      );
    }

    const { name, email, password, class: userClass } = validation.data;

    // Restrict to school domain
    if (!email.toLowerCase().endsWith('@sekolahkristencalvin.org')) {
      return jsonResponse(
        { error: 'Only @sekolahkristencalvin.org email addresses are allowed' },
        400,
        env,
      );
    }

    // Validate class against grade_classes table
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

    // Check if user already exists
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existing) {
      return jsonResponse({ error: 'Email already registered' }, 409, env);
    }

    // Hash password with bcrypt
    const hashedPassword = await hashPassword(password);

    // Create new user
    const user = await env.DB.prepare(
      `
      INSERT INTO users (display_name, email, password_hash, class, grade, grade_class_id, role, notes_uploaded, total_likes, total_admin_upvotes, diamonds, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'student', 0, 0, 0, 0, datetime('now'))
      RETURNING id, email, display_name, class, grade, role, notes_uploaded, total_likes, total_admin_upvotes, diamonds, description, photo_url
    `,
    )
      .bind(name, email, hashedPassword, userClass || null, gradeValue, gradeClassId)
      .first();

    if (!user) {
      return jsonResponse({ error: 'Failed to create user' }, 500, env);
    }
    const token = await createToken(
      {
        id: (user as any).id,
        email: (user as any).email,
        role: (user as any).role,
      },
      env,
    );

    // Calculate points (1 point per note upload, 1 point per like, 1 point per admin like)
    const points =
      ((user as any).notes_uploaded || 0) +
      ((user as any).total_likes || 0) +
      ((user as any).total_admin_upvotes || 0);

    return jsonResponse(
      {
        token,
        user: {
          id: (user as any).id,
          email: (user as any).email,
          name: (user as any).display_name,
          class: (user as any).class,
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
      201,
      env,
    );
  } catch (error: any) {
    if (error.message && error.message.includes('UNIQUE')) {
      return jsonResponse({ error: 'Email already registered' }, 409, env);
    }
    return jsonResponse({ error: error.message || 'Signup failed' }, 500, env);
  }
}

// Login endpoint
export async function loginEndpoint(request: Request, env: Env) {
  try {
    // Check request size
    if (!validateRequestSize(request)) {
      return jsonResponse({ error: 'Request too large' }, 413, env);
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const canProceed = await checkRateLimit(ip, 'login', env);
    if (!canProceed) {
      return jsonResponse(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        429,
        env,
      );
    }
    let body;
    try {
      body = (await request.json()) as any;
    } catch (parseError) {
      return jsonResponse({ error: 'Invalid request body format' }, 400, env);
    }

    // Input validation with zod
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse(
        {
          error: 'Invalid input',
          details: validation.error.errors,
        },
        400,
        env,
      );
    }

    const { email, password } = validation.data;

    // Query user from database
    let user;
    try {
      // Try to query with all columns first
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
          suspension_reason
        FROM users WHERE email = ?
      `,
      )
        .bind(email)
        .first();
    } catch (dbError: any) {
      // Fallback: try without diamonds column
      try {
        user = await env.DB.prepare(
          `
          SELECT
            id,
            email,
            display_name,
            password_hash,
            class,
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

        // Add diamonds with default value
        if (user) {
          (user as any).diamonds = 0;
        }
      } catch (fallbackError: any) {
        return jsonResponse(
          { error: `Database error: ${fallbackError?.message || 'could not query user'}` },
          500,
        );
      }
    }

    // Admin login via regular form: @notariumadmin.com email + ADMIN_PASSWORD
    if (email.endsWith('@notariumadmin.com')) {
      if (password !== env.ADMIN_PASSWORD) {
        return jsonResponse({ error: 'Invalid email or password' }, 401, env);
      }
      // Upsert the admin user record
      let adminUser = (await env.DB.prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(email)
        .first()) as any;
      if (!adminUser) {
        adminUser = (await env.DB.prepare(
          `
          INSERT INTO users (encrypted_yw_id, display_name, email, password_hash, class, role, created_at)
          VALUES (?, ?, ?, '', '10.1', 'admin', datetime('now'))
          RETURNING id, email, display_name, class, role
        `,
        )
          .bind('admin_' + email, email.split('@')[0], email)
          .first()) as any;
      } else if (adminUser.role !== 'admin') {
        await env.DB.prepare(
          `UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE email = ?`,
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

    // Verify password with bcrypt
    const isPasswordValid = await verifyPassword(password, (user as any).password_hash);
    if (!isPasswordValid) {
      return jsonResponse({ error: 'Invalid email or password' }, 401, env);
    }

    // Check if user is suspended
    if ((user as any).suspended === 1) {
      const now = new Date();
      const suspensionEndDate = (user as any).suspension_end_date
        ? new Date((user as any).suspension_end_date)
        : null;

      // If suspension has expired, clear it
      if (suspensionEndDate && now > suspensionEndDate) {
        await env.DB.prepare(
          'UPDATE users SET suspended = 0, suspension_end_date = NULL, suspension_reason = NULL, updated_at = datetime("now") WHERE id = ?',
        )
          .bind((user as any).id)
          .run();
        (user as any).suspended = 0;
        (user as any).suspension_end_date = null;
        (user as any).suspension_reason = null;
      } else {
        // Suspension is still active
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
    const token = await createToken(
      {
        id: (user as any).id,
        email: (user as any).email,
        role: (user as any).role || 'student',
      },
      env,
    );

    // Calculate points (1 point per note upload, 1 point per like, 1 point per admin like)
    const points =
      ((user as any).notes_uploaded || 0) +
      ((user as any).total_likes || 0) +
      ((user as any).total_admin_upvotes || 0);

    return jsonResponse(
      {
        success: true,
        token,
        user: {
          id: (user as any).id,
          email: (user as any).email,
          name: (user as any).display_name,
          class: (user as any).class,
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
    return jsonResponse({ error: `Login failed: ${error?.message || 'Unknown error'}` }, 500, env);
  }
}

// Get current user endpoint
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
            grade,
            grade_class_id,
            role,
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
            (notes_uploaded + total_likes + total_admin_upvotes) as points
          FROM users WHERE id = ?
        `,
        )
          .bind(userId)
          .first()) as any;
      } catch (e) {
        // Fallback without diamonds column
        userData = (await env.DB.prepare(
          `
          SELECT
            id,
            email,
            display_name,
            photo_url,
            class,
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

      // Check if user is suspended and if suspension has expired
      if (userData.suspended === 1) {
        const now = new Date();
        const suspensionEndDate = userData.suspension_end_date
          ? new Date(userData.suspension_end_date)
          : null;

        // If suspension has expired, clear it
        if (suspensionEndDate && now > suspensionEndDate) {
          await env.DB.prepare(
            'UPDATE users SET suspended = 0, suspension_end_date = NULL, suspension_reason = NULL, updated_at = datetime("now") WHERE id = ?',
          )
            .bind(userId)
            .run();
          userData.suspended = 0;
          userData.suspension_end_date = null;
          userData.suspension_reason = null;
        }
      }

      // Handle warning tracking and auto-dismissal
      if (userData.warning === 1 && userData.warning_message) {
        const now = new Date();
        let shouldClearWarning = false;

        // Set first viewed timestamp if not set
        if (!userData.warning_first_viewed) {
          await env.DB.prepare(
            `
            UPDATE users
            SET warning_first_viewed = ?, warning_view_count = 1, updated_at = datetime("now")
            WHERE id = ?
          `,
          )
            .bind(now.toISOString(), userId)
            .run();
          userData.warning_view_count = 1;
          userData.warning_first_viewed = now.toISOString();
        } else {
          // Check if 24 hours have passed
          const firstViewed = new Date(userData.warning_first_viewed);
          const hoursPassed = (now.getTime() - firstViewed.getTime()) / (1000 * 60 * 60);

          if (hoursPassed >= 24) {
            shouldClearWarning = true;
          } else {
            // Increment view count
            const newViewCount = (userData.warning_view_count || 0) + 1;

            if (newViewCount >= 5) {
              shouldClearWarning = true;
            } else {
              // Update view count
              await env.DB.prepare(
                `
                UPDATE users
                SET warning_view_count = ?, updated_at = datetime("now")
                WHERE id = ?
              `,
              )
                .bind(newViewCount, userId)
                .run();
              userData.warning_view_count = newViewCount;
            }
          }
        }

        // Clear warning if conditions are met
        if (shouldClearWarning) {
          await env.DB.prepare(
            `
            UPDATE users
            SET warning = 0, warning_message = NULL, warning_first_viewed = NULL, warning_view_count = 0, updated_at = datetime("now")
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

      // Map database fields to frontend interface
      const user = {
        id: userData.id,
        email: userData.email,
        name: userData.display_name,
        class: userData.class,
        role: userData.role,
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
      };

      return jsonResponse({ user });
    } catch (dbError: any) {
      return jsonResponse({ error: 'Failed to get user data' }, 500);
    }
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Failed to get current user' }, 500);
  }
}
