import { useState } from 'react';
import api from '../../lib/api';
import { darkTheme } from '../../theme';
import type { AdminUser } from './types';

interface EditUserModalProps {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.sm,
  color: darkTheme.colors.textPrimary,
  fontSize: '14px',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: darkTheme.colors.textSecondary,
  marginBottom: '4px',
  display: 'block',
};

// Moderator-facing profile editor. Deliberately omits any role field —
// role editing is super-only and stays backend-only for now (Phase 2).
export default function EditUserModal({ user, onClose, onSaved }: EditUserModalProps) {
  const [displayName, setDisplayName] = useState(user.display_name || user.name || '');
  const [userClass, setUserClass] = useState(user.class || '');
  const [diamonds, setDiamonds] = useState(String((user as any).diamonds ?? 0));
  const [learningPoints, setLearningPoints] = useState(String((user as any).learning_points ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.admin.updateUser(user.id, {
        display_name: displayName,
        class: userClass,
        diamonds: Number(diamonds) || 0,
        learning_points: Number(learningPoints) || 0,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
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
          maxWidth: '440px',
          color: darkTheme.colors.textPrimary,
          boxShadow: darkTheme.shadows.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
          }}
        >
          <h2 style={{ fontSize: '18px', margin: 0, fontWeight: '600' }}>Edit User</h2>
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

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Class</label>
            <input
              value={userClass}
              onChange={(e) => setUserClass(e.target.value)}
              placeholder="e.g. 10.1"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Diamonds</label>
              <input
                type="number"
                value={diamonds}
                onChange={(e) => setDiamonds(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Learning Points</label>
              <input
                type="number"
                value={learningPoints}
                onChange={(e) => setLearningPoints(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {error && <div style={{ color: '#fca5a5', fontSize: '13px' }}>{error}</div>}

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}
          >
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '10px 16px',
                background: darkTheme.colors.bgSecondary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                color: darkTheme.colors.textPrimary,
                borderRadius: darkTheme.borderRadius.md,
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 16px',
                background: darkTheme.colors.accent,
                border: 'none',
                color: '#fff',
                borderRadius: darkTheme.borderRadius.md,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
