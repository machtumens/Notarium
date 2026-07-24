import { useState } from 'react';
import { darkTheme } from '../../theme';
import type { AdminUser } from './types';
import EditUserModal from './EditUserModal';
import { safePhotoUrl } from '../../lib/safeUrl';

interface UserDetailModalProps {
  user: AdminUser | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function UserDetailModal({ user, onClose, onSaved }: UserDetailModalProps) {
  const [editing, setEditing] = useState(false);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: '6px 14px',
                background: darkTheme.colors.accent,
                border: 'none',
                color: '#fff',
                borderRadius: darkTheme.borderRadius.md,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
              }}
            >
              Edit
            </button>
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
        </div>

        {editing && (
          <EditUserModal
            user={user}
            onClose={() => setEditing(false)}
            onSaved={() => {
              onSaved?.();
              onClose();
            }}
          />
        )}

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {/* Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                background: safePhotoUrl(user.photo_url)
                  ? `url('${safePhotoUrl(user.photo_url)}') center/cover`
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
              {!safePhotoUrl(user.photo_url) &&
                (user.display_name || user.name)?.charAt(0).toUpperCase()}
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
