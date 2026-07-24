// Signup page — client-side validation gates (school-domain, password match)
// before any network call. api.request is mocked; the validation branches must
// fire without ever hitting it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// vi.hoisted so the object exists when the hoisted vi.mock factory runs.
const api = vi.hoisted(() => ({
  isAuthenticated: vi.fn(() => false),
  setToken: vi.fn(),
  request: vi.fn(),
  getGradeClasses: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../../lib/api', () => ({ default: api }));
vi.mock('@/components/ui/shader-animation', () => ({ ShaderAnimation: () => null }));

import Signup from '../Signup';

function renderSignup() {
  return render(
    <MemoryRouter>
      <Signup />
    </MemoryRouter>,
  );
}

// Submit the form directly. A button click is blocked by the browser's native
// constraint validation (the required grade/class selects are empty in these
// validation-only tests), so we dispatch submit to reach the JS handler that
// does the school-domain + password-match checks.
function submitForm() {
  const form = screen.getByRole('button', { name: /sign up/i }).closest('form');
  fireEvent.submit(form!);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.isAuthenticated.mockReturnValue(false);
});

describe('Signup page', () => {
  it('renders the core account fields', () => {
    renderSignup();
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('School Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('rejects a non-school email before calling the API', async () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Mal Lory' } });
    fireEvent.change(screen.getByLabelText('School Email'), {
      target: { value: 'attacker@gmail.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ValidPass123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'ValidPass123' },
    });
    submitForm();

    expect(await screen.findByText(/only .* email addresses are allowed/i)).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords before calling the API', async () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Stu Dent' } });
    fireEvent.change(screen.getByLabelText('School Email'), {
      target: { value: 'stu@sekolahkristencalvin.org' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ValidPass123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'Different456' },
    });
    submitForm();

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  });
});
