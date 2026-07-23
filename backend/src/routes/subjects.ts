/**
 * Subjects listing and grade-class taxonomy (public listing + admin CRUD + reassignment).
 */
import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getOrCreateUser, requireAdmin } from '../lib/auth';

// Get all subjects
export async function getSubjects(request: Request, env: Env) {
  // Resolve/create the user for auth enforcement (throws if unauthenticated).
  await getOrCreateUser(request, env);

  // Use the denormalized note_count column instead of a per-row correlated subquery.
  const { results } = await env.DB.prepare(
    `
    SELECT id, name, icon, note_count
    FROM subjects
    ORDER BY name
  `,
  ).all();

  return jsonResponse({ subjects: results });
}

// ===== Grade Classes Endpoints =====

export async function getPublicGradeClasses(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, grade, class_name, semester FROM grade_classes WHERE is_active = 1 ORDER BY grade, class_name`,
  ).all();
  const grouped: Record<number, typeof results> = {};
  for (const row of results) {
    const g = (row as any).grade as number;
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(row);
  }
  return jsonResponse({ grade_classes: results, grouped });
}

export async function adminGetGradeClasses(request: Request, env: Env) {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const url = new URL(request.url);
  const grade = url.searchParams.get('grade');
  const active = url.searchParams.get('active');
  let query = `SELECT gc.*, (SELECT COUNT(*) FROM users u WHERE u.grade_class_id = gc.id) as student_count FROM grade_classes gc WHERE 1=1`;
  const params: (string | number)[] = [];
  if (grade) {
    query += ' AND gc.grade = ?';
    params.push(Number(grade));
  }
  if (active !== null) {
    query += ' AND gc.is_active = ?';
    params.push(Number(active));
  }
  query += ' ORDER BY gc.grade, gc.class_name';
  const { results } = await env.DB.prepare(query)
    .bind(...params)
    .all();
  return jsonResponse({ grade_classes: results });
}

export async function adminCreateGradeClass(request: Request, env: Env) {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const body = (await request.json()) as any;
  const { grade, class_name, semester = '' } = body;
  if (!grade || !class_name)
    return jsonResponse({ error: 'grade and class_name are required' }, 400, env);
  if (![10, 11, 12].includes(Number(grade)))
    return jsonResponse({ error: 'grade must be 10, 11, or 12' }, 400, env);
  try {
    const row = await env.DB.prepare(
      `INSERT INTO grade_classes (grade, class_name, semester, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, datetime('now'), datetime('now')) RETURNING *`,
    )
      .bind(Number(grade), String(class_name), semester)
      .first();
    return jsonResponse({ grade_class: row }, 201, env);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE'))
      return jsonResponse({ error: 'Class already exists for this grade and semester' }, 409, env);
    return jsonResponse({ error: e.message || 'Failed to create class' }, 500, env);
  }
}

export async function adminUpdateGradeClass(id: string, request: Request, env: Env) {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const body = (await request.json()) as any;
  const fields: string[] = [];
  const params: (string | number)[] = [];
  if (body.class_name !== undefined) {
    fields.push('class_name = ?');
    params.push(body.class_name);
  }
  if (body.semester !== undefined) {
    fields.push('semester = ?');
    params.push(body.semester);
  }
  if (body.is_active !== undefined) {
    fields.push('is_active = ?');
    params.push(body.is_active ? 1 : 0);
  }
  if (fields.length === 0) return jsonResponse({ error: 'No fields to update' }, 400, env);
  fields.push("updated_at = datetime('now')");
  params.push(Number(id));
  await env.DB.prepare(`UPDATE grade_classes SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();
  const row = await env.DB.prepare('SELECT * FROM grade_classes WHERE id = ?')
    .bind(Number(id))
    .first();
  return jsonResponse({ grade_class: row });
}

export async function adminDeleteGradeClass(id: string, request: Request, env: Env) {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const count = (await env.DB.prepare('SELECT COUNT(*) as c FROM users WHERE grade_class_id = ?')
    .bind(Number(id))
    .first()) as any;
  if (count?.c > 0)
    return jsonResponse({ error: 'Cannot delete class with assigned students' }, 409, env);
  await env.DB.prepare('DELETE FROM grade_classes WHERE id = ?').bind(Number(id)).run();
  return jsonResponse({ success: true });
}

export async function adminReassignUserClass(request: Request, env: Env) {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const body = (await request.json()) as any;
  const { user_id, new_class, send_notification = true } = body;
  if (!user_id || !new_class)
    return jsonResponse({ error: 'user_id and new_class are required' }, 400, env);
  const gradeClass = (await env.DB.prepare(
    'SELECT id, grade FROM grade_classes WHERE class_name = ? AND is_active = 1 LIMIT 1',
  )
    .bind(new_class)
    .first()) as any;
  if (!gradeClass) return jsonResponse({ error: 'Invalid class' }, 400, env);
  await env.DB.prepare(
    'UPDATE users SET class = ?, grade = ?, grade_class_id = ?, updated_at = datetime("now") WHERE id = ?',
  )
    .bind(new_class, gradeClass.grade, gradeClass.id, user_id)
    .run();
  if (send_notification) {
    try {
      await env.DB.prepare(
        `
        INSERT INTO notifications (sender_id, target_type, target_user_id, notification_type, title, message, created_at)
        VALUES (?, 'user', ?, 'class_reassignment', 'Class Assignment Updated', ?, datetime('now'))
      `,
      )
        .bind(admin.id, user_id, `You have been moved to class ${new_class}.`)
        .run();
    } catch (e) {}
  }
  return jsonResponse({ success: true });
}
