import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { AppShell } from '../components/AppShell';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AdminRoute } from './routes/AdminRoute';
import { OpsRoute } from './routes/OpsRoute';
import { CommunityRoute, ProgressRoute } from './routes/ShellPageRoutes';
import { ReviewPageRoute } from './ReviewPageRoute';
import {
  TodayPage,
  Login,
  AdminLogin,
  Signup,
  Suspended,
  PasswordResetPage,
  AuthCallback,
  SettingsPage,
  MyNotesPage,
  SubjectNotesPage,
  AdminPage,
  OpsDashboard,
  ProcessPage,
  CaptureNotePage,
  QuizBuilderPage,
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
        {/* Public / auth routes (no shell) */}
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/suspended" element={<Suspended />} />
        <Route path="/pwd-reset" element={<PasswordResetPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Standalone protected routes (no shell) */}
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
          path="/notes/capture"
          element={
            <ProtectedRoute>
              <CaptureNotePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes/:id/process"
          element={
            <ProtectedRoute>
              <ProcessPage />
            </ProtectedRoute>
          }
        />

        {/* Shell layout route — all content pages render inside AppShell via <Outlet /> */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<TodayPage />} />
          <Route path="/community" element={<CommunityRoute />} />
          <Route path="/community/:subjectId" element={<SubjectNotesPage />} />
          <Route path="/progress" element={<ProgressRoute />} />
          <Route path="/quiz" element={<QuizBuilderPage />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
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
        </Route>
      </Routes>
    </Suspense>
  );
}
