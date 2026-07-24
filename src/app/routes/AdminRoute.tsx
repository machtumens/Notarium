import { Navigate } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../AuthContext';
import { canModerate } from '../roles';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!canModerate(user)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
