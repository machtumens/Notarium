import api from './api';

export type GoogleIntent = 'signup' | 'classroom' | 'docs';

const API_BASE =
  import.meta.env.MODE === 'development'
    ? 'http://localhost:8787'
    : import.meta.env.VITE_API_URL || 'https://notarium-backend.notarium-backend.workers.dev';

export function startGoogleLink(intent: GoogleIntent, redirectTo?: string) {
  const params = new URLSearchParams({ intent });
  if (redirectTo) params.set('redirect_to', redirectTo);
  window.location.href = `${API_BASE}/auth/google/start?${params}`;
}

export async function disconnectGoogle(): Promise<void> {
  await api.request('/auth/google/disconnect', { method: 'POST' });
}

export async function getGoogleLinkStatus(): Promise<{ linked: boolean; scopes: string[] }> {
  return api.request<{ linked: boolean; scopes: string[] }>('/auth/google/status');
}
