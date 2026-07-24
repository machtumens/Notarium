import { useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';
import api from '../../lib/api';

const MIN_PASSWORD_LENGTH = 8;

export default function SetPasswordCard() {
  const { currentTheme } = useTheme();
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const cardStyle: React.CSSProperties = {
    background: currentTheme.colors.bgSecondary,
    border: `1px solid ${currentTheme.colors.borderColor}`,
    borderRadius: currentTheme.borderRadius.lg,
    padding: '20px',
    marginTop: '16px',
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: currentTheme.borderRadius.md,
    border: `1px solid ${currentTheme.colors.borderColor}`,
    background: currentTheme.colors.bgTertiary,
    color: currentTheme.colors.textPrimary,
    fontSize: '14px',
    width: '100%',
    marginBottom: '12px',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setBusy(true);
    try {
      const res = await api.setPassword(newPassword);
      setNewPassword('');
      toast.success(res.message || 'Password updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '20px' }}>🔑</span>
        <span
          style={{ fontWeight: '700', fontSize: '15px', color: currentTheme.colors.textPrimary }}
        >
          Password
        </span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: currentTheme.colors.textSecondary }}>
        Set a new password for your account. Useful if you signed in with Google and want a password
        as well.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 characters)"
          autoComplete="new-password"
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={busy || newPassword.length < MIN_PASSWORD_LENGTH}
          style={{
            padding: '8px 16px',
            borderRadius: currentTheme.borderRadius.md,
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            transition: currentTheme.transitions.default,
            background: currentTheme.colors.accent,
            color: '#fff',
            opacity: busy || newPassword.length < MIN_PASSWORD_LENGTH ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Set Password'}
        </button>
      </form>
    </div>
  );
}
