import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';
import { getGoogleLinkStatus, startGoogleLink, disconnectGoogle } from '../../lib/oauth';

const SCOPE_NAMES: Record<string, string> = {
  openid: 'Basic Profile',
  email: 'Basic Profile',
  profile: 'Basic Profile',
  'https://www.googleapis.com/auth/classroom.courses.readonly': 'Classroom Courses',
  'https://www.googleapis.com/auth/classroom.coursework.students': 'Coursework',
  'https://www.googleapis.com/auth/classroom.rosters.readonly': 'Class Roster',
  'https://www.googleapis.com/auth/drive.file': 'Google Drive',
  'https://www.googleapis.com/auth/documents': 'Google Docs',
};

function humanScopes(scopes: string[]): string[] {
  const seen = new Set<string>();
  return scopes.reduce<string[]>((acc, s) => {
    const name = SCOPE_NAMES[s];
    if (name && !seen.has(name)) {
      seen.add(name);
      acc.push(name);
    }
    return acc;
  }, []);
}

export default function GoogleLinkCard() {
  const { currentTheme } = useTheme();
  const [linked, setLinked] = useState(false);
  const [scopes, setScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('google');
    if (status === 'ok') {
      toast.success('Google account connected');
    } else if (status === 'error') {
      toast.error(`Google connection failed: ${params.get('reason') ?? 'unknown'}`);
    }
    if (status) {
      params.delete('google');
      params.delete('reason');
      history.replaceState(null, '', params.size ? `?${params}` : window.location.pathname);
    }
  }, []);

  useEffect(() => {
    getGoogleLinkStatus()
      .then(({ linked: l, scopes: s }) => {
        setLinked(l);
        setScopes(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogle();
      setLinked(false);
      setScopes([]);
      toast.success('Google account disconnected');
    } catch {
      toast.error('Failed to disconnect Google account');
    } finally {
      setBusy(false);
    }
  };

  const featureEnabled = import.meta.env.VITE_FEATURE_GOOGLE_OAUTH === 'true';

  const cardStyle: React.CSSProperties = {
    background: currentTheme.colors.bgSecondary,
    border: `1px solid ${currentTheme.colors.borderColor}`,
    borderRadius: currentTheme.borderRadius.lg,
    padding: '20px',
    opacity: featureEnabled ? 1 : 0.5,
    cursor: featureEnabled ? 'default' : 'not-allowed',
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

  if (!featureEnabled) {
    return (
      <div style={cardStyle} title="Coming soon — pending Google verification">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }}>🔗</span>
          <span style={{ fontWeight: '700', color: currentTheme.colors.textPrimary }}>
            Google Account
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: currentTheme.colors.textSecondary }}>
          Coming soon — pending Google verification
        </p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '20px' }}>🔗</span>
        <span
          style={{ fontWeight: '700', fontSize: '15px', color: currentTheme.colors.textPrimary }}
        >
          Google Account
        </span>
        {!loading && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '11px',
              fontWeight: '600',
              padding: '2px 10px',
              borderRadius: '9999px',
              background: linked ? 'rgba(74, 222, 128, 0.15)' : 'rgba(148, 163, 184, 0.15)',
              color: linked ? currentTheme.colors.success : currentTheme.colors.textSecondary,
            }}
          >
            {linked ? 'Connected' : 'Not connected'}
          </span>
        )}
      </div>

      {loading ? (
        <p
          style={{ margin: '0 0 12px', fontSize: '13px', color: currentTheme.colors.textSecondary }}
        >
          Loading…
        </p>
      ) : linked && scopes.length > 0 ? (
        <div style={{ marginBottom: '12px' }}>
          <p
            style={{
              margin: '0 0 6px',
              fontSize: '12px',
              color: currentTheme.colors.textSecondary,
            }}
          >
            Permissions granted:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {humanScopes(scopes).map((name) => (
              <span
                key={name}
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: currentTheme.colors.accent,
                  border: `1px solid rgba(59, 130, 246, 0.2)`,
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : !linked ? (
        <p
          style={{ margin: '0 0 12px', fontSize: '13px', color: currentTheme.colors.textSecondary }}
        >
          Connect your Google account to enable Classroom and Docs integration.
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {!linked ? (
          <>
            <button
              style={{ ...btnBase, background: currentTheme.colors.accent, color: '#fff' }}
              onClick={() => startGoogleLink('classroom')}
            >
              Connect (Classroom)
            </button>
            <button
              style={{
                ...btnBase,
                background: currentTheme.colors.bgTertiary,
                color: currentTheme.colors.textPrimary,
                border: `1px solid ${currentTheme.colors.borderColor}`,
              }}
              onClick={() => startGoogleLink('docs')}
            >
              Connect (Docs)
            </button>
          </>
        ) : (
          <>
            <button
              style={{
                ...btnBase,
                background: currentTheme.colors.bgTertiary,
                color: currentTheme.colors.textPrimary,
                border: `1px solid ${currentTheme.colors.borderColor}`,
              }}
              onClick={() => startGoogleLink('classroom')}
            >
              Reauthorise
            </button>
            <button
              disabled={busy}
              style={{
                ...btnBase,
                background: currentTheme.colors.danger,
                color: '#fff',
                opacity: busy ? 0.6 : 1,
              }}
              onClick={handleDisconnect}
            >
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
