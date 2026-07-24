import { useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../app/AuthContext';
import api from '../../lib/api';
import type { TwoFactorSetup } from '../../types';

type Stage = 'idle' | 'setup' | 'backup';

export default function TwoFactorCard() {
  const { currentTheme } = useTheme();

  // Real 2FA status comes from /api/auth/me via the auth context; after
  // enable/disable we refreshUser() so this derived value stays accurate.
  const { user, refreshUser } = useAuth();
  const enabled = (user?.totp_enabled ?? 0) === 1;
  const [stage, setStage] = useState<Stage>('idle');
  const [busy, setBusy] = useState(false);

  const [setupData, setSetupData] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableValue, setDisableValue] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const cardStyle: React.CSSProperties = {
    background: currentTheme.colors.bgSecondary,
    border: `1px solid ${currentTheme.colors.borderColor}`,
    borderRadius: currentTheme.borderRadius.lg,
    padding: '20px',
    marginTop: '16px',
  };

  const btnBase: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: currentTheme.borderRadius.md,
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: currentTheme.transitions.default,
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: currentTheme.borderRadius.md,
    border: `1px solid ${currentTheme.colors.borderColor}`,
    background: currentTheme.colors.bgTertiary,
    color: currentTheme.colors.textPrimary,
    fontSize: '14px',
    width: '100%',
  };

  const codeBoxStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '14px',
    padding: '10px 12px',
    borderRadius: currentTheme.borderRadius.md,
    background: currentTheme.colors.bgTertiary,
    border: `1px solid ${currentTheme.colors.borderColor}`,
    color: currentTheme.colors.textPrimary,
    wordBreak: 'break-all',
  };

  const handleSetup = async () => {
    setBusy(true);
    try {
      const data = await api.twoFactor.setup();
      setSetupData(data);
      setStage('setup');
      setCode('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await api.twoFactor.enable(code.trim());
      setBackupCodes(res.backup_codes || []);
      setStage('backup');
      setCode('');
      setSetupData(null);
      await refreshUser();
      toast.success('Two-factor authentication enabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!disableValue.trim()) return;
    setBusy(true);
    try {
      // A 6-digit value is treated as a TOTP code; anything else as a password.
      const trimmed = disableValue.trim();
      const isCode = /^\d{6,8}$/.test(trimmed);
      await api.twoFactor.disable(isCode ? { code: trimmed } : { password: trimmed });
      setStage('idle');
      setShowDisable(false);
      setDisableValue('');
      await refreshUser();
      toast.success('Two-factor authentication disabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setBusy(false);
    }
  };

  const copyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      toast.success('Backup codes copied');
    } catch {
      toast.error('Failed to copy backup codes');
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '20px' }}>🔐</span>
        <span
          style={{ fontWeight: '700', fontSize: '15px', color: currentTheme.colors.textPrimary }}
        >
          Two-Factor Authentication
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '11px',
            fontWeight: '600',
            padding: '2px 10px',
            borderRadius: '9999px',
            background: enabled ? 'rgba(74, 222, 128, 0.15)' : 'rgba(148, 163, 184, 0.15)',
            color: enabled ? currentTheme.colors.success : currentTheme.colors.textSecondary,
          }}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {/* Backup codes shown once after enabling */}
      {stage === 'backup' ? (
        <div>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: '13px',
              color: currentTheme.colors.textSecondary,
            }}
          >
            Save these backup codes somewhere safe. Each can be used once if you lose your
            authenticator. They will not be shown again.
          </p>
          <div style={codeBoxStyle}>
            {backupCodes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              style={{ ...btnBase, background: currentTheme.colors.accent, color: '#fff' }}
              onClick={copyBackupCodes}
            >
              Copy codes
            </button>
            <button
              style={{
                ...btnBase,
                background: currentTheme.colors.bgTertiary,
                color: currentTheme.colors.textPrimary,
                border: `1px solid ${currentTheme.colors.borderColor}`,
              }}
              onClick={() => setStage('idle')}
            >
              Done
            </button>
          </div>
        </div>
      ) : stage === 'setup' && setupData ? (
        <div>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: '13px',
              color: currentTheme.colors.textSecondary,
            }}
          >
            Add this secret to your authenticator app (Google Authenticator, Authy) using manual
            entry, then enter the 6-digit code it generates.
          </p>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: '12px',
              color: currentTheme.colors.textSecondary,
            }}
          >
            Secret key:
          </p>
          <div style={{ ...codeBoxStyle, marginBottom: '10px', fontWeight: 700 }}>
            {setupData.secret}
          </div>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: '12px',
              color: currentTheme.colors.textSecondary,
            }}
          >
            Or use this setup URI:
          </p>
          <div style={{ ...codeBoxStyle, marginBottom: '12px', fontSize: '12px' }}>
            {setupData.otpauth_uri}
          </div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter 6-digit code"
            style={{ ...inputStyle, marginBottom: '12px' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={busy || !code.trim()}
              style={{
                ...btnBase,
                background: currentTheme.colors.accent,
                color: '#fff',
                opacity: busy || !code.trim() ? 0.6 : 1,
              }}
              onClick={handleEnable}
            >
              {busy ? 'Verifying…' : 'Verify & Enable'}
            </button>
            <button
              style={{
                ...btnBase,
                background: currentTheme.colors.bgTertiary,
                color: currentTheme.colors.textPrimary,
                border: `1px solid ${currentTheme.colors.borderColor}`,
              }}
              onClick={() => {
                setStage('idle');
                setSetupData(null);
                setCode('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : enabled ? (
        <div>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: '13px',
              color: currentTheme.colors.textSecondary,
            }}
          >
            Two-factor authentication is protecting your account.
          </p>
          {showDisable ? (
            <div>
              <input
                type="text"
                value={disableValue}
                onChange={(e) => setDisableValue(e.target.value)}
                placeholder="Current code or account password"
                style={{ ...inputStyle, marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={busy || !disableValue.trim()}
                  style={{
                    ...btnBase,
                    background: currentTheme.colors.danger,
                    color: '#fff',
                    opacity: busy || !disableValue.trim() ? 0.6 : 1,
                  }}
                  onClick={handleDisable}
                >
                  {busy ? 'Disabling…' : 'Confirm Disable'}
                </button>
                <button
                  style={{
                    ...btnBase,
                    background: currentTheme.colors.bgTertiary,
                    color: currentTheme.colors.textPrimary,
                    border: `1px solid ${currentTheme.colors.borderColor}`,
                  }}
                  onClick={() => {
                    setShowDisable(false);
                    setDisableValue('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              style={{ ...btnBase, background: currentTheme.colors.danger, color: '#fff' }}
              onClick={() => setShowDisable(true)}
            >
              Disable 2FA
            </button>
          )}
        </div>
      ) : (
        <div>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: '13px',
              color: currentTheme.colors.textSecondary,
            }}
          >
            Add an extra layer of security by requiring a code from your authenticator app when you
            sign in.
          </p>
          <button
            disabled={busy}
            style={{
              ...btnBase,
              background: currentTheme.colors.accent,
              color: '#fff',
              opacity: busy ? 0.6 : 1,
            }}
            onClick={handleSetup}
          >
            {busy ? 'Starting…' : 'Set up 2FA'}
          </button>
        </div>
      )}
    </div>
  );
}
