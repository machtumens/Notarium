import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { requireModerator } from '../lib/auth';
import { promoteClassesSchema } from '../lib/validation';
import { currentAcademicYear, nextAcademicYear } from '../lib/academicYear';

export async function getSubjects(_request: Request, env: Env) {
  // Public list — no auth needed and no per-user data. (Previously called
  // getOrCreateUser purely as a side effect, which minted ghost users.)
  const { results } = await env.DB.prepare(
    `
    SELECT id, name, icon, note_count
    FROM subjects
    ORDER BY name
  `,
  ).all();

  return jsonResponse({ subjects: results });
}

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
  const admin = await requireModerator(request, env);
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
  const admin = await requireModerator(request, env);
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
    console.error('adminCreateGradeClass error:', e);
    return jsonResponse({ error: 'Internal server error' }, 500, env);
  }
}

export async function adminUpdateGradeClass(id: string, request: Request, env: Env) {
  const admin = await requireModerator(request, env);
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
  const admin = await requireModerator(request, env);
  if (admin instanceof Response) return admin;
  const count = (await env.DB.prepare('SELECT COUNT(*) as c FROM users WHERE grade_class_id = ?')
    .bind(Number(id))
    .first()) as any;
  if (count?.c > 0)
    return jsonResponse({ error: 'Cannot delete class with assigned students' }, 409, env);
  await env.DB.prepare('DELETE FROM grade_classes WHERE id = ?').bind(Number(id)).run();
  return jsonResponse({ success: true });
}

/**
 * POST /api/admin/grade-classes/promote — advance the selected classes into the
 * new academic year. Admin picks which classes are "ready". Grades 10/11 move
 * up one grade (10.1 -> 11.1); grade 12 classes graduate. Idempotency is the
 * admin's responsibility — running twice promotes twice, so the UI should
 * confirm. Reversible via the existing reassign endpoint.
 */
export async function adminPromoteClasses(request: Request, env: Env) {
  const admin = await requireModerator(request, env);
  if (admin instanceof Response) return admin;

  const parsed = promoteClassesSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonResponse({ error: 'Invalid input', details: parsed.error.errors }, 400, env);
  }
  const { class_ids } = parsed.data;
  const targetYear = parsed.data.new_academic_year || nextAcademicYear(currentAcademicYear());

  const summary: Array<Record<string, unknown>> = [];
  for (const classId of class_ids) {
    const gc = (await env.DB.prepare('SELECT id, grade, class_name FROM grade_classes WHERE id = ?')
      .bind(classId)
      .first()) as any;
    if (!gc) {
      summary.push({ class_id: classId, error: 'not found' });
      continue;
    }

    if (gc.grade >= 12) {
      const res = await env.DB.prepare(
        `UPDATE users SET graduated = 1, academic_year = ?, updated_at = datetime('now') WHERE grade_class_id = ? AND graduated = 0`,
      )
        .bind(targetYear, gc.id)
        .run();
      summary.push({
        class: gc.class_name,
        action: 'graduated',
        students_affected: res.meta?.changes ?? 0,
      });
    } else {
      const suffix = gc.class_name.includes('.') ? gc.class_name.split('.')[1] : gc.class_name;
      const nextClassName = `${gc.grade + 1}.${suffix}`;
      const target = (await env.DB.prepare(
        'SELECT id FROM grade_classes WHERE class_name = ? AND grade = ? AND is_active = 1 LIMIT 1',
      )
        .bind(nextClassName, gc.grade + 1)
        .first()) as any;
      if (!target) {
        summary.push({ class: gc.class_name, error: `target class ${nextClassName} not found` });
        continue;
      }
      const res = await env.DB.prepare(
        `UPDATE users SET grade = ?, class = ?, grade_class_id = ?, academic_year = ?, updated_at = datetime('now') WHERE grade_class_id = ? AND graduated = 0`,
      )
        .bind(gc.grade + 1, nextClassName, target.id, targetYear, gc.id)
        .run();
      summary.push({
        class: gc.class_name,
        action: 'promoted',
        promoted_to: nextClassName,
        students_affected: res.meta?.changes ?? 0,
      });
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO admin_activity_log (admin_id, admin_email, action_type, target_type, details, created_at)
       VALUES (?, ?, 'promote_classes', 'grade_classes', ?, datetime('now'))`,
    )
      .bind(admin.id, admin.email, JSON.stringify({ targetYear, summary }))
      .run();
  } catch (e) {}

  return jsonResponse({ success: true, academic_year: targetYear, summary }, 200, env);
}

export async function adminReassignUserClass(request: Request, env: Env) {
  const admin = await requireModerator(request, env);
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
