import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../lib/api';

const ShaderAnimation = lazy(() =>
  import('@/components/ui/shader-animation').then((m) => ({ default: m.ShaderAnimation })),
);

const SECRET_CODE = '%62rdn2%';

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [titleNumber, setTitleNumber] = useState(0);

  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState<'code' | 'reset'>('code');
  const [resetCode, setResetCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const titles = useMemo(
    () => ['collaborative', 'organized', 'efficient', 'powerful', 'smart'],
    [],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (titleNumber === titles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('error') === 'school_email_required') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- surfaces OAuth redirect error from query params; behavior-preserving
      setError('Google sign-in is only available for @sekolahkristencalvin.org accounts');
    }
  }, [location.search]);

  useEffect(() => {
    if (api.isAuthenticated()) {
      navigate('/', { replace: true });
      return;
    }

    const token = api.getToken();
    if (token) {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // loginEmail localStorage removed — browser autoComplete="email" handles pre-fill
  // without persisting PII on shared devices.

  useEffect(() => {
    const state = location.state as { email?: string; password?: string; message?: string } | null;
    if (state?.email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefills email from navigation state after password reset; behavior-preserving
      setEmail(state.email);
    }
    if (state?.password) {
      setPassword(state.password);
    }
    if (state?.message) {
      setSuccessMessage(state.message);
    }
  }, [location.state]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.auth.login({ email, password });
      if (response.requires_2fa && response.challenge) {
        setTwoFactorChallenge(response.challenge);
        setTwoFactorCode('');
        return;
      }
      if (response.token) {
        api.setToken(response.token);
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorChallenge) return;
    setError('');
    setIsLoading(true);

    try {
      const response = await api.auth.verify2fa(twoFactorChallenge, twoFactorCode.trim());
      if (response.token) {
        api.setToken(response.token);
        navigate('/', { replace: true });
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackFromTwoFactor = () => {
    setTwoFactorChallenge(null);
    setTwoFactorCode('');
    setError('');
  };

  const handleOpenForgotPassword = () => {
    setShowForgotPassword(true);
    setResetStep('code');
    setResetCode('');
    setResetEmail('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
  };

  const handleCloseForgotPassword = () => {
    setShowForgotPassword(false);
    setResetStep('code');
    setResetCode('');
    setResetEmail('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (resetCode === SECRET_CODE) {
      setResetStep('reset');
    } else {
      setResetError('Invalid code. Please contact an admin for the correct code.');
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!resetEmail) {
      setResetError('Please enter your email');
      return;
    }

    if (!newPassword) {
      setResetError('Please enter a new password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    try {
      setResetLoading(true);
      await api.request('/api/auth/admin-reset-password', {
        method: 'POST',
        body: {
          email: resetEmail,
          newPassword,
        },
      });

      handleCloseForgotPassword();
      setEmail(resetEmail);
      setPassword(newPassword);
      setSuccessMessage('Password reset successful! You can now sign in with your new password.');
    } catch (err: unknown) {
      setResetError(
        err instanceof Error
          ? err.message
          : 'Failed to reset password. Please check your email and try again.',
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      {/* Shader Animation Background */}
      <div className="absolute inset-0 z-0 bg-black">
        <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
          <ShaderAnimation />
        </Suspense>
      </div>

      <div className="container mx-auto px-4 relative z-10 max-h-screen overflow-y-auto">
        <div className="flex gap-4 py-8 items-center justify-center flex-col max-w-4xl mx-auto">
          {/* Animated Hero Header */}
          <div className="flex gap-2 flex-col items-center">
            <h1 className="text-4xl md:text-5xl max-w-3xl tracking-tighter text-center font-regular text-white">
              <span className="block mb-1">NOTARIUM</span>
              <span className="text-2xl md:text-3xl block">
                <span>A library that's</span>
                <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-2 md:pt-1">
                  &nbsp;
                  {titles.map((title, index) => (
                    <motion.span
                      key={index}
                      className="absolute font-semibold text-white"
                      initial={{ opacity: 0, y: '-100' }}
                      transition={{ type: 'spring', stiffness: 50 }}
                      animate={
                        titleNumber === index
                          ? {
                              y: 0,
                              opacity: 1,
                            }
                          : {
                              y: titleNumber > index ? -150 : 150,
                              opacity: 0,
                            }
                      }
                    >
                      {title}
                    </motion.span>
                  ))}
                </span>
              </span>
            </h1>

            <p className="text-sm md:text-base leading-relaxed tracking-tight text-gray-400 max-w-2xl text-center">
              Sign in to access your study materials
            </p>
          </div>

          {/* Login Form Card */}
          <div className="w-full max-w-md">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-lg">
              <h2 className="text-xl font-semibold text-center mb-4 text-white">
                {twoFactorChallenge ? 'Two-Factor Authentication' : 'Welcome Back'}
              </h2>

              {error && (
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-md p-3 mb-4 text-sm">
                  {error}
                </div>
              )}
              {successMessage && !twoFactorChallenge && (
                <div className="bg-green-500/10 text-green-400 border border-green-500/20 rounded-md p-3 mb-4 text-sm">
                  {successMessage}
                </div>
              )}

              {twoFactorChallenge ? (
                <form onSubmit={handleVerify2fa} className="space-y-3">
                  <p className="text-sm text-gray-400">
                    Enter the 6-digit code from your authenticator app, or an 8-digit backup code.
                  </p>
                  <div className="space-y-1">
                    <label htmlFor="twoFactorCode" className="text-sm font-medium text-white">
                      Verification Code
                    </label>
                    <input
                      id="twoFactorCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      placeholder="123456"
                      className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-white/20"
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !twoFactorCode.trim()}
                    className="relative w-full h-12 overflow-hidden rounded-md group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 animate-gradient-xy opacity-80 group-hover:opacity-100 transition-opacity"></div>
                    <div className="absolute inset-0.5 bg-black rounded-md flex items-center justify-center">
                      <span className="relative z-10 text-white font-medium text-base">
                        {isLoading ? 'Verifying...' : 'Verify'}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleBackFromTwoFactor}
                    className="w-full text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    ← Back to sign in
                  </button>
                  <style>{`
                    @keyframes gradient-xy {
                      0%, 100% { background-position: 0% 50%; }
                      50% { background-position: 100% 50%; }
                    }
                    .animate-gradient-xy {
                      background-size: 200% 200%;
                      animation: gradient-xy 3s ease infinite;
                    }
                  `}</style>
                </form>
              ) : (
                <>
                  <form onSubmit={handleEmailLogin} className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="email" className="text-sm font-medium text-white">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="password" className="text-sm font-medium text-white">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 pr-10 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? '👁️' : '👁️‍🗨️'}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="relative w-full h-12 overflow-hidden rounded-md group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 animate-gradient-xy opacity-80 group-hover:opacity-100 transition-opacity"></div>
                      <div className="absolute inset-0.5 bg-black rounded-md flex items-center justify-center">
                        <span className="relative z-10 text-white font-medium text-base">
                          {isLoading ? 'Signing in...' : 'Sign In'}
                        </span>
                      </div>
                    </button>
                    <style>{`
                  @keyframes gradient-xy {
                    0%, 100% {
                      background-position: 0% 50%;
                    }
                    50% {
                      background-position: 100% 50%;
                    }
                  }
                  .animate-gradient-xy {
                    background-size: 200% 200%;
                    animation: gradient-xy 3s ease infinite;
                  }
                `}</style>
                  </form>

                  {/* Forgot Password Link */}
                  <div className="text-center mt-2">
                    <button
                      type="button"
                      onClick={handleOpenForgotPassword}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <p className="text-center text-xs text-gray-400 mt-3">
                    Don't have an account?{' '}
                    <a href="/signup" className="text-white hover:underline font-medium">
                      Sign up
                    </a>
                  </p>

                  <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                    <a
                      href={`${import.meta.env.MODE === 'development' ? 'http://localhost:8787' : import.meta.env.VITE_API_URL || 'https://notarium-backend.notarium-backend.workers.dev'}/auth/google/start?intent=signup`}
                      className="flex items-center justify-center gap-2 w-full py-2 px-3 border border-zinc-700 rounded-md bg-zinc-800 text-white text-sm hover:bg-zinc-700 transition-colors"
                    >
                      <svg
                        width="16"
                        height="16"
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
                      Continue with Google
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div
          className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-5"
          onClick={handleCloseForgotPassword}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 shadow-lg max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-white">Reset Password</h2>
              <button
                onClick={handleCloseForgotPassword}
                className="text-gray-400 hover:text-white text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <p className="text-gray-400 mb-6">
              {resetStep === 'code'
                ? 'Enter the code provided by your admin'
                : 'Enter your email and new password'}
            </p>

            {resetError && (
              <div className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-md p-3 mb-4 text-sm">
                {resetError}
              </div>
            )}

            {/* Step 1: Code Entry */}
            {resetStep === 'code' && (
              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="resetCode" className="text-sm font-medium text-white">
                    Admin Code
                  </label>
                  <input
                    id="resetCode"
                    type="text"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="Enter the code from admin"
                    className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="relative w-full h-12 overflow-hidden rounded-md group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 animate-gradient-xy opacity-80 group-hover:opacity-100 transition-opacity"></div>
                  <div className="absolute inset-0.5 bg-black rounded-md flex items-center justify-center">
                    <span className="relative z-10 text-white font-medium text-base">Continue</span>
                  </div>
                </button>
              </form>
            )}

            {/* Step 2: Password Reset */}
            {resetStep === 'reset' && (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="resetEmail" className="text-sm font-medium text-white">
                    Email
                  </label>
                  <input
                    id="resetEmail"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="newPassword" className="text-sm font-medium text-white">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-3 py-2 pr-10 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      title={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-white">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full px-3 py-2 pr-10 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setResetStep('code')}
                    className="flex-1 h-12 bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700 rounded-md transition-colors font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="relative flex-[2] h-12 overflow-hidden rounded-md group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 animate-gradient-xy opacity-80 group-hover:opacity-100 transition-opacity"></div>
                    <div className="absolute inset-0.5 bg-black rounded-md flex items-center justify-center">
                      <span className="relative z-10 text-white font-medium text-base">
                        {resetLoading ? 'Resetting...' : 'Reset Password'}
                      </span>
                    </div>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
