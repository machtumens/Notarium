import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { requireAdmin } from '../lib/auth';

export async function logAdminActivity(
  env: Env,
  adminId: number,
  adminEmail: string,
  actionType: string,
  targetType: string,
  targetId: number,
  details: string,
) {
  try {
    await env.DB.prepare(
      `
      INSERT INTO admin_activity_log (admin_id, admin_email, action_type, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
      .bind(adminId, adminEmail, actionType, targetType, targetId, details)
      .run();
  } catch (error) {}
}

export async function getAdminActivityLogs(request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { results } = await env.DB.prepare(
    `
    SELECT * FROM admin_activity_log
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `,
  )
    .bind(limit, offset)
    .all();

  return jsonResponse({ logs: results });
}

export async function getUsageStatistics(request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  try {
    const countResults = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) as count FROM users'),
      env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT author_id as user_id FROM notes WHERE created_at >= datetime('now', '-7 days')
        UNION
        SELECT user_id FROM chat_sessions WHERE created_at >= datetime('now', '-7 days')
        UNION
        SELECT user_id FROM note_likes WHERE created_at >= datetime('now', '-7 days')
      )
    `),
      env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT author_id as user_id FROM notes WHERE created_at >= datetime('now', '-30 days')
        UNION
        SELECT user_id FROM chat_sessions WHERE created_at >= datetime('now', '-30 days')
        UNION
        SELECT user_id FROM note_likes WHERE created_at >= datetime('now', '-30 days')
      )
    `),
      env.DB.prepare('SELECT COUNT(*) as count FROM notes'),
      env.DB.prepare(`
      SELECT COUNT(*) as count FROM notes WHERE created_at >= datetime('now', '-7 days')
    `),
      env.DB.prepare(`
      SELECT COUNT(*) as count FROM notes WHERE created_at >= datetime('now', '-30 days')
    `),
      env.DB.prepare('SELECT COUNT(*) as count FROM note_likes'),
      env.DB.prepare('SELECT COUNT(*) as count FROM admin_note_likes'),
      env.DB.prepare('SELECT COUNT(*) as count FROM chat_sessions'),
      env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_sessions WHERE created_at >= datetime('now', '-7 days')
    `),
      env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_sessions WHERE created_at >= datetime('now', '-30 days')
    `),
    ]);

    const totalUsers = countResults[0]?.results?.[0] as any;
    const activeUsers7d = countResults[1]?.results?.[0] as any;
    const activeUsers30d = countResults[2]?.results?.[0] as any;
    const totalNotes = countResults[3]?.results?.[0] as any;
    const notes7d = countResults[4]?.results?.[0] as any;
    const notes30d = countResults[5]?.results?.[0] as any;
    const totalLikes = countResults[6]?.results?.[0] as any;
    const totalAdminUpvotes = countResults[7]?.results?.[0] as any;
    const totalChatSessions = countResults[8]?.results?.[0] as any;
    const chatSessions7d = countResults[9]?.results?.[0] as any;
    const chatSessions30d = countResults[10]?.results?.[0] as any;

    const { results: topContributors } = await env.DB.prepare(
      `
      SELECT
        u.id,
        u.display_name,
        u.email,
        u.class,
        u.notes_uploaded,
        u.total_likes,
        u.total_admin_upvotes
      FROM users u
      WHERE u.role = 'student'
      ORDER BY u.notes_uploaded DESC
      LIMIT 10
    `,
    ).all();

    const { results: usersByClass } = await env.DB.prepare(
      `
      SELECT
        class,
        COUNT(*) as count
      FROM users
      WHERE role = 'student' AND class IS NOT NULL
      GROUP BY class
      ORDER BY class
    `,
    ).all();

    const { results: notesByClass } = await env.DB.prepare(
      `
      SELECT
        author_class as class,
        COUNT(*) as count
      FROM notes
      WHERE author_class IS NOT NULL
      GROUP BY author_class
      ORDER BY author_class
    `,
    ).all();

    const { results: popularSubjects } = await env.DB.prepare(
      `
      SELECT
        s.id,
        s.name,
        s.icon,
        COUNT(n.id) as note_count,
        SUM(n.likes) as total_likes
      FROM subjects s
      LEFT JOIN notes n ON n.subject_id = s.id
      GROUP BY s.id, s.name, s.icon
      ORDER BY note_count DESC
      LIMIT 10
    `,
    ).all();

    const { results: dailyActivity } = await env.DB.prepare(
      `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM notes
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    ).all();

    const { results: dailyRegistrations } = await env.DB.prepare(
      `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    ).all();

    const suspendedUsers = (await env.DB.prepare(
      `
      SELECT COUNT(*) as count FROM users WHERE suspended = 1
    `,
    ).first()) as any;

    const warnedUsers = (await env.DB.prepare(
      `
      SELECT COUNT(*) as count FROM users WHERE warning = 1
    `,
    ).first()) as any;

    return jsonResponse({
      overview: {
        totalUsers: totalUsers?.count || 0,
        activeUsers7d: activeUsers7d?.count || 0,
        activeUsers30d: activeUsers30d?.count || 0,
        totalNotes: totalNotes?.count || 0,
        notes7d: notes7d?.count || 0,
        notes30d: notes30d?.count || 0,
        totalLikes: totalLikes?.count || 0,
        totalAdminUpvotes: totalAdminUpvotes?.count || 0,
        totalChatSessions: totalChatSessions?.count || 0,
        chatSessions7d: chatSessions7d?.count || 0,
        chatSessions30d: chatSessions30d?.count || 0,
        suspendedUsers: suspendedUsers?.count || 0,
        warnedUsers: warnedUsers?.count || 0,
      },
      topContributors: topContributors || [],
      usersByClass: usersByClass || [],
      notesByClass: notesByClass || [],
      popularSubjects: popularSubjects || [],
      dailyActivity: dailyActivity || [],
      dailyRegistrations: dailyRegistrations || [],
    });
  } catch (error: any) {
    return jsonResponse({ error: 'Failed to fetch usage statistics' }, 500);
  }
}

export async function verifyAdmin(request: Request, env: Env) {
  const body = (await request.json()) as any;
  const { email, password } = body;

  if (email && email.endsWith('@notarium.site') && password === env.ADMIN_PASSWORD) {
    return jsonResponse({ success: true, isAdmin: true }, 200, env);
  }

  return jsonResponse({ success: false, isAdmin: false, error: 'Invalid credentials' }, 401, env);
}

export async function adminUpvoteNote(noteId: string, request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  await env.DB.prepare(
    'UPDATE notes SET admin_upvotes = admin_upvotes + 1, updated_at = datetime("now") WHERE id = ?',
  )
    .bind(noteId)
    .run();

  const note = await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?')
    .bind(noteId)
    .first();
  if (note) {
    await env.DB.prepare(
      'UPDATE users SET total_admin_upvotes = total_admin_upvotes + 1 WHERE id = ?',
    )
      .bind(note.author_id)
      .run();
  }

  return jsonResponse({ success: true });
}

export async function adminLikeNote(noteId: string, request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;
  const { results } = await env.DB.prepare(
    'SELECT * FROM admin_note_likes WHERE note_id = ? AND admin_id = ?',
  )
    .bind(noteId, adminUser.id)
    .all();

  if (results.length > 0) {
    const note = (await env.DB.prepare('SELECT author_id, title FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;

    await env.DB.batch([
      env.DB.prepare('DELETE FROM admin_note_likes WHERE note_id = ? AND admin_id = ?').bind(
        noteId,
        adminUser.id,
      ),
      env.DB.prepare('UPDATE notes SET admin_upvotes = admin_upvotes - 1 WHERE id = ?').bind(
        noteId,
      ),
      ...(note && note.author_id
        ? [
            env.DB.prepare(
              'UPDATE users SET total_admin_upvotes = total_admin_upvotes - 1 WHERE id = ?',
            ).bind(note.author_id),
          ]
        : []),
    ]);

    await logAdminActivity(
      env,
      adminUser.id,
      adminUser.email,
      'unlike',
      'note',
      parseInt(noteId),
      `Removed admin like from note: ${note?.title || noteId}`,
    );

    return jsonResponse({ liked: false });
  } else {
    const note = (await env.DB.prepare('SELECT author_id, title FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;

    await env.DB.batch([
      env.DB.prepare('INSERT INTO admin_note_likes (note_id, admin_id) VALUES (?, ?)').bind(
        noteId,
        adminUser.id,
      ),
      env.DB.prepare('UPDATE notes SET admin_upvotes = admin_upvotes + 1 WHERE id = ?').bind(
        noteId,
      ),
      ...(note && note.author_id
        ? [
            env.DB.prepare(
              'UPDATE users SET total_admin_upvotes = total_admin_upvotes + 1 WHERE id = ?',
            ).bind(note.author_id),
          ]
        : []),
    ]);

    await logAdminActivity(
      env,
      adminUser.id,
      adminUser.email,
      'like',
      'note',
      parseInt(noteId),
      `Admin liked note: ${note?.title || noteId} (+4.5 points to author)`,
    );

    return jsonResponse({ liked: true });
  }
}

export async function deleteNote(noteId: string, request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  try {
    const note = (await env.DB.prepare(
      'SELECT id, author_id, subject_id, title FROM notes WHERE id = ?',
    )
      .bind(noteId)
      .first()) as any;

    if (!note) {
      return jsonResponse({ error: 'Note not found' }, 404);
    }

    await env.DB.batch([
      env.DB.prepare('DELETE FROM note_likes WHERE note_id = ?').bind(noteId),
      env.DB.prepare('DELETE FROM admin_note_likes WHERE note_id = ?').bind(noteId),
      env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(noteId),
      env.DB.prepare('UPDATE subjects SET note_count = MAX(0, note_count - 1) WHERE id = ?').bind(
        note.subject_id,
      ),
      env.DB.prepare(
        'UPDATE users SET notes_uploaded = MAX(0, notes_uploaded - 1) WHERE id = ?',
      ).bind(note.author_id),
    ]);

    await logAdminActivity(
      env,
      adminUser.id,
      adminUser.email,
      'delete',
      'note',
      parseInt(noteId),
      `Deleted note: ${note.title || noteId}`,
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    return jsonResponse({ error: 'Failed to delete note' }, 500);
  }
}

export async function updateNote(noteId: string, request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  try {
    const body = (await request.json()) as any;

    const originalNote = (await env.DB.prepare('SELECT title FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;

    const updates: string[] = [];
    const values: any[] = [];
    const changedFields: string[] = [];

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
      changedFields.push('title');
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
      changedFields.push('description');
    }
    if (body.content !== undefined) {
      updates.push('content = ?');
      values.push(body.content);
      changedFields.push('content');
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(body.tags));
      changedFields.push('tags');
    }
    if (body.extracted_text !== undefined) {
      updates.push('extracted_text = ?');
      values.push(body.extracted_text);
      changedFields.push('extracted_text');
    }
    if (body.summary !== undefined) {
      updates.push('summary = ?');
      values.push(body.summary);
      changedFields.push('summary');
    }
    if (body.image_path !== undefined) {
      updates.push('image_path = ?');
      values.push(body.image_path);
      changedFields.push('image_path');
    }

    if (updates.length === 0) {
      return jsonResponse({ error: 'No fields to update' }, 400);
    }

    updates.push('updated_at = datetime("now")');
    values.push(noteId);

    const query = `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query)
      .bind(...values)
      .run();

    const updatedNote = await env.DB.prepare('SELECT * FROM notes WHERE id = ?')
      .bind(noteId)
      .first();

    await logAdminActivity(
      env,
      adminUser.id,
      adminUser.email,
      'edit',
      'note',
      parseInt(noteId),
      `Edited note: ${originalNote?.title || noteId} (changed: ${changedFields.join(', ')})`,
    );

    return jsonResponse({ success: true, note: updatedNote });
  } catch (error: any) {
    return jsonResponse({ error: 'Failed to update note' }, 500);
  }
}

export async function suspendUser(userId: string, request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  const body = (await request.json()) as any;
  const { days, reason } = body;
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + (days || 7));
  const endDateISO = endDate.toISOString();

  await env.DB.prepare(
    'UPDATE users SET suspended = 1, suspension_end_date = ?, suspension_reason = ?, updated_at = datetime("now") WHERE id = ?',
  )
    .bind(endDateISO, reason || 'Suspended by admin', userId)
    .run();

  return jsonResponse({ success: true, suspension_end_date: endDateISO, reason });
}

export async function warnUser(userId: string, request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  const body = (await request.json()) as any;
  const { message } = body;
  const warningMessage = message || 'Warning issued by admin';

  await env.DB.prepare(
    'UPDATE users SET warning = 1, warning_message = ?, warning_first_viewed = NULL, warning_view_count = 0, updated_at = datetime("now") WHERE id = ?',
  )
    .bind(warningMessage, userId)
    .run();

  try {
    await env.DB.prepare(
      `
      INSERT INTO notifications (sender_id, target_type, target_user_id, notification_type, title, message, created_at)
      VALUES (?, 'user', ?, 'warning', 'Admin Warning', ?, datetime('now'))
    `,
    )
      .bind(adminUser.id, userId, warningMessage)
      .run();
  } catch (e) {}

  return jsonResponse({ success: true, message: warningMessage });
}

export async function removeUser(userId: string, request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  try {
    const likesResult = await env.DB.prepare('DELETE FROM note_likes WHERE user_id = ?')
      .bind(userId)
      .run();

    const adminUpvotesResult = await env.DB.prepare(
      'DELETE FROM admin_note_likes WHERE admin_id = ?',
    )
      .bind(userId)
      .run();

    const activityResult = await env.DB.prepare('DELETE FROM admin_activity_log WHERE admin_id = ?')
      .bind(userId)
      .run();

    await env.DB.prepare(
      `
      UPDATE subjects SET note_count = MAX(0, note_count - 1)
      WHERE id IN (SELECT DISTINCT subject_id FROM notes WHERE author_id = ?)
    `,
    )
      .bind(userId)
      .run();

    await env.DB.prepare('DELETE FROM notes WHERE author_id = ?').bind(userId).run();

    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

    return jsonResponse({ success: true });
  } catch (error: any) {
    return jsonResponse(
      {
        error: 'Failed to delete user: ' + error.message,
        details: error.toString(),
      },
      500,
    );
  }
}

export async function unsuspendUser(userId: string, request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;
  await env.DB.prepare(
    'UPDATE users SET suspended = 0, suspension_end_date = NULL, suspension_reason = NULL, updated_at = datetime("now") WHERE id = ?',
  )
    .bind(userId)
    .run();

  return jsonResponse({ success: true });
}

export async function getAllUsers(request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  try {
    const { results } = await env.DB.prepare(
      `
      SELECT
        id,
        display_name,
        email,
        class,
        role,
        notes_uploaded,
        total_likes,
        total_admin_upvotes,
        COALESCE(diamonds, 0) as diamonds,
        (notes_uploaded + total_likes + total_admin_upvotes) as points,
        suspended,
        suspension_end_date,
        suspension_reason,
        warning,
        warning_message,
        photo_url,
        description,
        created_at
      FROM users
      ORDER BY created_at DESC
    `,
    ).all();

    return jsonResponse({ users: results });
  } catch (error: any) {
    return jsonResponse({ users: [] });
  }
}

export async function getAllNotes(request: Request, env: Env) {
  const adminUser = await requireAdmin(request, env);
  if (adminUser instanceof Response) return adminUser;

  try {
    const { results } = await env.DB.prepare(
      `
      SELECT
        n.id,
        n.title,
        n.description,
        n.content,
        n.extracted_text,
        n.summary,
        n.tags,
        n.image_path,
        n.likes,
        n.admin_upvotes,
        n.subject_id,
        n.author_id,
        n.status,
        n.visibility,
        n.created_at,
        u.display_name as author_name,
        u.class as author_class,
        s.name as subject_name,
        s.name as subject,
        (SELECT COUNT(*) FROM admin_note_likes WHERE note_id = n.id AND admin_id = ?) as admin_liked
      FROM notes n
      LEFT JOIN users u ON n.author_id = u.id
      LEFT JOIN subjects s ON n.subject_id = s.id
      ORDER BY n.created_at DESC
    `,
    )
      .bind(adminUser.id)
      .all();

    results.forEach((note: any) => {});

    return jsonResponse({ notes: results });
  } catch (error: any) {
    return jsonResponse({ notes: [] });
  }
}
