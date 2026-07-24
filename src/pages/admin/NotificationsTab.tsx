import api from '../../lib/api';
import { darkTheme, cardStyle } from '../../theme';
import type { AdminUser } from './types';

interface NotifForm {
  target_type: string;
  target_grade: string;
  target_class: string;
  target_user_id: string;
  notification_type: string;
  title: string;
  message: string;
}

interface NotificationsTabProps {
  users: AdminUser[];
  gradeClasses: any[];
  notifForm: NotifForm;
  setNotifForm: React.Dispatch<React.SetStateAction<NotifForm>>;
  notifLoading: boolean;
  setNotifLoading: React.Dispatch<React.SetStateAction<boolean>>;
  sentNotifications: any[];
  setSentNotifications: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function NotificationsTab({
  users,
  gradeClasses,
  notifForm,
  setNotifForm,
  notifLoading,
  setNotifLoading,
  sentNotifications,
  setSentNotifications,
}: NotificationsTabProps) {
  return (
    <div>
      <h3
        style={{
          fontSize: '20px',
          fontWeight: '600',
          marginBottom: '16px',
          color: darkTheme.colors.textPrimary,
        }}
      >
        Send Notification
      </h3>
      {/* Compose Form */}
      <div style={{ ...cardStyle, marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginBottom: '4px',
                }}
              >
                Target
              </label>
              <select
                value={notifForm.target_type}
                onChange={(e) =>
                  setNotifForm((p) => ({
                    ...p,
                    target_type: e.target.value,
                    target_grade: '',
                    target_class: '',
                    target_user_id: '',
                  }))
                }
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: darkTheme.colors.cardBg,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: '6px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                }}
              >
                <option value="all">All Users</option>
                <option value="grade">Specific Grade</option>
                <option value="class">Specific Class</option>
                <option value="user">Specific Student</option>
              </select>
            </div>
            {notifForm.target_type === 'grade' && (
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                    marginBottom: '4px',
                  }}
                >
                  Grade
                </label>
                <select
                  value={notifForm.target_grade}
                  onChange={(e) => setNotifForm((p) => ({ ...p, target_grade: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: darkTheme.colors.cardBg,
                    border: `1px solid ${darkTheme.colors.borderColor}`,
                    borderRadius: '6px',
                    color: darkTheme.colors.textPrimary,
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select grade</option>
                  <option value="10">Grade 10</option>
                  <option value="11">Grade 11</option>
                  <option value="12">Grade 12</option>
                </select>
              </div>
            )}
            {notifForm.target_type === 'class' && (
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                    marginBottom: '4px',
                  }}
                >
                  Class
                </label>
                <select
                  value={notifForm.target_class}
                  onChange={(e) => setNotifForm((p) => ({ ...p, target_class: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: darkTheme.colors.cardBg,
                    border: `1px solid ${darkTheme.colors.borderColor}`,
                    borderRadius: '6px',
                    color: darkTheme.colors.textPrimary,
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select class</option>
                  {gradeClasses
                    .filter((gc: any) => gc.is_active)
                    .map((gc: any) => (
                      <option key={gc.id} value={gc.class_name}>
                        {gc.class_name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {notifForm.target_type === 'user' && (
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                    marginBottom: '4px',
                  }}
                >
                  Student
                </label>
                <select
                  value={notifForm.target_user_id}
                  onChange={(e) => setNotifForm((p) => ({ ...p, target_user_id: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: darkTheme.colors.cardBg,
                    border: `1px solid ${darkTheme.colors.borderColor}`,
                    borderRadius: '6px',
                    color: darkTheme.colors.textPrimary,
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select student</option>
                  {users
                    .filter((u) => u.role === 'student')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginBottom: '4px',
                }}
              >
                Type
              </label>
              <select
                value={notifForm.notification_type}
                onChange={(e) => setNotifForm((p) => ({ ...p, notification_type: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: darkTheme.colors.cardBg,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: '6px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                }}
              >
                <option value="announcement">Announcement</option>
                <option value="class_reassignment">Class Reassignment</option>
                <option value="warning">Warning</option>
              </select>
            </div>
          </div>
          <input
            placeholder="Title"
            value={notifForm.title}
            onChange={(e) => setNotifForm((p) => ({ ...p, title: e.target.value }))}
            style={{
              padding: '8px 12px',
              background: darkTheme.colors.cardBg,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '6px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
            }}
          />
          <textarea
            placeholder="Message"
            value={notifForm.message}
            onChange={(e) => setNotifForm((p) => ({ ...p, message: e.target.value }))}
            rows={3}
            style={{
              padding: '8px 12px',
              background: darkTheme.colors.cardBg,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '6px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              resize: 'vertical',
            }}
          />
          <button
            disabled={notifLoading || !notifForm.title || !notifForm.message}
            onClick={async () => {
              setNotifLoading(true);
              try {
                await api.admin.createNotification({
                  target_type: notifForm.target_type,
                  target_grade: notifForm.target_grade ? Number(notifForm.target_grade) : undefined,
                  target_class: notifForm.target_class || undefined,
                  target_user_id: notifForm.target_user_id
                    ? Number(notifForm.target_user_id)
                    : undefined,
                  notification_type: notifForm.notification_type,
                  title: notifForm.title,
                  message: notifForm.message,
                });
                setNotifForm({
                  target_type: 'all',
                  target_grade: '',
                  target_class: '',
                  target_user_id: '',
                  notification_type: 'announcement',
                  title: '',
                  message: '',
                });
                const res = await api.admin.getNotifications();
                setSentNotifications((res as any).notifications || []);
                alert('Notification sent!');
              } catch (e: any) {
                alert(e.message);
              } finally {
                setNotifLoading(false);
              }
            }}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 20px',
              background: darkTheme.colors.accent,
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              opacity: notifLoading ? 0.6 : 1,
            }}
          >
            {notifLoading ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      </div>

      {/* Sent Notifications */}
      <h3
        style={{
          fontSize: '18px',
          fontWeight: '600',
          marginBottom: '12px',
          color: darkTheme.colors.textPrimary,
        }}
      >
        Sent Notifications
      </h3>
      {sentNotifications.length === 0 ? (
        <p style={{ color: darkTheme.colors.textSecondary, fontSize: '14px' }}>
          No notifications sent yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sentNotifications.map((n: any) => (
            <div
              key={n.id}
              style={{
                ...cardStyle,
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: '4px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      background: 'rgba(59,130,246,0.15)',
                      color: '#60a5fa',
                    }}
                  >
                    {n.notification_type}
                  </span>
                  <span style={{ fontSize: '11px', color: darkTheme.colors.textSecondary }}>
                    → {n.target_type}
                    {n.target_grade ? ` ${n.target_grade}` : ''}
                    {n.target_class ? ` ${n.target_class}` : ''}
                  </span>
                  <span style={{ fontSize: '11px', color: darkTheme.colors.textSecondary }}>
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: '600',
                    color: darkTheme.colors.textPrimary,
                    fontSize: '14px',
                  }}
                >
                  {n.title}
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    color: darkTheme.colors.textSecondary,
                    fontSize: '13px',
                  }}
                >
                  {n.message}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm('Delete this notification?')) return;
                  try {
                    await api.admin.deleteNotification(n.id);
                    setSentNotifications((prev) => prev.filter((x: any) => x.id !== n.id));
                  } catch (e: any) {
                    alert(e.message);
                  }
                }}
                style={{
                  padding: '4px 10px',
                  background: 'transparent',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '12px',
                  flexShrink: 0,
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
