import { useState } from 'react';
import { darkTheme } from '../../theme';
import type { AdminUser } from './types';

interface WarnUserModalProps {
  user: AdminUser | null;
  onClose: () => void;
  onWarn: (userId: number, message: string) => Promise<void>;
}

export default function WarnUserModal({ user, onClose, onWarn }: WarnUserModalProps) {
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
