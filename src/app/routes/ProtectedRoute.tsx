import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../lib/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getCurrentTheme } from '../../theme';
import { useAuth } from '../AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const loadingTheme = getCurrentTheme();

  useEffect(() => {
    if (!user && !loading && api.isAuthenticated()) {
      refreshUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: loadingTheme.colors.bgPrimary,
          color: loadingTheme.colors.textPrimary,
        }}
      >
        <LoadingSpinner message="Loading your workspace..." size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.suspended && user.suspension_end_date) {
    return <Navigate to="/suspended" replace />;
  }

  return <>{children}</>;
}
