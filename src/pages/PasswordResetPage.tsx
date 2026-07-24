import { useState } from 'react';
import api from '../lib/api';
import { startGoogleLink } from '../lib/oauth';
import type { ForgotPasswordResponse } from '../types';
import '../styles/login.css';

export default function PasswordResetPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ForgotPasswordResponse | null>(null);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email');
      return;
    }

    try {
      setLoading(true);
      const response = await api.forgotPassword(email);
      setResult(response);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div className="login-wrapper">
        <h1 className="login-title" style={{ animation: 'fadeIn 0.6s ease-out' }}>
          NOTARIUM
        </h1>

        <div className="login-card" style={{ animation: 'scaleIn 0.6s ease-out 0.2s both' }}>
          <h2 className="login-heading">Password Reset</h2>
          <p className="login-subtitle">
            {result
              ? 'Follow the instructions below to regain access'
              : 'Enter your email to recover your account'}
          </p>

          {error && <div className="login-error">{error}</div>}

          {/* Request step */}
          {!result && (
            <form onSubmit={handleForgotPassword} className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              <button type="submit" disabled={loading} className="login-button primary">
                {loading ? 'Please wait...' : 'Recover Account'}
              </button>
            </form>
          )}

          {/* Result: Google recovery */}
          {result && result.recovery === 'google' && (
            <div className="login-form">
              <p style={{ color: '#ccc', fontSize: '14px', lineHeight: 1.5 }}>{result.message}</p>
              <button
                type="button"
                onClick={() => startGoogleLink('signup')}
                className="login-button primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Sign in with Google
              </button>
            </div>
          )}

          {/* Result: no recovery */}
          {result && result.recovery === 'none' && (
            <div className="login-form">
              <p style={{ color: '#ccc', fontSize: '14px', lineHeight: 1.5 }}>{result.message}</p>
            </div>
          )}

          <p className="login-footer">
            Remember your password? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
