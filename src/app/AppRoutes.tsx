import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { OpsRoute } from './routes/OpsRoute';
import { HomePage } from './HomePage';
import { ReviewPageRoute } from './ReviewPageRoute';
import {
  Login,
  AdminLogin,
  Signup,
  Suspended,
  PasswordResetPage,
  AuthCallback,
  SettingsPage,
  MyNotesPage,
  OpsDashboard,
} from './lazyPages';

export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0f',
            color: '#fff',
          }}
        >
          <LoadingSpinner message="Loading..." size="lg" />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/suspended" element={<Suspended />} />
        <Route path="/pwd-reset" element={<PasswordResetPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-notes"
          element={
            <ProtectedRoute>
              <MyNotesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/review"
          element={
            <ProtectedRoute>
              <ReviewPageRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ops"
          element={
            <OpsRoute>
              <OpsDashboard />
            </OpsRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
