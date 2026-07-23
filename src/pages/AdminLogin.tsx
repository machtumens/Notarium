import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { darkTheme } from '../theme';

export default function AdminLogin() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (api.isAuthenticated()) {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.auth.adminLogin({ token });
      if (response.token) {
        api.setToken(response.token);
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid token');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: darkTheme.colors.bgPrimary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>

      <h1
        style={{
          fontSize: '36px',
          fontFamily: 'Playfair Display, serif',
          fontWeight: 'bold',
          marginBottom: '40px',
          color: darkTheme.colors.textPrimary,
          animation: 'fadeIn 0.6s ease-out',
        }}
      >
        Notarium<span style={{ color: darkTheme.colors.accent }}>.Admin</span>
      </h1>

      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          background: darkTheme.colors.bgSecondary,
          border: `1px solid ${darkTheme.colors.borderColor}`,
          borderRadius: darkTheme.borderRadius.lg,
          padding: '40px',
          animation: 'scaleIn 0.6s ease-out 0.2s both',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            marginBottom: '8px',
            color: darkTheme.colors.textPrimary,
          }}
        >
          Admin Access
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: darkTheme.colors.textSecondary,
            marginBottom: '24px',
          }}
        >
          Enter your admin token to continue
        </p>

        {error && (
          <div
            style={{
              background: '#3b2a2a',
              border: `1px solid ${darkTheme.colors.danger}`,
              color: darkTheme.colors.danger,
              padding: '12px',
              borderRadius: darkTheme.borderRadius.md,
              marginBottom: '20px',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                color: darkTheme.colors.textPrimary,
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••••••••••"
              required
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                background: darkTheme.colors.bgPrimary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: darkTheme.borderRadius.md,
                color: darkTheme.colors.textPrimary,
                fontSize: '14px',
                boxSizing: 'border-box',
                transition: darkTheme.transitions.default,
                outline: 'none',
                fontFamily: 'monospace',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = darkTheme.colors.borderColor)}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: darkTheme.colors.accent,
              border: 'none',
              color: 'white',
              borderRadius: darkTheme.borderRadius.md,
              fontSize: '14px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: darkTheme.transitions.default,
              opacity: isLoading ? 0.7 : 1,
            }}
            onMouseOver={(e) => !isLoading && (e.currentTarget.style.background = '#ff9800')}
            onMouseOut={(e) =>
              !isLoading && (e.currentTarget.style.background = darkTheme.colors.accent)
            }
          >
            {isLoading ? 'Verifying...' : 'Enter'}
          </button>
        </form>

        <div
          style={{
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: `1px solid ${darkTheme.colors.borderColor}`,
            textAlign: 'center',
          }}
        >
          <a
            href="/login"
            style={{
              color: darkTheme.colors.accent,
              textDecoration: 'none',
              fontSize: '14px',
              transition: darkTheme.transitions.default,
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Student Login
          </a>
        </div>
      </div>
    </div>
  );
}
