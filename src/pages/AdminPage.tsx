import { useState, useEffect } from 'react';
import api from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import AdminNoteEditModal from '../components/AdminNoteEditModal';
import AdminUsageReport from './AdminUsageReport';
import { darkTheme, cardStyle } from '../theme';

interface AdminUser {
  id: number;
  name: string;
  display_name?: string;
  email: string;
  class: string;
  role: string;
  suspended?: number;
  suspension_end_date?: string;
  suspension_reason?: string;
  warning?: number;
  warning_message?: string;
  notes_count?: number;
  notes_uploaded?: number;
  points?: number;
  total_likes?: number;
  total_admin_upvotes?: number;
  photo_url?: string;
}

interface AdminNote {
  id: number;
  title: string;
  description: string;
  author_name: string;
  author_id: number;
  subject: string;
  subject_id: number;
  subject_name?: string;
  image_path?: string;
  tags?: string | string[];
  likes: number;
  admin_upvotes: number;
  created_at: string;
  admin_liked?: boolean;
}

interface SuspendUserModalProps {
  user: AdminUser | null;
  onClose: () => void;
  onSuspend: (userId: number, days: number, reason: string) => Promise<void>;
}

function SuspendUserModal({ user, onClose, onSuspend }: SuspendUserModalProps) {
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSuspend(user.id, days, reason);
      onClose();
    } catch (error) {
      alert('Failed to suspend user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1002,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: darkTheme.colors.bgPrimary,
          borderRadius: darkTheme.borderRadius.lg,
          width: '100%',
          maxWidth: '500px',
          color: darkTheme.colors.textPrimary,
          boxShadow: darkTheme.shadows.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px',
            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
          }}
        >
          <h2 style={{ fontSize: '20px', margin: 0, fontWeight: '600' }}>Suspend User</h2>
          <button
            onClick={onClose}
            style={{
              fontSize: '24px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: darkTheme.colors.textSecondary,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{ fontSize: '14px', color: darkTheme.colors.textPrimary, marginBottom: '8px' }}
            >
              User: <strong>{user.display_name || user.name}</strong>
            </div>
            <div style={{ fontSize: '13px', color: darkTheme.colors.textSecondary }}>
              {user.email}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}
            >
              Suspension Duration (days)
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                background: darkTheme.colors.bgSecondary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: darkTheme.borderRadius.md,
                color: darkTheme.colors.textPrimary,
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}
            >
              Reason / Warning Message
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter the reason for suspension (visible to user)..."
              required
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: darkTheme.colors.bgSecondary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: darkTheme.borderRadius.md,
                color: darkTheme.colors.textPrimary,
                fontSize: '14px',
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: darkTheme.colors.bgSecondary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                color: darkTheme.colors.textPrimary,
                borderRadius: darkTheme.borderRadius.md,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                background: 'rgba(245, 158, 11, 0.9)',
                border: 'none',
                color: 'white',
                borderRadius: darkTheme.borderRadius.md,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? 'Suspending...' : `Suspend for ${days} day${days !== 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface WarnUserModalProps {
  user: AdminUser | null;
  onClose: () => void;
  onWarn: (userId: number, message: string) => Promise<void>;
}

function WarnUserModal({ user, onClose, onWarn }: WarnUserModalProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onWarn(user.id, message);
      onClose();
    } catch (error) {
      alert('Failed to warn user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1002,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: darkTheme.colors.bgPrimary,
          borderRadius: darkTheme.borderRadius.lg,
          width: '100%',
          maxWidth: '500px',
          color: darkTheme.colors.textPrimary,
          boxShadow: darkTheme.shadows.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px',
            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
          }}
        >
          <h2 style={{ fontSize: '20px', margin: 0, fontWeight: '600' }}>Warn User</h2>
          <button
            onClick={onClose}
            style={{
              fontSize: '24px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: darkTheme.colors.textSecondary,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{ fontSize: '14px', color: darkTheme.colors.textPrimary, marginBottom: '8px' }}
            >
              User: <strong>{user.display_name || user.name}</strong>
            </div>
            <div style={{ fontSize: '13px', color: darkTheme.colors.textSecondary }}>
              {user.email}
            </div>
          </div>

          <div
            style={{
              marginBottom: '16px',
              padding: '12px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: darkTheme.borderRadius.md,
            }}
          >
            <div style={{ fontSize: '13px', color: '#fbbf24' }}>
              Warnings show a yellow banner but don't block any actions. Use this for first-time
              offenses or reminders.
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}
            >
              Warning Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter the warning message (visible to user)..."
              required
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: darkTheme.colors.bgSecondary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: darkTheme.borderRadius.md,
                color: darkTheme.colors.textPrimary,
                fontSize: '14px',
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: darkTheme.colors.bgSecondary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                color: darkTheme.colors.textPrimary,
                borderRadius: darkTheme.borderRadius.md,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                background: 'rgba(245, 158, 11, 0.9)',
                border: 'none',
                color: 'white',
                borderRadius: darkTheme.borderRadius.md,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? 'Sending...' : 'Send Warning'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface UserDetailModalProps {
  user: AdminUser | null;
  onClose: () => void;
}

function UserDetailModal({ user, onClose }: UserDetailModalProps) {
  if (!user) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: darkTheme.colors.bgPrimary,
          borderRadius: darkTheme.borderRadius.lg,
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: darkTheme.colors.textPrimary,
          boxShadow: darkTheme.shadows.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px',
            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
          }}
        >
          <h2 style={{ fontSize: '20px', margin: 0, fontWeight: '600' }}>User Details</h2>
          <button
            onClick={onClose}
            style={{
              fontSize: '24px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: darkTheme.colors.textSecondary,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {/* Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                background: user.photo_url
                  ? `url('${user.photo_url}') center/cover`
                  : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '24px',
              }}
            >
              {!user.photo_url && (user.display_name || user.name)?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
                {user.display_name || user.name}
              </h3>
              <p
                style={{
                  margin: '4px 0 0 0',
                  color: darkTheme.colors.textSecondary,
                  fontSize: '14px',
                }}
              >
                {user.email}
              </p>
            </div>
          </div>

          {/* Stats Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                padding: '16px',
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.md,
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#fbbf24' }}>
                {(user as any).points || 0}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                }}
              >
                Total Points
              </div>
            </div>
            <div
              style={{
                padding: '16px',
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.md,
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: '700', color: darkTheme.colors.accent }}>
                {user.points || 0}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                }}
              >
                Points
              </div>
            </div>
            <div
              style={{
                padding: '16px',
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.md,
              }}
            >
              <div
                style={{ fontSize: '24px', fontWeight: '700', color: darkTheme.colors.textPrimary }}
              >
                {user.notes_uploaded || user.notes_count || 0}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                }}
              >
                Notes Uploaded
              </div>
            </div>
            <div
              style={{
                padding: '16px',
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.md,
              }}
            >
              <div
                style={{ fontSize: '24px', fontWeight: '700', color: darkTheme.colors.textPrimary }}
              >
                {user.total_likes || 0}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                }}
              >
                Total Likes
              </div>
            </div>
            <div
              style={{
                padding: '16px',
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.md,
              }}
            >
              <div
                style={{ fontSize: '24px', fontWeight: '700', color: darkTheme.colors.textPrimary }}
              >
                {user.total_admin_upvotes || 0}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                }}
              >
                Admin Likes
              </div>
            </div>
          </div>

          {/* Info */}
          <div
            style={{
              padding: '16px',
              background: darkTheme.colors.bgSecondary,
              borderRadius: darkTheme.borderRadius.md,
              marginBottom: '20px',
            }}
          >
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginBottom: '4px',
                }}
              >
                Class
              </div>
              <div style={{ fontSize: '14px', fontWeight: '500' }}>{user.class}</div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginBottom: '4px',
                }}
              >
                Role
              </div>
              <div style={{ fontSize: '14px', fontWeight: '500', textTransform: 'capitalize' }}>
                {user.role}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginBottom: '4px',
                }}
              >
                Status
              </div>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: darkTheme.borderRadius.sm,
                  background: user.suspended ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                  color: user.suspended ? '#fca5a5' : '#86efac',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                {user.suspended ? 'Suspended' : 'Active'}
              </span>
            </div>
          </div>

          {/* Suspension Details */}
          {user.suspended && (user.suspension_end_date || user.suspension_reason) && (
            <div
              style={{
                padding: '16px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: darkTheme.borderRadius.md,
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#fca5a5',
                  marginBottom: '12px',
                }}
              >
                Suspension Details
              </div>
              {user.suspension_end_date && (
                <div style={{ marginBottom: '8px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: darkTheme.colors.textSecondary,
                      marginBottom: '4px',
                    }}
                  >
                    Suspended Until
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '500' }}>
                    {new Date(user.suspension_end_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              )}
              {user.suspension_reason && (
                <div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: darkTheme.colors.textSecondary,
                      marginBottom: '4px',
                    }}
                  >
                    Reason
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    {user.suspension_reason}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'classes' | 'notifications' | 'usage'>(
    'users',
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [gradeClasses, setGradeClasses] = useState<any[]>([]);
  const [classFormData, setClassFormData] = useState({ grade: '', class_name: '', semester: '' });
  const [classActionLoading, setClassActionLoading] = useState(false);
  const [sentNotifications, setSentNotifications] = useState<any[]>([]);
  const [notifForm, setNotifForm] = useState({
    target_type: 'all',
    target_grade: '',
    target_class: '',
    target_user_id: '',
    notification_type: 'announcement',
    title: '',
    message: '',
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [suspendingUser, setSuspendingUser] = useState<AdminUser | null>(null);
  const [warningUser, setWarningUser] = useState<AdminUser | null>(null);
  const [showActivityLog, setShowActivityLog] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the mount effect; behavior-preserving
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, logsData, classesData, notifsData] = await Promise.all([
        api.admin.getUsers(),
        loadActivityLogs(),
        api.admin.getGradeClasses().catch(() => ({ grade_classes: [] })),
        api.admin.getNotifications().catch(() => ({ notifications: [] })),
      ]);
      setUsers(usersData.users || []);
      setActivityLogs(logsData);
      setGradeClasses((classesData as any).grade_classes || []);
      setSentNotifications((notifsData as any).notifications || []);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    try {
      const response = await api.request('/api/admin/activity-log?limit=50', {
        method: 'GET',
      });
      return response.logs || [];
    } catch (error) {
      console.error('Failed to load activity logs:', error);
      return [];
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      setActionLoading(userId);
      await api.admin.deleteUser(userId);
      setUsers(users.filter((u) => u.id !== userId));
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspendUser = async (userId: number, days: number, reason: string) => {
    try {
      setActionLoading(userId);
      const response = await api.admin.suspendUser(userId, days, reason);
      // Reload data to get updated suspension info
      await loadData();
    } catch (error) {
      console.error('Failed to suspend user:', error);
      throw error;
    } finally {
      setActionLoading(null);
    }
  };

  const handleWarnUser = async (userId: number, message: string) => {
    try {
      setActionLoading(userId);
      const response = await api.admin.warnUser(userId, message);
      // Reload data to get updated warning info
      await loadData();
    } catch (error) {
      console.error('Failed to warn user:', error);
      throw error;
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnsuspendUser = async (userId: number) => {
    if (!confirm('Are you sure you want to remove the suspension from this user?')) {
      return;
    }
    try {
      setActionLoading(userId);
      const response = await api.admin.unsuspendUser(userId);
      // Reload data to get updated suspension info
      await loadData();
    } catch (error) {
      console.error('Failed to unsuspend user:', error);
      alert('Failed to unsuspend user');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <h2
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '24px',
          color: darkTheme.colors.textPrimary,
        }}
      >
        Admin Dashboard
      </h2>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: `2px solid ${darkTheme.colors.borderColor}`,
        }}
      >
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            color: activeTab === 'users' ? darkTheme.colors.accent : darkTheme.colors.textSecondary,
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom:
              activeTab === 'users'
                ? `3px solid ${darkTheme.colors.accent}`
                : '3px solid transparent',
            marginBottom: '-2px',
            transition: darkTheme.transitions.default,
          }}
        >
          Users & Activity
        </button>
        <button
          onClick={() => setActiveTab('classes')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            color:
              activeTab === 'classes' ? darkTheme.colors.accent : darkTheme.colors.textSecondary,
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom:
              activeTab === 'classes'
                ? `3px solid ${darkTheme.colors.accent}`
                : '3px solid transparent',
            marginBottom: '-2px',
            transition: darkTheme.transitions.default,
          }}
        >
          Classes
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            color:
              activeTab === 'notifications'
                ? darkTheme.colors.accent
                : darkTheme.colors.textSecondary,
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom:
              activeTab === 'notifications'
                ? `3px solid ${darkTheme.colors.accent}`
                : '3px solid transparent',
            marginBottom: '-2px',
            transition: darkTheme.transitions.default,
          }}
        >
          Notifications
        </button>
        <button
          onClick={() => setActiveTab('usage')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            color: activeTab === 'usage' ? darkTheme.colors.accent : darkTheme.colors.textSecondary,
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom:
              activeTab === 'usage'
                ? `3px solid ${darkTheme.colors.accent}`
                : '3px solid transparent',
            marginBottom: '-2px',
            transition: darkTheme.transitions.default,
          }}
        >
          Usage Report
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'usage' ? (
        <AdminUsageReport />
      ) : activeTab === 'classes' ? (
        <div>
          <h3
            style={{
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '16px',
              color: darkTheme.colors.textPrimary,
            }}
          >
            Class Management
          </h3>
          {/* Add Class Form */}
          <div style={{ ...cardStyle, marginBottom: '24px', padding: '20px' }}>
            <h4
              style={{
                color: darkTheme.colors.textPrimary,
                marginBottom: '12px',
                fontSize: '15px',
                fontWeight: '600',
              }}
            >
              Add New Class
            </h4>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <select
                value={classFormData.grade}
                onChange={(e) => setClassFormData((p) => ({ ...p, grade: e.target.value }))}
                style={{
                  padding: '8px 12px',
                  background: darkTheme.colors.cardBg,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: '6px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                }}
              >
                <option value="">Grade</option>
                <option value="10">Grade 10</option>
                <option value="11">Grade 11</option>
                <option value="12">Grade 12</option>
              </select>
              <input
                placeholder="Class name (e.g. 10.4)"
                value={classFormData.class_name}
                onChange={(e) => setClassFormData((p) => ({ ...p, class_name: e.target.value }))}
                style={{
                  padding: '8px 12px',
                  background: darkTheme.colors.cardBg,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: '6px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                  flex: 1,
                  minWidth: '140px',
                }}
              />
              <input
                placeholder="Semester (e.g. 2024/2025-1)"
                value={classFormData.semester}
                onChange={(e) => setClassFormData((p) => ({ ...p, semester: e.target.value }))}
                style={{
                  padding: '8px 12px',
                  background: darkTheme.colors.cardBg,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: '6px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                  flex: 1,
                  minWidth: '160px',
                }}
              />
              <button
                disabled={classActionLoading || !classFormData.grade || !classFormData.class_name}
                onClick={async () => {
                  setClassActionLoading(true);
                  try {
                    await api.admin.createGradeClass({
                      grade: Number(classFormData.grade),
                      class_name: classFormData.class_name,
                      semester: classFormData.semester,
                    });
                    setClassFormData({ grade: '', class_name: '', semester: '' });
                    const res = await api.admin.getGradeClasses();
                    setGradeClasses((res as any).grade_classes || []);
                  } catch (e: any) {
                    alert(e.message);
                  } finally {
                    setClassActionLoading(false);
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: darkTheme.colors.accent,
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  opacity: classActionLoading ? 0.6 : 1,
                }}
              >
                {classActionLoading ? 'Adding...' : 'Add Class'}
              </button>
            </div>
          </div>

          {/* Class List grouped by grade */}
          {[10, 11, 12].map((grade) => {
            const gradeList = gradeClasses.filter((gc: any) => gc.grade === grade);
            return (
              <div key={grade} style={{ ...cardStyle, marginBottom: '16px', padding: '20px' }}>
                <h4
                  style={{
                    color: darkTheme.colors.textPrimary,
                    marginBottom: '12px',
                    fontWeight: '600',
                  }}
                >
                  Grade {grade}
                </h4>
                {gradeList.length === 0 ? (
                  <p style={{ color: darkTheme.colors.textSecondary, fontSize: '13px' }}>
                    No classes for Grade {grade}
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ color: darkTheme.colors.textSecondary, textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>Class</th>
                        <th style={{ padding: '6px 8px' }}>Semester</th>
                        <th style={{ padding: '6px 8px' }}>Students</th>
                        <th style={{ padding: '6px 8px' }}>Status</th>
                        <th style={{ padding: '6px 8px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradeList.map((gc: any) => (
                        <tr
                          key={gc.id}
                          style={{ borderTop: `1px solid ${darkTheme.colors.borderColor}` }}
                        >
                          <td
                            style={{
                              padding: '8px',
                              color: darkTheme.colors.textPrimary,
                              fontWeight: '500',
                            }}
                          >
                            {gc.class_name}
                          </td>
                          <td style={{ padding: '8px', color: darkTheme.colors.textSecondary }}>
                            {gc.semester || '—'}
                          </td>
                          <td style={{ padding: '8px', color: darkTheme.colors.textSecondary }}>
                            {gc.student_count ?? 0}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                background: gc.is_active
                                  ? 'rgba(34,197,94,0.15)'
                                  : 'rgba(156,163,175,0.15)',
                                color: gc.is_active ? '#4ade80' : '#9ca3af',
                                fontWeight: '600',
                              }}
                            >
                              {gc.is_active ? 'Active' : 'Archived'}
                            </span>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <button
                              onClick={async () => {
                                setClassActionLoading(true);
                                try {
                                  await api.admin.updateGradeClass(gc.id, {
                                    is_active: gc.is_active ? 0 : 1,
                                  });
                                  const res = await api.admin.getGradeClasses();
                                  setGradeClasses((res as any).grade_classes || []);
                                } finally {
                                  setClassActionLoading(false);
                                }
                              }}
                              style={{
                                padding: '4px 10px',
                                background: 'transparent',
                                border: `1px solid ${darkTheme.colors.borderColor}`,
                                borderRadius: '4px',
                                color: darkTheme.colors.textSecondary,
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              {gc.is_active ? 'Archive' : 'Restore'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {/* Reassign User */}
          <div style={{ ...cardStyle, padding: '20px' }}>
            <h4
              style={{
                color: darkTheme.colors.textPrimary,
                marginBottom: '12px',
                fontSize: '15px',
                fontWeight: '600',
              }}
            >
              Reassign Student to Class
            </h4>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                style={{
                  padding: '8px 12px',
                  background: darkTheme.colors.cardBg,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: '6px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                  flex: 1,
                  minWidth: '160px',
                }}
                id="reassign-user-select"
              >
                <option value="">Select student</option>
                {users
                  .filter((u) => u.role === 'student')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.class || 'No class'})
                    </option>
                  ))}
              </select>
              <select
                style={{
                  padding: '8px 12px',
                  background: darkTheme.colors.cardBg,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: '6px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                  flex: 1,
                  minWidth: '140px',
                }}
                id="reassign-class-select"
              >
                <option value="">New class</option>
                {gradeClasses
                  .filter((gc: any) => gc.is_active)
                  .map((gc: any) => (
                    <option key={gc.id} value={gc.class_name}>
                      {gc.class_name}
                    </option>
                  ))}
              </select>
              <button
                disabled={classActionLoading}
                onClick={async () => {
                  const userId = (
                    document.getElementById('reassign-user-select') as HTMLSelectElement
                  )?.value;
                  const newClass = (
                    document.getElementById('reassign-class-select') as HTMLSelectElement
                  )?.value;
                  if (!userId || !newClass) {
                    alert('Please select a student and a class');
                    return;
                  }
                  setClassActionLoading(true);
                  try {
                    await api.admin.reassignUserClass({
                      user_id: Number(userId),
                      new_class: newClass,
                    });
                    await loadData();
                    alert('Student reassigned successfully');
                  } catch (e: any) {
                    alert(e.message);
                  } finally {
                    setClassActionLoading(false);
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: darkTheme.colors.accent,
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                }}
              >
                Reassign
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'notifications' ? (
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
                      onChange={(e) =>
                        setNotifForm((p) => ({ ...p, target_grade: e.target.value }))
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
                      onChange={(e) =>
                        setNotifForm((p) => ({ ...p, target_class: e.target.value }))
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
                      onChange={(e) =>
                        setNotifForm((p) => ({ ...p, target_user_id: e.target.value }))
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
                    onChange={(e) =>
                      setNotifForm((p) => ({ ...p, notification_type: e.target.value }))
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
                      target_grade: notifForm.target_grade
                        ? Number(notifForm.target_grade)
                        : undefined,
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
      ) : loading ? (
        <LoadingSpinner message="Loading admin data..." />
      ) : (
        <div>
          {/* Users Section */}
          <div style={{ marginBottom: '48px' }}>
            <h3
              style={{
                fontSize: '20px',
                fontWeight: '600',
                marginBottom: '16px',
                color: darkTheme.colors.textPrimary,
              }}
            >
              <i
                className="fas fa-users"
                style={{ marginRight: '8px', color: darkTheme.colors.accent }}
              ></i>
              Users ({users.length})
            </h3>
            <div
              style={
                {
                  ...cardStyle,
                  padding: 0,
                  overflow: 'auto',
                  maxHeight: '400px',
                } as React.CSSProperties
              }
            >
              {users.length === 0 ? (
                <div
                  style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  No users found
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '16px',
                    padding: '16px',
                  }}
                >
                  {users.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      style={{
                        padding: '16px',
                        background: darkTheme.colors.bgSecondary,
                        borderRadius: darkTheme.borderRadius.md,
                        border: `1px solid ${darkTheme.colors.borderColor}`,
                        cursor: 'pointer',
                        transition: darkTheme.transitions.default,
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = darkTheme.shadows.lg;
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          marginBottom: '12px',
                        }}
                      >
                        <div
                          style={{
                            width: '48px',
                            height: '48px',
                            background: user.photo_url
                              ? `url('${user.photo_url}') center/cover`
                              : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '18px',
                            flexShrink: 0,
                          }}
                        >
                          {!user.photo_url &&
                            (user.display_name || user.name)?.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: '600',
                              fontSize: '14px',
                              marginBottom: '2px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {user.display_name || user.name}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: darkTheme.colors.textSecondary,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {user.email}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '12px',
                          marginBottom: '8px',
                        }}
                      >
                        <span style={{ color: darkTheme.colors.textSecondary }}>Points:</span>
                        <span style={{ fontWeight: '600', color: '#fbbf24' }}>
                          {(user as any).points || 0}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '12px',
                          marginBottom: '8px',
                        }}
                      >
                        <span style={{ color: darkTheme.colors.textSecondary }}>Total Points:</span>
                        <span style={{ fontWeight: '600', color: darkTheme.colors.accent }}>
                          {user.points || 0}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '12px',
                          marginBottom: '8px',
                        }}
                      >
                        <span style={{ color: darkTheme.colors.textSecondary }}>Notes:</span>
                        <span style={{ fontWeight: '600' }}>
                          {user.notes_uploaded || user.notes_count || 0}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '12px',
                        }}
                      >
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: darkTheme.borderRadius.sm,
                            background: user.suspended
                              ? 'rgba(239, 68, 68, 0.2)'
                              : 'rgba(34, 197, 94, 0.2)',
                            color: user.suspended ? '#fca5a5' : '#86efac',
                            fontSize: '11px',
                            fontWeight: '500',
                          }}
                        >
                          {user.suspended ? 'Suspended' : 'Active'}
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!user.suspended && !user.warning && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setWarningUser(user);
                              }}
                              disabled={actionLoading === user.id}
                              style={{
                                padding: '4px 8px',
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#fbbf24',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                borderRadius: darkTheme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '500',
                              }}
                            >
                              Warn
                            </button>
                          )}
                          {!user.suspended ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSuspendingUser(user);
                              }}
                              disabled={actionLoading === user.id}
                              style={{
                                padding: '4px 8px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: '#fca5a5',
                                border: 'none',
                                borderRadius: darkTheme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '500',
                              }}
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnsuspendUser(user.id);
                              }}
                              disabled={actionLoading === user.id}
                              style={{
                                padding: '4px 8px',
                                background: 'rgba(34, 197, 94, 0.2)',
                                color: '#86efac',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: darkTheme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '500',
                              }}
                            >
                              Unsuspend
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUser(user.id);
                            }}
                            disabled={actionLoading === user.id}
                            style={{
                              padding: '4px 8px',
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#fca5a5',
                              border: 'none',
                              borderRadius: darkTheme.borderRadius.sm,
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: '500',
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Activity Log Section */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h3
                style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  margin: 0,
                  color: darkTheme.colors.textPrimary,
                }}
              >
                <i
                  className="fas fa-history"
                  style={{ marginRight: '8px', color: darkTheme.colors.accent }}
                ></i>
                Activity Log ({activityLogs.length})
              </h3>
              <button
                onClick={() => setShowActivityLog(!showActivityLog)}
                style={{
                  padding: '8px 16px',
                  background: showActivityLog
                    ? darkTheme.colors.accent
                    : darkTheme.colors.bgSecondary,
                  border: 'none',
                  color: '#fff',
                  borderRadius: darkTheme.borderRadius.md,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                }}
              >
                {showActivityLog ? 'Hide Log' : 'Show Log'}
              </button>
            </div>

            {showActivityLog && (
              <div
                style={
                  {
                    ...cardStyle,
                    padding: 0,
                    overflow: 'auto',
                    maxHeight: '500px',
                  } as React.CSSProperties
                }
              >
                {activityLogs.length === 0 ? (
                  <div
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      color: darkTheme.colors.textSecondary,
                    }}
                  >
                    No activity logs yet
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead
                      style={{
                        background: darkTheme.colors.bgSecondary,
                        position: 'sticky',
                        top: 0,
                      }}
                    >
                      <tr>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                            fontWeight: '600',
                            fontSize: '13px',
                          }}
                        >
                          Time
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                            fontWeight: '600',
                            fontSize: '13px',
                          }}
                        >
                          Admin
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                            fontWeight: '600',
                            fontSize: '13px',
                          }}
                        >
                          Action
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                            fontWeight: '600',
                            fontSize: '13px',
                          }}
                        >
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.map((log) => (
                        <tr
                          key={log.id}
                          style={{
                            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                            transition: darkTheme.transitions.default,
                          }}
                          onMouseOver={(e) =>
                            (e.currentTarget.style.background = darkTheme.colors.bgSecondary)
                          }
                          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: '13px',
                              color: darkTheme.colors.textSecondary,
                            }}
                          >
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                            {log.admin_email}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                            <span
                              style={{
                                padding: '4px 10px',
                                borderRadius: darkTheme.borderRadius.sm,
                                background:
                                  log.action_type === 'like'
                                    ? 'rgba(34, 197, 94, 0.2)'
                                    : log.action_type === 'edit'
                                      ? 'rgba(59, 130, 246, 0.2)'
                                      : log.action_type === 'delete'
                                        ? 'rgba(239, 68, 68, 0.2)'
                                        : 'rgba(156, 163, 175, 0.2)',
                                color:
                                  log.action_type === 'like'
                                    ? '#86efac'
                                    : log.action_type === 'edit'
                                      ? '#60a5fa'
                                      : log.action_type === 'delete'
                                        ? '#fca5a5'
                                        : '#d1d5db',
                                fontSize: '11px',
                                fontWeight: '500',
                                textTransform: 'uppercase',
                              }}
                            >
                              {log.action_type}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: '13px',
                              color: darkTheme.colors.textSecondary,
                            }}
                          >
                            {log.details}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedUser && (
        <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
      {warningUser && (
        <WarnUserModal
          user={warningUser}
          onClose={() => setWarningUser(null)}
          onWarn={handleWarnUser}
        />
      )}
      {suspendingUser && (
        <SuspendUserModal
          user={suspendingUser}
          onClose={() => setSuspendingUser(null)}
          onSuspend={handleSuspendUser}
        />
      )}
    </div>
  );
}
