// ProtectedRoute — the client-side auth gate. Drives it through a real
// AuthContext.Provider + a small route table so we can observe the redirect
// target (Navigate) instead of mocking react-router internals.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';
import { AuthContext } from '../../AuthContext';
import type { AuthContextType } from '../../types';

function renderGate(auth: Partial<AuthContextType>) {
  const value: AuthContextType = {
    user: null,
    loading: false,
    refreshUser: async () => {},
    ...auth,
  } as AuthContextType;
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>SECRET CONTENT</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route path="/suspended" element={<div>SUSPENDED PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading state while auth is resolving (no leak of protected content)', () => {
    renderGate({ loading: true });
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor to /login', () => {
    renderGate({ user: null, loading: false });
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument();
  });

  it('renders the protected content for an authenticated user', () => {
    renderGate({ user: { id: 1, role: 'student' } as any, loading: false });
    expect(screen.getByText('SECRET CONTENT')).toBeInTheDocument();
  });

  it('routes a suspended user to /suspended, never to the protected content', () => {
    renderGate({
      user: { id: 1, role: 'student', suspended: 1, suspension_end_date: '2099-01-01' } as any,
      loading: false,
    });
    expect(screen.getByText('SUSPENDED PAGE')).toBeInTheDocument();
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument();
  });
});
