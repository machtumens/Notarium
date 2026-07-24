// Admin sub-role helpers. All admins keep role='admin'; admin_role refines them
// into 'super' (or legacy null = superuser), 'moderator', and 'technical'.
// canModerate gates the moderator/admin dashboard; canOps gates the ops dashboard.

export const canModerate = (u?: { role?: string; admin_role?: string } | null) =>
  u?.role === 'admin' &&
  (u.admin_role == null || u.admin_role === 'super' || u.admin_role === 'moderator');

export const canOps = (u?: { role?: string; admin_role?: string } | null) =>
  u?.role === 'admin' &&
  (u.admin_role == null || u.admin_role === 'super' || u.admin_role === 'technical');
