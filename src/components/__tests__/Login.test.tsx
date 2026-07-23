import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../../pages/Login';

vi.mock('@/components/ui/shader-animation', () => ({
  ShaderAnimation: () => null,
}));

vi.mock('../../lib/api', () => ({
  default: {
    isAuthenticated: () => false,
  },
}));

describe('Login page', () => {
  it('renders email and password fields', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
