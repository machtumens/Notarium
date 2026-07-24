// AdminRoute — client-side RBAC gate (canModerate). Students and technical-only
// admins must be bounced to /login; super/moderator admins get through.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminRoute } from '../AdminRoute';
import { AuthContext } from '../../AuthContext';
import type { AuthContextType } from '../../types';

function renderGate(auth: Partial<AuthContextType>) {
  const value = {
    user: null,
    loading: false,
    refreshUser: async () => {},
    ...auth,
  } as AuthContextType;
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <div>ADMIN DASHBOARD</div>
              </AdminRoute>
            }
          />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('AdminRoute', () => {
  it('bounces a student to /login', () => {
    renderGate({ user: { id: 1, role: 'student' } as any });
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN DASHBOARD')).not.toBeInTheDocument();
  });

  it('bounces a technical-only admin (canModerate=false) to /login', () => {
    renderGate({ user: { id: 1, role: 'admin', admin_role: 'technical' } as any });
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('admits a super admin', () => {
    renderGate({ user: { id: 1, role: 'admin', admin_role: 'super' } as any });
    expect(screen.getByText('ADMIN DASHBOARD')).toBeInTheDocument();
  });

  it('admits a moderator', () => {
    renderGate({ user: { id: 1, role: 'admin', admin_role: 'moderator' } as any });
    expect(screen.getByText('ADMIN DASHBOARD')).toBeInTheDocument();
  });
});
