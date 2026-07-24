import { Navigate } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../AuthContext';
import { canOps } from '../roles';

export function OpsRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!canOps(user)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
