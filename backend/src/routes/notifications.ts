import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getOrCreateUser, requireModerator } from '../lib/auth';

/** Strip HTML tags and escape angle brackets to prevent stored-XSS. */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function adminCreateNotification(request: Request, env: Env) {
  const admin = await requireModerator(request, env);
  if (admin instanceof Response) return admin;
  const body = (await request.json()) as any;
  const {
    target_type,
    target_grade,
    target_class,
    target_user_id,
    notification_type = 'announcement',
    title,
    message,
  } = body;
  if (!target_type || !title || !message)
    return jsonResponse({ error: 'target_type, title, and message are required' }, 400, env);
  const validTargetTypes = ['all', 'grade', 'class', 'user'];
  const validTypes = ['announcement', 'class_reassignment', 'warning'];
  if (!validTargetTypes.includes(target_type))
    return jsonResponse({ error: 'Invalid target_type' }, 400, env);
  if (!validTypes.includes(notification_type))
    return jsonResponse({ error: 'Invalid notification_type' }, 400, env);
  const safeTitle = stripHtml(String(title));
  const safeMessage = stripHtml(String(message));
  const row = await env.DB.prepare(
    `
    INSERT INTO notifications (sender_id, target_type, target_grade, target_class, target_user_id, notification_type, title, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    RETURNING *
  `,
  )
    .bind(
      admin.id,
      target_type,
      target_grade || null,
      target_class || null,
      target_user_id || null,
      notification_type,
      safeTitle,
      safeMessage,
    )
    .first();
  return jsonResponse({ notification: row }, 201, env);
}

export async function adminGetNotifications(request: Request, env: Env) {
  const admin = await requireModerator(request, env);
  if (admin instanceof Response) return admin;
  const { results } = await env.DB.prepare(
    `SELECT n.*, u.display_name as sender_name FROM notifications n LEFT JOIN users u ON n.sender_id = u.id ORDER BY n.created_at DESC LIMIT 100`,
  ).all();
  return jsonResponse({ notifications: results });
}

export async function adminDeleteNotification(id: string, request: Request, env: Env) {
  const admin = await requireModerator(request, env);
  if (admin instanceof Response) return admin;
  await env.DB.prepare('DELETE FROM notification_reads WHERE notification_id = ?')
    .bind(Number(id))
    .run();
  await env.DB.prepare('DELETE FROM notifications WHERE id = ?').bind(Number(id)).run();
  return jsonResponse({ success: true });
}

export async function getUserNotifications(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  const { results } = await env.DB.prepare(
    `
    SELECT n.*,
      CASE WHEN nr.id IS NOT NULL THEN 1 ELSE 0 END as is_read
    FROM notifications n
    LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
    WHERE n.target_type = 'all'
      OR (n.target_type = 'grade' AND n.target_grade = ?)
      OR (n.target_type = 'class' AND n.target_class = ?)
      OR (n.target_type = 'user' AND n.target_user_id = ?)
    ORDER BY n.created_at DESC
    LIMIT 50
  `,
  )
    .bind(user.id, user.grade || -1, user.class || '', user.id)
    .all();
  return jsonResponse({ notifications: results });
}

export async function getUnreadNotificationCount(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  const row = (await env.DB.prepare(
    `
    SELECT COUNT(*) as count FROM notifications n
    WHERE (
      n.target_type = 'all'
      OR (n.target_type = 'grade' AND n.target_grade = ?)
      OR (n.target_type = 'class' AND n.target_class = ?)
      OR (n.target_type = 'user' AND n.target_user_id = ?)
    )
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr WHERE nr.notification_id = n.id AND nr.user_id = ?
    )
  `,
  )
    .bind(user.grade || -1, user.class || '', user.id, user.id)
    .first()) as any;
  return jsonResponse({ count: row?.count || 0 });
}

export async function markNotificationRead(notificationId: string, request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at) VALUES (?, ?, datetime('now'))`,
    )
      .bind(Number(notificationId), user.id)
      .run();
  } catch (e) {}
  return jsonResponse({ success: true });
}

export async function markAllNotificationsRead(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  await env.DB.prepare(
    `
    INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at)
    SELECT n.id, ?, datetime('now') FROM notifications n
    WHERE (
      n.target_type = 'all'
      OR (n.target_type = 'grade' AND n.target_grade = ?)
      OR (n.target_type = 'class' AND n.target_class = ?)
      OR (n.target_type = 'user' AND n.target_user_id = ?)
    )
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr WHERE nr.notification_id = n.id AND nr.user_id = ?
    )
  `,
  )
    .bind(user.id, user.grade || -1, user.class || '', user.id, user.id)
    .run();
  return jsonResponse({ success: true });
}
