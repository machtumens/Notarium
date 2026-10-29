/** Runs before every test file: jest-dom matchers, DOM cleanup, fresh storage, and the browser APIs jsdom lacks. */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { getCache } from '@/lib/api';

// Without `globals: true` Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  getCache.clear();
});

// jsdom has no ResizeObserver; Home measures its grid with one. A no-op keeps the initial width.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis))
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
