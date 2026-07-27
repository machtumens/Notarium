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
  ChatPage,
  AdminPage,
  OpsDashboard,
} from './lazyPages';

// Placeholder route for the upcoming Tests/quiz feature. Renders a "Coming soon"
// panel rather than a blank screen (Paperloop Phase 1; the real quiz/test
// simulator lands in a later phase).
function ComingSoonPage() {
  return (
    <div
      style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: '80px 24px',
        textAlign: 'center',
        color: '#94a3b8',
      }}
    >
      <div style={{ fontSize: '56px', marginBottom: '16px' }}>🧪</div>
      <h1 style={{ fontSize: '26px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#f1f5f9' }}>
        Tests are coming soon
      </h1>
      <p style={{ fontSize: '15px', margin: 0 }}>
        Quizzes and the test simulator are on the way. Keep your streak alive with Review in the
        meantime.
      </p>
    </div>
  );
}

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
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/quiz" element={<ComingSoonPage />} />
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
