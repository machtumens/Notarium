import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import '../styles/login.css';

const SECRET_CODE = '%62rdn2%';

export default function PasswordResetPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'code' | 'reset'>('code');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (code === SECRET_CODE) {
      setStep('reset');
    } else {
      setError('Invalid code. Please contact an admin for the correct code.');
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email');
      return;
    }

    if (!newPassword) {
      setError('Please enter a new password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      await api.request('/api/auth/admin-reset-password', {
        method: 'POST',
        body: {
          email,
          newPassword,
        },
      });

      // Success - redirect to login with autofilled password
      navigate('/login', {
        state: {
          email,
          password: newPassword,
          message: 'Password reset successful! You can now login.',
        },
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to reset password. Please check your email and try again.',
      );
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
            {step === 'code'
              ? 'Enter the code provided by your admin'
              : 'Enter your email and new password'}
          </p>

          {error && <div className="login-error">{error}</div>}

          {/* Step 1: Code Entry */}
          {step === 'code' && (
            <form onSubmit={handleCodeSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="code">Admin Code</label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter the code from admin"
                  required
                />
              </div>

              <button type="submit" className="login-button primary">
                Continue
              </button>
            </form>
          )}

          {/* Step 2: Password Reset */}
          {step === 'reset' && (
            <form onSubmit={handlePasswordReset} className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label htmlFor="newPassword">New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    style={{ paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      background: 'none',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      fontSize: '18px',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    style={{ paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      background: 'none',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      fontSize: '18px',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setStep('code')}
                  className="login-button"
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="login-button primary"
                  style={{ flex: 2 }}
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          )}

          <p className="login-footer">
            Remember your password? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
