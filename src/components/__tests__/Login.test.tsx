// Login page — auth entry point. The api client is mocked so we assert the
// component's behaviour (submit -> token stored -> redirect, error surfaced,
// 2FA challenge branch, already-authenticated short-circuit) without a network.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// vi.hoisted so the object exists when the hoisted vi.mock factory runs.
const api = vi.hoisted(() => ({
  isAuthenticated: vi.fn(() => false),
  getToken: vi.fn((): string | null => null),
  setToken: vi.fn(),
  auth: {
    login: vi.fn(),
    verify2fa: vi.fn(),
  },
}));

vi.mock('../../lib/api', () => ({ default: api }));
vi.mock('@/components/ui/shader-animation', () => ({ ShaderAnimation: () => null }));

import Login from '../../pages/Login';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>HOME PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.isAuthenticated.mockReturnValue(false);
  api.getToken.mockReturnValue(null);
});

describe('Login page', () => {
  it('renders the email and password fields', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('submitting valid credentials stores the token and redirects home', async () => {
    api.auth.login.mockResolvedValue({ token: 'jwt-abc' });
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'stu@sekolahkristencalvin.org' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(api.auth.login).toHaveBeenCalledWith({
        email: 'stu@sekolahkristencalvin.org',
        password: 'Secret123',
      }),
    );
    await waitFor(() => expect(api.setToken).toHaveBeenCalledWith('jwt-abc'));
    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument();
  });

  it('surfaces the server error message and does NOT store a token on failure', async () => {
    api.auth.login.mockRejectedValue(new Error('Invalid credentials'));
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'stu@sekolahkristencalvin.org' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(api.setToken).not.toHaveBeenCalled();
    expect(screen.queryByText('HOME PAGE')).not.toBeInTheDocument();
  });

  it('a 2FA challenge switches to the code step instead of logging in', async () => {
    api.auth.login.mockResolvedValue({ requires_2fa: true, challenge: 'chal-1' });
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'stu@sekolahkristencalvin.org' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // 2FA code input (placeholder "123456") appears; no token stored yet.
    expect(await screen.findByPlaceholderText('123456')).toBeInTheDocument();
    expect(api.setToken).not.toHaveBeenCalled();
  });

  it('an already-authenticated visitor is redirected away from /login', async () => {
    api.isAuthenticated.mockReturnValue(true);
    api.getToken.mockReturnValue('existing-jwt');
    renderLogin();
    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument();
  });
});
