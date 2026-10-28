import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HorizonGlow } from '@/components/backgrounds/horizon-glow';
import { AppProvider, useApp } from '@/store';

/**
 * W5.2: the canvas honours `prefers-reduced-motion`. jsdom has no matchMedia, no layout and no 2D
 * context, so all three are faked: a MediaQueryList whose `matches` the test flips, a 320×120 canvas,
 * and a context that only records `fillRect` (the `Off` background paints one flat fill per frame).
 * rAF is a stub that never runs its callback, so every fill on record is the one still frame.
 */
type Listener = (e: { matches: boolean }) => void;
const mql = {
  matches: false,
  media: '(prefers-reduced-motion: reduce)',
  listeners: new Set<Listener>(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
const ctx = {
  fillRect: vi.fn(),
  setTransform: vi.fn(),
  fillStyle: '',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
};
const raf = vi.fn(() => 7);
const caf = vi.fn();

beforeEach(() => {
  mql.matches = false;
  mql.listeners.clear();
  mql.addEventListener.mockReset().mockImplementation((_: string, cb: Listener) => {
    mql.listeners.add(cb);
  });
  mql.removeEventListener.mockReset().mockImplementation((_: string, cb: Listener) => {
    mql.listeners.delete(cb);
  });
  ctx.fillRect.mockReset();
  ctx.setTransform.mockReset();
  raf.mockClear();
  caf.mockClear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 320,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 120,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLCanvasElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLCanvasElement.prototype as { clientHeight?: number }).clientHeight;
});

/** Switches the store to the flat `Off` background before the canvas mounts, so a frame is exactly one fillRect. */
function Flat() {
  const { bgMode, set } = useApp();
  // `set` is a fresh closure after every store write, so guard on the value or the effect would loop.
  useEffect(() => {
    if (bgMode !== 'Off') set({ bgMode: 'Off' });
  }, [bgMode, set]);
  return bgMode === 'Off' ? <HorizonGlow /> : null;
}
const flip = (matches: boolean) =>
  act(() => {
    mql.matches = matches;
    mql.listeners.forEach((cb) => cb({ matches }));
  });

describe('HorizonGlow and prefers-reduced-motion (W5.2)', () => {
  it('paints one still frame and never starts the animation loop when motion is reduced', () => {
    mql.matches = true;
    render(
      <AppProvider>
        <Flat />
      </AppProvider>,
    );
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(raf).not.toHaveBeenCalled();
  });

  it('animates when motion is allowed, drops to a still frame when the preference flips, and resumes when it flips back', () => {
    const view = render(
      <AppProvider>
        <Flat />
      </AppProvider>,
    );
    expect(raf).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).not.toHaveBeenCalled();

    flip(true);
    expect(caf).toHaveBeenCalledWith(7);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);

    flip(false);
    expect(raf).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(mql.removeEventListener).toHaveBeenCalledTimes(mql.addEventListener.mock.calls.length);
    expect(mql.listeners.size).toBe(0);
  });
});
